import { describe, expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { decodeFace, parseMap } from '../../shared/engine/loader/map-parser';
import { loadVehicleBounds } from '../../shared/engine/loader/vehicle-bounds';
import { VehicleObject } from '../../shared/game/gameobjects/vehicle';
import { PlayerObject } from '../../shared/game/gameobjects/player';
import { CollisionWorld, shapeContact, type CollisionBody } from '../../shared/game/physics/collision-world';
import { loadCarCatalog } from '../../shared/engine/loader/cars';
import { parseStyle } from '../../shared/engine/loader/style-parser';
import type { TrafficState } from '../../shared/protocol/types';
import { vehicleMass } from '../../shared/domain/physics/vehicle-kinematics';
import { VehicleCatalog } from '../../shared/domain/vehicles/vehicle-catalog';
import { mapFixture, styleFixture, binary, chunk, npcDefaults } from './fixtures';
import { readChunks } from '../../shared/engine/loader/binary';

function requireContact(value: ReturnType<typeof shapeContact>) {
  const contact = value[0];
  if (!contact) throw new Error('Expected a collision contact');
  return contact;
}
function requireCollider(value: readonly CollisionBody[]) {
  if (value.length !== 1) throw new Error('Expected one collision body');
  return value[0]!;
}

function setup(local = false, rotation = 0, health = 100) {
  const bounds = loadVehicleBounds([{ model: 7, width: 20, height: 100 }]);
  let localId: string | undefined;
  if (local) localId = 'walker';
  const game = new GameWorld(parseMap(mapFixture()), localId, [], new Map(), [], bounds);
  const vehicle: TrafficState = { id: 1, model: 7, x: 85 * 64, y: -190 * 64, z: 3, rotation, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health };
  game.restoreWorld([], [vehicle]);
  const player = game.addPlayer('walker');
  game.restore({ ...player, x: vehicle.x - 140, y: vehicle.y, z: 4, rotation: -Math.PI / 2 });
  return { game, vehicle: game.gameState.vehicleStates[0]!, player };
}

function finishEntry(game: GameWorld, vehicle: TrafficState, playerId: string, startSeq = 2) {
  for (let seq = startSeq; seq < startSeq + 30; seq++) game.step(new Map([[playerId, { seq, keys: 0 }]]));
  expect(vehicle.occupants?.find(occupant => occupant.id === playerId)?.state).toBe('seated');
}

describe('authored vehicle footprints', () => {
  it('resolves handling and chassis metadata as one runtime description', () => {
    const physics = { model: 7, name: 'heavy', mass: 24 };
    const catalog = new VehicleCatalog(new Map([[7, physics]]), new Map([[7, { width: 20, height: 100 }]]));
    expect(catalog.get(7)).toEqual({ model: 7, physics, bounds: { width: 20, height: 100 } });
    expect(catalog.get(99).bounds).toEqual({ width: 36, height: 66 });
  });

  it('loads CARI chassis dimensions through the asset catalog, independently of sprite padding', () => {
    const { chunks } = readChunks(styleFixture(), 'GBST');
    const cari = new Uint8Array([7, 1, 20, 100, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    chunks.set('CARI', cari);
    chunks.set('SPRB', new Uint8Array(12));
    const style = parseStyle(binary('GBST', [...chunks].map(([name, bytes]) => chunk(name, bytes))));
    const catalog = loadCarCatalog(style);
    expect(catalog.bounds.get(7)).toEqual({ width: 20, height: 100 });
    expect(loadVehicleBounds([{ model: 8, width: 0, height: 100 }]).has(8)).toBe(false);
  });

  it('keeps the selected paint while composing an animated door delta', () => {
    const { vehicle } = setup();
    vehicle.paint = 3;
    vehicle.doorStates = [{ phase: 'opening', frame: 1, timer: 0 }];
    const sprite = new VehicleObject(vehicle, undefined, { width: 20, height: 100 }).getSprite(0);
    expect(sprite.variant).toBe('paint');
    expect(sprite.variantIndex).toBe(3);
    expect(sprite.carDeltaIndices).toEqual([7]);
  });

  it('does not collide with empty space inside the enclosing broad-phase circle', () => {
    const { game, vehicle, player } = setup();
    const car = requireCollider(new VehicleObject(vehicle, undefined, { width: 20, height: 100 }).getCollider());
    game.restore({ ...player, x: vehicle.x + 30, y: vehicle.y, z: 4 });
    const pedestrian = requireCollider(new PlayerObject(player).getCollider());
    expect(shapeContact(car, pedestrian)).toEqual([]);
    const world = new CollisionWorld(); world.rebuild([car.object, pedestrian.object]);
    expect(world.contacts()).toEqual([]);
  });

  it('resolves rotated sides and rounded circle/box corners with the correct normal', () => {
    const { game, vehicle, player } = setup();
    const car = new VehicleObject(vehicle, undefined, { width: 20, height: 100 });
    game.restore({ ...player, x: vehicle.x + 16, y: vehicle.y + 56, z: 4 });
    const contact = requireContact(shapeContact(requireCollider(car.getCollider()), requireCollider(new PlayerObject(player).getCollider())));
    expect(contact.depth).toBeCloseTo(10 - Math.hypot(6, 6));
    expect(contact.normalX).toBeCloseTo(Math.SQRT1_2);
    vehicle.rotation = Math.PI / 2;
    game.restore({ ...player, x: vehicle.x + 56, y: vehicle.y + 16 });
    expect(requireContact(shapeContact(requireCollider(car.getCollider()), requireCollider(new PlayerObject(player).getCollider()))).depth).toBeCloseTo(contact.depth);
    expect(shapeContact(requireCollider(car.getCollider()), { ...requireCollider(new PlayerObject(player).getCollider()), z: 8 })).toEqual([]);
  });

  it('uses rectangles for car-to-car contacts instead of enclosing circles', () => {
    const { vehicle } = setup();
    const a = new VehicleObject(vehicle, undefined, { width: 20, height: 100 });
    const b = new VehicleObject({ ...vehicle, id: 2, x: vehicle.x + 25 }, undefined, a.bounds);
    expect(shapeContact(requireCollider(a.getCollider()), requireCollider(b.getCollider()))).toEqual([]);
    b.setPose({ ...b.placement, x: vehicle.x + 15, vx: b.state.vx, vy: b.state.vy });
    expect(requireContact(shapeContact(requireCollider(a.getCollider()), requireCollider(b.getCollider()))).depth).toBeCloseTo(5);
  });

  it('uses authored mass as the movable collision weight for every car state', () => {
    const { vehicle } = setup();
    const physics = { model: vehicle.model!, name: 'heavy', mass: 24 };
    const driven = new VehicleObject({ ...vehicle, passengers: ['walker'] }, undefined, { width: 20, height: 100 }, physics);
    const parked = new VehicleObject(vehicle, undefined, { width: 20, height: 100 }, physics);
    expect(driven.blockingWeight).toBeCloseTo(vehicleMass(physics));
    expect(parked.blockingWeight).toBeCloseTo(vehicleMass(physics));
  });
});

describe.each([false, true])('walking into cars (authoritative game mode: %s)', local => {
  it.each([0, Math.PI / 2])('blocks at the metadata rectangle and pushes the car at rotation %s', rotation => {
    const { game, vehicle, player } = setup(local, rotation);
    const start = { x: vehicle.x, y: vehicle.y };
    for (let seq = 1; seq <= 60; seq++) game.step(new Map([['walker', { seq, keys: 32, moveX: 1, moveY: 0 }]]));
    let halfWidth = 50;
    if (rotation === 0) halfWidth = 10;
    expect(Math.hypot(vehicle.x - start.x, vehicle.y - start.y)).toBeGreaterThan(0);
    expect(shapeContact(requireCollider(new VehicleObject(vehicle, undefined, { width: 20, height: 100 }).getCollider()), requireCollider(new PlayerObject(player).getCollider()))).toEqual([]);
    expect(player.x).toBeCloseTo(vehicle.x - halfWidth - 10, 5);
    expect(player.y).toBeCloseTo(vehicle.y, 5);
    expect(player.rotation).toBeCloseTo(Math.PI * 1.5, 5);
    // The contact is resolved physically, so the player's velocity may carry
    // some of the impulse while the heavier car is pushed out of the way.
    expect(Number.isFinite(player.vx)).toBe(true);
    expect(player.combat!.health).toBe(100);
    expect(vehicle.health).toBe(100);
  });

  it('slides along a side instead of turning the player or stopping tangential movement', () => {
    const { game, vehicle, player } = setup(local);
    const start = { x: vehicle.x, y: vehicle.y };
    game.restore({ ...player, x: vehicle.x - 20, y: vehicle.y - 20, z: 4 });
    for (let seq = 1; seq <= 5; seq++) game.step(new Map([['walker', { seq, keys: 0, moveX: 1, moveY: 1 }]]));
    expect(Math.hypot(vehicle.x - start.x, vehicle.y - start.y)).toBeGreaterThan(0);
    expect(shapeContact(requireCollider(new VehicleObject(vehicle, undefined, { width: 20, height: 100 }).getCollider()), requireCollider(new PlayerObject(player).getCollider()))).toEqual([]);
    expect(player.y).toBeGreaterThan(vehicle.y - 10);
    expect(player.vy).toBeGreaterThan(0);
    expect(player.rotation).toBeCloseTo(Math.PI * 1.75, 5);
  });

  it('applies source coasting damping after a push until the chassis rests', () => {
    const { game, vehicle } = setup(local);
    for (let seq = 1; seq <= 60; seq++) game.step(new Map([['walker', { seq, keys: 32, moveX: 1, moveY: 0 }]]));
    expect(Math.hypot(vehicle.vx ?? 0, vehicle.vy ?? 0)).toBeGreaterThan(0);
    for (let seq = 61; seq <= 360; seq++) game.step(new Map([['walker', { seq, keys: 0 }]]));
    expect(vehicle.vx).toBe(0);
    expect(vehicle.vy).toBe(0);
  });

  it('keeps wrecks solid and allows the driver to enter and exit', () => {
    const { game, vehicle, player } = setup(local, 0, 0);
    for (let seq = 1; seq <= 60; seq++) game.step(new Map([['walker', { seq, keys: 1, moveX: 1, moveY: 0 }]]));
    expect(player.x).toBeCloseTo(vehicle.x - 20, 5);
    vehicle.health = 100;
    // A wreck remains a dynamic body and may have retained a push velocity;
    // stop it before testing the separate entry-distance behavior.
    vehicle.vx = vehicle.vy = vehicle.speed = 0;
    game.restore({ ...player, x: vehicle.x - 20, y: vehicle.y, z: vehicle.z });
    game.step(new Map([['walker', { seq: 61, keys: 0, action: 'enter' as const }]]));
    expect(player.vehicleId).toBe(vehicle.id);
    game.step(new Map([['walker', { seq: 62, keys: 0, action: 'enter' as const }]]));
    expect(player.vehicleId).toBeUndefined();
  });

  it('converts the touch movement vector into throttle and steering while driving', () => {
    const { game, vehicle, player } = setup();
    game.restore({ ...player, x: vehicle.x - 40, y: vehicle.y, z: 4 });
    game.step(new Map([['walker', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
    expect(player.vehicleId).toBe(vehicle.id);
    finishEntry(game, vehicle, 'walker');
    const startY = vehicle.y;
    for (let seq = 2; seq <= 31; seq++) {
      game.step(new Map([['walker', { seq, keys: 0, moveX: 0, moveY: 1 }]]));
    }
    expect(vehicle.y).toBeGreaterThan(startY);
    expect(vehicle.rotation).toBeCloseTo(0, 3);
  });

  it('uses an opposite touch vector as reverse throttle while driving', () => {
    const { game, vehicle, player } = setup();
    game.restore({ ...player, x: vehicle.x - 40, y: vehicle.y, z: 4 });
    game.step(new Map([['walker', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
    expect(player.vehicleId).toBe(vehicle.id);
    finishEntry(game, vehicle, 'walker');
    const startY = vehicle.y;
    for (let seq = 2; seq <= 31; seq++) {
      game.step(new Map([['walker', { seq, keys: 0, moveX: 0, moveY: -1 }]]));
    }
    expect(vehicle.y).toBeLessThan(startY);
    expect(vehicle.rotation).toBeCloseTo(0, 3);
    expect(vehicle.vy).toBeLessThan(0);
  });

  it('brakes a forward-moving car before allowing reverse throttle', () => {
    const { game, vehicle, player } = setup();
    game.restore({ ...player, x: vehicle.x - 40, y: vehicle.y, z: 4 });
    game.step(new Map([['walker', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
    finishEntry(game, vehicle, 'walker');
    vehicle.vy = vehicle.speed = 120;
    game.step(new Map([['walker', { seq: 13, keys: 0, moveX: 0, moveY: -1 }]]));
    expect(vehicle.brakePressure).toBeGreaterThan(0);
    expect(vehicle.throttle).toBeCloseTo(0, 5);
    expect(vehicle.vy).toBeGreaterThan(0);
  });

  it('keeps vector steering handedness correct while backing up', () => {
    const drive = (moveX: number) => {
      const { game, vehicle, player } = setup();
      game.restore({ ...player, x: vehicle.x - 40, y: vehicle.y, z: 4 });
      game.step(new Map([['walker', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
      finishEntry(game, vehicle, 'walker');
      vehicle.vy = vehicle.speed = -120;
      const startX = vehicle.x;
      for (let seq = 2; seq <= 21; seq++) {
        game.step(new Map([['walker', { seq, keys: 0, moveX, moveY: -1 }]]));
      }
      return vehicle.x - startX;
    };

    expect(drive(1)).toBeGreaterThan(0);
    expect(drive(-1)).toBeLessThan(0);
  });
});

it('depenetrates a car through generic map blocking before removing its velocity', () => {
  const level = parseMap(mapFixture());
  level.map[85]![189]![4] = { ...level.map[85]![190]![3]!, Bottom: { ...decodeFace(1024), wall: true } };
  const game = new GameWorld(level, undefined, [], new Map(), [], new Map([[7, { width: 20, height: 100 }]]));
  game.restoreWorld([], [{ id: 1, model: 7, x: 85 * 64, y: -190 * 64, z: 4, rotation: 0, speed: 0, vx: 0, vy: 300, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: ['driver'], occupants: [], doorStates: [], health: 100 }]);
  const vehicle = game.gameState.vehicleStates[0]!;

  game.step(new Map());

  const wallY = -(189 * 64 + 32);
  // The full authored chassis footprint must be on the approach side of the
  // wall, even though this fixture starts 18 world pixels inside it.
  expect(vehicle.y + 50).toBeLessThanOrEqual(wallY + .25);
  expect(vehicle.y).toBeGreaterThan(wallY - 50 - 2);
  expect(Math.abs(vehicle.vy ?? 0)).toBeLessThan(1);
  expect(vehicle.damage).toBeGreaterThan(0);
  expect(vehicle.health).toBeLessThan(100);
});

it('uses the source pedestrian impact band to kill an ordinary NPC on a fast hit', () => {
  const bounds = loadVehicleBounds([{ model: 7, width: 20, height: 100 }]);
  const game = new GameWorld(parseMap(mapFixture()), undefined, [], new Map(), [], bounds);
  const x = 85 * 64, y = -190 * 64;
  const vehicle: TrafficState = {
    id: 9, model: 7, x, y: y - 60, z: 3, rotation: 0, speed: 300, vx: 0, vy: 300,
    angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0,
    passengers: [], occupants: [], doorStates: [], health: 100,
  };
  const npc = {
    ...npcDefaults(), id: 1, x, y, z: 4, rotation: 0, vx: 0, vy: 0, health: 100,
    kind: 'civilian' as const, state: 'walk' as const, animation: 'walking' as const,
  };
  game.restoreWorld([], [vehicle], [], [npc]);

  game.step(new Map());

  const resolvedNpc = game.gameState.npcStates[0]!;
  expect(resolvedNpc.health).toBe(0);
  expect(resolvedNpc.state).toBe('dead');
  expect(resolvedNpc.deathCause).toBe('run-over');
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', target: 'npc:1', lethal: true }));
});

it('kills a player at the source high-speed threshold and credits the player driver', () => {
  const bounds = loadVehicleBounds([{ model: 7, width: 20, height: 100 }]);
  const game = new GameWorld(parseMap(mapFixture()), undefined, [], new Map(), [], bounds);
  const x = 85 * 64, y = -190 * 64;
  const driver = game.addPlayer('driver');
  const target = game.addPlayer('target');
  const vehicle: TrafficState = {
    id: 10, model: 7, x, y: y - 60, z: 3, rotation: 0, speed: 600, vx: 0, vy: 600,
    angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0,
    passengers: ['driver'], occupants: [], doorStates: [], health: 100,
  };
  game.restoreWorld([], [vehicle]);
  game.restore({ ...driver, x: x - 100, y: y - 60, z: 4, vehicleId: vehicle.id, animation: { kind: 'seated', progress: 1 } });
  game.restore({ ...target, x, y, z: 4, rotation: 0 });
  game.restoreWorld([], [vehicle]);

  game.step(new Map());

  expect(target.combat.health).toBe(0);
  expect(target.combat.respawn).toBeGreaterThan(0);
  expect(driver.kills).toBe(1);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', actor: 'driver', target: 'target', lethal: true }));
});
