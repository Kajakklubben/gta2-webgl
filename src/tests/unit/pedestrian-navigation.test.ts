import { describe, expect, it } from 'vitest';
import type { Block, Face, GameMap } from '../../shared/engine/loader/map-parser';
import { PedestrianNavigation } from '../../shared/domain/pedestrians/pedestrian-navigation';
import { PedestrianSpawner } from '../../shared/domain/pedestrians/pedestrian-spawner';
import { CIVILIAN_PED_REMAPS } from '../../shared/domain/pedestrians/pedestrian-appearance';
import { updatePedestrianAi } from '../../shared/domain/pedestrians/ai';
import { newCombat } from '../../shared/domain/combat/weapons';
import { sourceAngleToRadians } from '../../shared/domain/physics/motion-vector';
import { sourceFixedRawPerTickToWorld, WORLD } from '../../shared/domain/world/world';
import type { NpcState, PlayerState, TrafficState } from '../../shared/protocol/types';
import { GameWorld } from '../../shared/game/game-world';
import { npcDefaults } from './fixtures';

const face = (wall = false): Face => ({ tileNumber: 1, flat: true, flip: false, rotation: 0, wall, bulletWall: wall });
const block = (walls: Partial<Record<'Left' | 'Right' | 'Top' | 'Bottom', boolean>> = {}, groundType = 2): Block => ({
  Left: face(walls.Left), Right: face(walls.Right), Top: face(walls.Top), Bottom: face(walls.Bottom),
  Lid: face(), slopeType: 0, groundType, arrows: 0,
});
const playerDefaults = { name: 'Player', color: 0, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0 } as const;

function level(width: number, blocked = false) {
  const map: (Block | undefined)[][][] = Array.from({ length: width }, (_, x) => [[block({ Right: blocked && x === 0, Left: blocked && x === 1 })]]);
  return { map, objects: [], zones: [], animations: [], lights: [], roads: [], traffic: { roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [] }, format: 'UMAP' } as GameMap;
}

