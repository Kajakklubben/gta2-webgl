import { describe, expect, it } from 'vitest';
import type { Block, Face, GameMap } from '../../shared/engine/loader/map-parser';
import { GameWorld } from '../../shared/game/game-world';
import { newCombat } from '../../shared/domain/combat/weapons';
import type { NpcState, PlayerState, TrafficState } from '../../shared/protocol/types';
import { npcDefaults } from './fixtures';

const face = (): Face => ({ tileNumber: 1, flat: true, flip: false, rotation: 0, wall: false, bulletWall: false });
const block = (groundType = 2): Block => ({
  Left: face(), Right: face(), Top: face(), Bottom: face(), Lid: face(),
  slopeType: 0, groundType, arrows: 0,
});

/** Keep two legal map columns beside one authored water-lid column. */
function waterLevel(): GameMap {
  const water = block(3);
  water.Lid.tileNumber = 608;
  return {
    map: [[[block()]], [[water]], [[block()]]],
    objects: [], zones: [], animations: [], lights: [], roads: [],
    traffic: {
      roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [],
      trafficLightZones: [], arrowBlockerZones: [], busStopZones: [],
    },
    format: 'UMAP',
  } as GameMap;
}

function playerInWater(game: GameWorld, id: string, vehicleId?: number): PlayerState {
  const player = game.addPlayer(id);
  const next = {
    ...player,
    x: 64,
    y: 0,
    z: 1,
    vehicleId,
    animation: vehicleId === undefined ? undefined : { kind: 'seated' as const, progress: 1 },
    combat: newCombat(),
  };
  game.restore(next);
  return game.gameState.playerStates.get(id)!;
}

function vehicleWithDriver(id: number, driver: string): TrafficState {
  return {
    id, x: 64, y: 0, z: 1, rotation: 0, speed: 0, color: 0, health: 100,
    vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0,
    passengers: [driver],
    occupants: [{ id: driver, door: 0, state: 'seated', progress: 1 }],
    doorStates: [],
  };
}

describe('source-style water deaths', () => {
  it('starts a ten-tick sink when a jumping player enters water, then respawns them', () => {
    const game = new GameWorld(waterLevel());
    const player = playerInWater(game, 'player');
    player.jump = { phase: 'falling', progress: .8, height: 12, baseZ: 1, vx: 120, vy: 0 };

    game.tickPlayerStatus();

    expect(player.drowningTimer).toBe(10);
    expect(game.gameState.hazardStates.some(hazard => hazard.kind === 'water' && hazard.owner === 'player:player')).toBe(true);
    expect(player.jump).toBeUndefined();
    expect(player.combat.health).toBe(100);

    for (let tick = 0; tick < 10; tick++) game.tickPlayerStatus();

    expect(player.drowningTimer).toBeUndefined();
    expect(player.combat.health).toBe(0);
    expect(player.deaths).toBe(1);
    expect(player.combat.respawn).toBeGreaterThan(0);
  });

  it('drowns a player who is driving a car into water and detaches the driver', () => {
    const game = new GameWorld(waterLevel());
    const player = playerInWater(game, 'driver', 7);
    const vehicle = vehicleWithDriver(7, player.id);
    game.registerObject(game.createVehicleObject(vehicle));

    game.tickPlayerStatus();
    expect(player.drowningTimer).toBe(10);
    expect(game.gameState.hazardStates.some(hazard => hazard.kind === 'water' && hazard.owner === 'player:driver')).toBe(true);

    for (let tick = 0; tick < 10; tick++) game.tickPlayerStatus();

    expect(player.combat.health).toBe(0);
    expect(player.vehicleId).toBeUndefined();
    expect(vehicle.passengers).toEqual([]);
  });

  it('drowns an NPC driver and removes its vehicle occupancy link', () => {
    const game = new GameWorld(waterLevel());
    const npc: NpcState = {
      ...npcDefaults(), id: 1, x: 64, y: 0, z: 1, rotation: 0, vx: 0, vy: 0,
      health: 100, kind: 'civilian', state: 'driving', animation: 'idle', vehicleId: 7,
    };
    const vehicle = vehicleWithDriver(7, 'npc:1');
    game.registerObject(game.createVehicleObject(vehicle));
    game.registerObject(game.createNpcObject(npc));

    game.tickPlayerStatus();
    expect(npc.drowningTimer).toBe(10);
    expect(game.gameState.hazardStates.some(hazard => hazard.kind === 'water' && hazard.owner === 'npc:1')).toBe(true);

    for (let tick = 0; tick < 10; tick++) game.updateGameObjects();

    expect(npc.health).toBe(0);
    expect(npc.deathCause).toBe('water');
    expect(npc.vehicleId).toBeUndefined();
    expect(vehicle.passengers).toEqual([]);
  });
});
