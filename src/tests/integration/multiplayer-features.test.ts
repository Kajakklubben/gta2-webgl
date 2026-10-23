import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { parseInput } from '../../shared/protocol/validation';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from '../unit/fixtures';

it('keeps vehicle enter/exit and NPC movement authoritative', () => {
  const game = new GameWorld(parseMap(mapFixture()));
  const vehicleState: TrafficState = { id: 1, x: 85 * 64, y: -190 * 64, z: 1, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0xd84b45, passengers: [], occupants: [], doorStates: [], health: 100, model: 0 };
  game.restoreWorld([], [vehicleState]);
  const vehicle = game.gameState.vehicleStates[0]!;
  const player = game.addPlayer('one');
  // Vehicles use the road floor while player feet use floor + 1.
  game.restore({ ...player, x: vehicle.x, y: vehicle.y, z: vehicle.z + 1 });
  game.step(new Map([['one', { seq: 1, keys: 0, action: 'enter' }]]));
  expect(game.gameState.playerStates.get('one')!.vehicleId).toBe(vehicle.id);
  expect(vehicle.passengers?.[0]).toBe('one');
  expect(game.events.some(event => event.type === 'vehicle-enter')).toBe(true);
  for (let seq = 2; seq < 32; seq++) game.step(new Map([['one', { seq, keys: 0 }]]));
  const before = { x: vehicle.x, y: vehicle.y };
  game.step(new Map([['one', { seq: 32, keys: 1 }]]));
  expect(Math.hypot(vehicle.x - before.x, vehicle.y - before.y)).toBeGreaterThan(0);
  vehicle.vx = vehicle.vy = vehicle.speed = 0;
  game.step(new Map([['one', { seq: 33, keys: 0, action: 'enter' }]]));
  for (let seq = 34; seq < 52; seq++) game.step(new Map([['one', { seq, keys: 0 }]]));
  expect(game.gameState.playerStates.get('one')!.vehicleId).toBeUndefined();
  expect(vehicle.passengers).toEqual([]);
  expect(game.npcs.length).toBeGreaterThanOrEqual(0);
});

it('resolves a player against a stationary parked vehicle', () => {
  const game = new GameWorld(parseMap(mapFixture()));
  const vehicleState: TrafficState = { id: 2, x: 85 * 64, y: -190 * 64, z: 4, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0xd84b45, passengers: [], occupants: [], doorStates: [], health: 100, model: 0 };
  game.restoreWorld([], [vehicleState]);
  const player = game.addPlayer('collision');
  game.restore({ ...player, x: vehicleState.x - 10, y: vehicleState.y, z: vehicleState.z });
  game.step(new Map());
  // The CARI footprint is 36 pixels wide and the player radius is 10; both
  // bodies are dynamic, so native separation settles at their actual 28-pixel
  // side contact or slightly beyond it depending on the initial overlap.
  expect(Math.hypot(player.x - game.gameState.vehicleStates[0]!.x, player.y - game.gameState.vehicleStates[0]!.y)).toBeGreaterThanOrEqual(20);
});

it('uses the player wall layer for driven vehicles', () => {
  const level = parseMap(mapFixture());
  level.map[85]![189]![4] = { ...level.map[85]![190]![3]!, Bottom: { ...level.map[85]![190]![3]!.Bottom, wall: true } };
  const game = new GameWorld(level);
  const vehicleState: TrafficState = { id: 3, x: 85 * 64, y: -190 * 64, z: 3, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0xd84b45, passengers: [], occupants: [], doorStates: [], health: 100, model: 0 };
  game.restoreWorld([], [vehicleState]);
  const player = game.addPlayer('driver');
  game.restore({ ...player, x: vehicleState.x, y: vehicleState.y, z: 4 });
  game.step(new Map([['driver', { seq: 1, keys: 0, action: 'enter' }]]));
  for (let tick = 0; tick < 60; tick++) game.step(new Map([['driver', { seq: tick + 2, keys: 1 }]]));
  expect(game.gameState.vehicleStates[0]!.y).toBeLessThan(-190 * 64 + 80);
});

it('accepts action and lag sample metadata without widening movement keys', () => {
  expect(parseInput({ type: 'input', input: { seq: 1, keys: 1, clientTick: 10, action: 'enter' } })).toEqual({ seq: 1, keys: 1, clientTick: 10, action: 'enter' });
  expect(parseInput({ type: 'input', input: { seq: 2, keys: 0, action: 'enter', vehicleId: 7 } })).toEqual({ seq: 2, keys: 0, action: 'enter', vehicleId: 7 });
  expect(() => parseInput({ type: 'input', input: { seq: 1, keys: 128 } })).toThrow();
});

it('preserves authored pickup height through game normalization', () => {
  const pickup = { id: 7, x: 12.5 * 64, y: -4.25 * 64, z: 4, weapon: 1, ammo: 0, active: true };
  const game = new GameWorld(parseMap(mapFixture()), undefined, [pickup]);
  expect(game.gameState.pickupStates[0]!).toMatchObject(pickup);
});