describe('pedestrian navigation', () => {
  it('builds walkable block nodes and finds an adjacent path', () => {
    const navigation = new PedestrianNavigation(level(3));
    expect(navigation.nodes).toHaveLength(3);
    const path = navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 128, y: 0, z: 1 });
    expect(path).toHaveLength(3);
    expect(navigation.node(path[0]!)?.x).toBe(0);
    expect(navigation.node(path[2]!)?.x).toBe(2);
    expect(navigation.neighborsOf(999)).toEqual([]);
  });

  it('does not cross a blocked shared face', () => {
    const navigation = new PedestrianNavigation(level(3, true));
    expect(navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 128, y: 0, z: 1 })).toEqual([]);
  });

  it('does not build air or water blocks into the pedestrian graph', () => {
    const map = level(3);
    map.map[1]![0]![0]!.groundType = 0;
    const navigation = new PedestrianNavigation(map);
    expect(navigation.nodes.some(node => node.x === 1)).toBe(false);
    expect(navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 128, y: 0, z: 1 })).toEqual([]);
    expect(navigation.isNonAirAt({ x: 64, y: 0, z: 1 })).toBe(false);
  });

  it('classifies the authored water lid tile independently of ground type', () => {
    const map = level(4);
    map.map[1]![0]![0]!.groundType = 0;
    map.map[1]![0]![0]!.Lid.tileNumber = 0;
    map.map[2]![0]![0]!.groundType = 0;
    map.map[2]![0]![0]!.Lid.tileNumber = 608;
    map.map[3]![0]![0]!.groundType = 3;
    map.map[3]![0]![0]!.Lid.tileNumber = 608;
    map.map[3]![0]!.push(block());
    const navigation = new PedestrianNavigation(map);

    expect(navigation.isWaterAt({ x: 64, y: 0, z: 1 })).toBe(false);
    expect(navigation.isWaterAt({ x: 128, y: 0, z: 1 })).toBe(true);
    expect(navigation.isWaterAt({ x: 192, y: 0, z: 1 })).toBe(true);
  });

  it('uses the first non-air block as the source-style surface', () => {
    const map = level(2);
    map.map[0]![0]!.push(block({}, 0));
    map.map[1]![0] = [block(), block({}, 1)];
    const navigation = new PedestrianNavigation(map);
    expect(navigation.isPavementAt({ x: 0, y: 0, z: 1 })).toBe(true);
    expect(navigation.isPavementAt({ x: 64, y: 0, z: 1 })).toBe(false);
    expect(navigation.nodes.filter(node => node.x === 1).every(node => !node.isPavement)).toBe(true);
  });

  it('keeps ordinary civilian paths off road nodes', () => {
    const map = level(3);
    map.map[1]![0]![0]!.groundType = 1;
    const navigation = new PedestrianNavigation(map);
    expect(navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 128, y: 0, z: 1 }, { avoidRoads: true })).toEqual([]);
    expect(navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 128, y: 0, z: 1 })).toHaveLength(3);
  });

  it('classifies road surfaces independently of the traffic arrow graph', () => {
    const map = level(12);
    map.map[5]![0]![0]!.groundType = 1;
    map.map[6]![0]![0]!.arrows = 1;
    const navigation = new PedestrianNavigation(map);
    expect(navigation.node(5)?.isRoad).toBe(true);
    expect(navigation.node(5)?.isPavement).toBe(false);
    expect(navigation.node(0)?.isRoad).toBe(false);
    expect(navigation.node(0)?.isPavement).toBe(true);
    const spawned = new PedestrianSpawner(navigation).spawnAround({ x: 0, y: 0, z: 1 }, 1, [], 0);
    expect(spawned).toHaveLength(1);
    expect(Math.round(spawned[0]!.x / 64)).not.toBe(5);
  });

  it('does not spawn civilians on roads when no pavement is available', () => {
    const map = level(12);
    for (let x = 4; x < 12; x++) map.map[x]![0]![0]!.groundType = 1;
    const navigation = new PedestrianNavigation(map);
    const spawned = new PedestrianSpawner(navigation).spawnAround({ x: 0, y: 0, z: 1 }, 1, [], 0);
    expect(spawned).toEqual([]);
  });

  it('allows a fleeing civilian to cross onto a road node', () => {
    const map = level(4);
    map.map[2]![0]![0]!.groundType = 1;
    const navigation = new PedestrianNavigation(map);
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 64, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 0, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() };

    updatePedestrianAi({ npcs: [npc], players: [player], navigation, dt: 1 / 30, tick: 0 });

    expect(npc.state).toBe('flee');
    expect(npc.pathGoal?.nodeId).toBe(2);
    expect(npc.crossingRoad).toBe(true);
    expect(npc.x).toBeGreaterThan(64);
  });

  it('allows diagonal movement only when both cardinal legs are clear', () => {
    const map = level(2);
    map.map[0]!.push([block()]);
    map.map[1]!.push([block()]);
    const navigation = new PedestrianNavigation(map);
    const path = navigation.findPath({ x: 0, y: 0, z: 1 }, { x: 64, y: -64, z: 1 });
    expect(path).toHaveLength(2);
  });

  it('spawns outside the player exclusion radius on a walkable node', () => {
    const navigation = new PedestrianNavigation(level(12));
    const npc = new PedestrianSpawner(navigation).spawnAround({ x: 0, y: 0, z: 1 }, 1, [], 0);
    expect(npc).toHaveLength(1);
    const spawnedNpc = npc[0]!;
    expect(spawnedNpc).toMatchObject({ id: 1, health: 100, state: 'idle', animation: 'idle' });
    if (spawnedNpc.kind === 'civilian') expect(CIVILIAN_PED_REMAPS).toContain(spawnedNpc.remap);
    expect(spawnedNpc.patrolRoute).toBeUndefined();
    expect(spawnedNpc.path).toBeUndefined();
    expect(spawnedNpc.pathGoal).toBeUndefined();
    expect(Math.hypot(spawnedNpc.x, spawnedNpc.y)).toBeGreaterThanOrEqual(320);
  });

  it('computes and follows a temporary path for an explicit patrol objective', () => {
    const navigation = new PedestrianNavigation(level(4));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian',
      state: 'idle', animation: 'idle', patrolRoute: [2], patrolPointIndex: 0,
    };
    updatePedestrianAi({ npcs: [npc], players: [], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.state).toBe('walk');
    expect(npc.path).toEqual([1, 2]);
    expect(npc.pathPointIndex).toBe(1);
    expect(npc.pathGoal?.nodeId).toBe(2);
    expect(npc.pathGoal?.x).toBe(128);
    expect(Math.abs(npc.pathGoal?.y ?? 1)).toBe(0);
    expect(npc.pathIndex).toBe(2);
    expect(npc.vx).toBeGreaterThan(0);
    expect(npc.rotation).toBeCloseTo(Math.PI * 2 - sourceAngleToRadians(96));
    expect(npc.vy).toBeGreaterThan(0);
    expect(Math.hypot(npc.vx, npc.vy)).toBeCloseTo(WORLD.traffic.civilianSpeed * WORLD.tileSize);
  });

  it('keeps an ordinary civilian strolling locally without inventing a goal', () => {
    const navigation = new PedestrianNavigation(level(4));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 64, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100, kind: 'civilian',
      state: 'idle', animation: 'idle',
    };
    updatePedestrianAi({ npcs: [npc], players: [], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.state).toBe('walk');
    expect(npc.animation).toBe('walking');
    expect(npc.vx).toBeGreaterThan(0);
    expect(npc.path).toBeUndefined();
    expect(npc.pathGoal).toBeUndefined();
  });

  it('scares a civilian from a nearby armed player before the first shot', () => {
    const navigation = new PedestrianNavigation(level(8));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 192, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() };

    updatePedestrianAi({ npcs: [npc], players: [player], navigation, dt: 1 / 30, tick: 0 });

    expect(npc.state).toBe('flee');
    expect(npc.animation).toBe('running');
    expect(npc.target).toBe('player');
    expect(Math.hypot(npc.vx, npc.vy)).toBeCloseTo(sourceFixedRawPerTickToWorld(WORLD.player.source.runSpeed));
  });

  it('turns a running civilian by the source heading step without vector acceleration', () => {
    const navigation = new PedestrianNavigation(level(8));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 192, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() };

    updatePedestrianAi({ npcs: [npc], players: [player], navigation, dt: 1 / 30, tick: 0 });

    expect(npc.state).toBe('flee');
    expect(npc.rotation).toBeCloseTo(Math.PI * 2 - sourceAngleToRadians(48));
    expect(npc.vx).toBeGreaterThan(0);
    expect(npc.vy).toBeGreaterThan(0);
    expect(Math.hypot(npc.vx, npc.vy)).toBeCloseTo(sourceFixedRawPerTickToWorld(WORLD.player.source.runSpeed));
  });

  it('does not scare civilians from a parked player car, but does from a fast car', () => {
    const navigation = new PedestrianNavigation(level(8));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 192, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, vehicleId: 7, combat: newCombat() };
    const car: TrafficState = { id: 7, x: 64, y: 0, z: 1, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, passengers: ['player'], occupants: [], doorStates: [] };

    updatePedestrianAi({ npcs: [npc], players: [player], traffic: [car], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.state).not.toBe('flee');

    car.speed = 70;
    car.vx = 70;
    updatePedestrianAi({ npcs: [npc], players: [player], traffic: [car], navigation, dt: 1 / 30, tick: 1 });
    expect(npc.state).toBe('flee');
    expect(npc.target).toBe('player');
  });

  it('does not scare civilians from a fast player car while it is on a road', () => {
    const map = level(8);
    map.map[1]![0]![0]!.groundType = 1;
    const navigation = new PedestrianNavigation(map);
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 192, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, vehicleId: 7, combat: newCombat() };
    const car: TrafficState = { id: 7, x: 64, y: 0, z: 1, rotation: 0, speed: 70, vx: 70, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, passengers: ['player'], occupants: [], doorStates: [] };

    updatePedestrianAi({ npcs: [npc], players: [player], traffic: [car], navigation, dt: 1 / 30, tick: 0 });

    expect(npc.state).not.toBe('flee');
    expect(npc.target).toBeUndefined();
  });

  it('keeps the flee objective briefly after the threat lowers its weapon', () => {
    const navigation = new PedestrianNavigation(level(10));
    const npc: NpcState = {
      ...npcDefaults(),
      id: 1, x: 192, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100,
      kind: 'civilian', state: 'idle', animation: 'idle',
    };
    const combat = newCombat();
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat };

    updatePedestrianAi({ npcs: [npc], players: [player], navigation, dt: 1 / 30, tick: 0 });
    combat.ammo[combat.weapon] = 0;
    updatePedestrianAi({ npcs: [npc], players: [player], navigation, dt: 1 / 30, tick: 1 });

    expect(npc.state).toBe('flee');
    expect(npc.target).toBe('player');
  });

  it('walks through another civilian without steering around them', () => {
    const navigation = new PedestrianNavigation(level(5));
    const left: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: -Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle', patrolRoute: [3] };
    const right: NpcState = { ...npcDefaults(), id: 2, x: 192, y: 0, z: 1, rotation: Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle', patrolRoute: [1] };
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let tick = 0; tick < 90; tick++) {
      updatePedestrianAi({ npcs: [left, right], players: [], navigation, dt: 1 / 30, tick });
      minimumDistance = Math.min(minimumDistance, Math.hypot(left.x - right.x, left.y - right.y));
    }
    expect(minimumDistance).toBeLessThan(23.5);
    expect(Math.abs(left.y) + Math.abs(right.y)).toBeCloseTo(0);
  });

  it('walks around a parked car instead of entering its footprint', () => {
    const navigation = new PedestrianNavigation(level(6));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: -Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle', patrolRoute: [4] };
    const parked: TrafficState = { id: 7, x: 128, y: 0, z: 1, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, model: 1, passengers: [], occupants: [], doorStates: [] };
    let maximumDetour = 0;
    for (let tick = 0; tick < 120; tick++) {
      updatePedestrianAi({
        npcs: [npc], players: [], navigation, traffic: [parked],
        vehicleBounds: () => ({ width: 20, height: 60 }), dt: 1 / 30, tick,
      });
      const localX = npc.x - parked.x, localY = npc.y - parked.y;
      maximumDetour = Math.max(maximumDetour, Math.abs(localY));
      expect(Math.abs(localX) > 22 || Math.abs(localY) > 42).toBe(true);
    }
    expect(npc.x).toBeGreaterThan(180);
    expect(maximumDetour).toBeGreaterThan(35);
  });

  it('walks around a moving car instead of entering its footprint', () => {
    const navigation = new PedestrianNavigation(level(6));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: -Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle', patrolRoute: [4] };
    const movingCar: TrafficState = { id: 7, x: 128, y: 0, z: 1, rotation: 0, speed: 20, vx: 20, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, model: 1, passengers: [], occupants: [], doorStates: [] };
    let maximumDetour = 0;

    for (let tick = 0; tick < 120; tick++) {
      updatePedestrianAi({
        npcs: [npc], players: [], navigation, traffic: [movingCar],
        vehicleBounds: () => ({ width: 20, height: 60 }), dt: 1 / 30, tick,
      });
      const localX = npc.x - movingCar.x, localY = npc.y - movingCar.y;
      maximumDetour = Math.max(maximumDetour, Math.abs(localY));
      expect(Math.abs(localX) > 22 || Math.abs(localY) > 42).toBe(true);
    }

    expect(npc.x).toBeGreaterThan(180);
    expect(maximumDetour).toBeGreaterThan(35);
  });

  it('runs around a parked car while fleeing instead of getting stuck behind it', () => {
    const navigation = new PedestrianNavigation(level(8));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: -Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 0, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() };
    const parked: TrafficState = { id: 7, x: 128, y: 0, z: 1, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, model: 1, passengers: [], occupants: [], doorStates: [] };
    let maximumDetour = 0;

    for (let tick = 0; tick < 60; tick++) {
      updatePedestrianAi({
        npcs: [npc], players: [player], navigation, traffic: [parked],
        vehicleBounds: () => ({ width: 20, height: 60 }), dt: 1 / 30, tick,
      });
      const localX = npc.x - parked.x, localY = npc.y - parked.y;
      maximumDetour = Math.max(maximumDetour, Math.abs(localY));
      expect(Math.abs(localX) > 22 || Math.abs(localY) > 42).toBe(true);
    }

    expect(npc.state).toBe('flee');
    expect(npc.x).toBeGreaterThan(180);
    expect(maximumDetour).toBeGreaterThan(35);
  });

  it('runs around a moving car while fleeing instead of crossing its footprint', () => {
    const navigation = new PedestrianNavigation(level(8));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: -Math.PI / 2, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' };
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 0, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() };
    const movingCar: TrafficState = { id: 7, x: 128, y: 0, z: 1, rotation: 0, speed: 20, vx: 20, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, model: 1, passengers: [], occupants: [], doorStates: [] };
    let maximumDetour = 0;

    for (let tick = 0; tick < 60; tick++) {
      updatePedestrianAi({
        npcs: [npc], players: [player], navigation, traffic: [movingCar],
        vehicleBounds: () => ({ width: 20, height: 60 }), dt: 1 / 30, tick,
      });
      const localX = npc.x - movingCar.x, localY = npc.y - movingCar.y;
      maximumDetour = Math.max(maximumDetour, Math.abs(localY));
      expect(Math.abs(localX) > 22 || Math.abs(localY) > 42).toBe(true);
    }

    expect(npc.state).toBe('flee');
    expect(npc.x).toBeGreaterThan(180);
    expect(maximumDetour).toBeGreaterThan(35);
  });

  it('chooses another flee goal when a parked car leaves the current goal unreachable', () => {
    const navigation = new PedestrianNavigation(level(5));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 128, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' };
    const combat = newCombat();
    const player: PlayerState = { ...playerDefaults, id: 'player', x: 0, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat };
    const parked: TrafficState = { id: 7, x: 190, y: 0, z: 1, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, model: 1, passengers: [], occupants: [], doorStates: [] };

    for (let tick = 0; tick < 25; tick++) {
      updatePedestrianAi({
        npcs: [npc], players: [player], navigation, traffic: [parked],
        vehicleBounds: () => ({ width: 40, height: 240 }), dt: 1 / 30, tick,
      });
    }

    expect(npc.state).toBe('flee');
    expect(npc.pathGoal?.nodeId).toBe(1);
    expect(npc.vx).toBeLessThan(0);
  });

  it('maintains a bounded authoritative NPC population and despawns distant actors', () => {
    const game = new GameWorld(level(20));
    game.addPlayer('player', { ...playerDefaults, id: 'player', x: 0, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, combat: newCombat() });
    game.maintainNpcs();
    expect(game.npcs).toHaveLength(8);
    expect(game.npcBodies.size).toBe(8);
    const player = game.gameState.playerStates.get('player')!;
    player.x = 10000;
    game.maintainNpcs();
    expect(game.npcs).toHaveLength(0);
    expect(game.npcBodies.size).toBe(0);
  });

  it('keeps an ordinary civilian idle after recovering from a knockdown', () => {
    const navigation = new PedestrianNavigation(level(4));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 128, y: 0, z: 1, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'knockdown', animation: 'knockdown', panicTimer: 1, pathIndex: 1 };
    updatePedestrianAi({ npcs: [npc], players: [], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.state).toBe('idle');
    expect(npc.animation).toBe('idle');
    expect(npc.path).toBeUndefined();
    expect(npc.vx).toBe(0);
    expect(npc.vy).toBe(0);
  });

  it('uses the ordinary walking state machine for police while retaining the police kind', () => {
    const navigation = new PedestrianNavigation(level(4));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: Math.PI * 1.5, vx: 0, vy: 0, health: 100, kind: 'police', state: 'idle', animation: 'idle' };
    updatePedestrianAi({ npcs: [npc], players: [], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.kind).toBe('police');
    expect(npc.state).toBe('walk');
    expect(npc.animation).toBe('walking');
    expect(npc.vx).toBeGreaterThan(0);
  });

  it('keeps dead pedestrians inert', () => {
    const navigation = new PedestrianNavigation(level(2));
    const npc: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 1, rotation: 0, vx: 12, vy: 4, health: 0, kind: 'civilian', state: 'walk', animation: 'walking' };
    updatePedestrianAi({ npcs: [npc], players: [], navigation, dt: 1 / 30, tick: 0 });
    expect(npc.state).toBe('dead');
    expect(npc.animation).toBe('falling');
    expect(npc.deathTimer).toBe(33);
    expect(npc.vx).toBe(0);
    expect(npc.vy).toBe(0);
  });
});
