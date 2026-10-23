import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from './fixtures';
import { RocketObject } from '../../shared/game/effects/projectile';
import { predictLocalPlayer } from '../../shared/game/runtime/prediction';

it('predicts only the local player while world entities remain snapshot-driven', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'local');
  const local = game.addPlayer('local');
  const remote = game.addPlayer('remote');
  const remotePosition = { x: remote.x, y: remote.y };
  const vehicle: TrafficState = { id: 7, model: 0, x: local.x + 120, y: local.y, z: local.z, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
  game.restoreWorld([], [vehicle]);

  predictLocalPlayer(game, { seq: 1, keys: 0, moveX: 1, moveY: 0 });

  expect(local.movement?.speed).toBeGreaterThan(0);
  expect(game.gameState.vehicleStates[0]).toMatchObject({ x: vehicle.x, y: vehicle.y, vx: 0, vy: 0 });
  expect(remote).toMatchObject(remotePosition);
  expect(local.combat.shots).toHaveLength(0);
});

it('predicts the locally driven vehicle while leaving other vehicles authoritative', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'local');
  const local = game.addPlayer('local');
  const road = { x: 85 * 64, y: -190 * 64, z: 3 };
  const remoteVehicle: TrafficState = { id: 8, model: 0, x: road.x + 240, y: road.y, z: road.z, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
  const drivenVehicle: TrafficState = {
    id: 7, model: 0, x: road.x, y: road.y, z: road.z, rotation: 0, speed: 0, vx: 0, vy: 0, color: 0, passengers: ['local'],
    occupants: [{ id: 'local', door: 0, state: 'seated', progress: 1 }], doorStates: [], angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, health: 100,
  };
  game.restoreWorld([], [drivenVehicle, remoteVehicle]);
  const predictedVehicle = game.gameState.vehicleStates.find(vehicle => vehicle.id === drivenVehicle.id)!;
  const untouchedVehicle = game.gameState.vehicleStates.find(vehicle => vehicle.id === remoteVehicle.id)!;
  game.restore({ ...local, x: road.x, y: road.y, z: road.z + 1, vehicleId: predictedVehicle.id, animation: { kind: 'seated', progress: 1 } });
  const start = { x: predictedVehicle.x, y: predictedVehicle.y };
  const remoteStart = { x: untouchedVehicle.x, y: untouchedVehicle.y };

  predictLocalPlayer(game, { seq: 1, keys: 1 });

  expect(Math.hypot(predictedVehicle.x - start.x, predictedVehicle.y - start.y)).toBeGreaterThan(0);
  expect(local.x).toBeCloseTo(predictedVehicle.x, 5);
  expect(local.y).toBeCloseTo(predictedVehicle.y, 5);
  expect(untouchedVehicle).toMatchObject({ ...remoteStart, vx: 0, vy: 0 });
});

it('uses continuous vehicle keys instead of the current held-control state', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'local');
  const local = game.addPlayer('local');
  const road = { x: 85 * 64, y: -190 * 64, z: 3 };
  const drivenVehicle: TrafficState = {
    id: 7, model: 0, x: road.x, y: road.y, z: road.z, rotation: 0, speed: 300, vx: 0, vy: 300,
    throttle: .5, brakePressure: 0, handbrakeForce: 0, angularVelocity: 0, color: 0, passengers: ['local'],
    occupants: [{ id: 'local', door: 0, state: 'seated', progress: 1 }], doorStates: [], health: 100,
  };
  game.restoreWorld([], [drivenVehicle]);
  game.restore({ ...local, x: road.x, y: road.y, z: road.z + 1, vehicleId: drivenVehicle.id, animation: { kind: 'seated', progress: 1 } });
  predictLocalPlayer(game, { seq: 1, keys: 0, controls: ['forwardEnd'] });
  predictLocalPlayer(game, { seq: 2, keys: 1, controls: [] });

  expect(game.gameState.vehicleStates[0]!.throttle).toBeCloseTo(.5, 5);
});

it('reconciles replicated shots as client projectile game objects', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'client');
  const player = game.addPlayer('client');
  const shot = { x: player.x, y: player.y, endX: player.x + 120, endY: player.y, z: player.z, life: 4, weapon: 0, projectile: true };

  game.restore({ ...player, combat: { ...player.combat!, shots: [shot] } });

  const projectile = [...game.gameObjects.values()].find(object => object.kind === 'projectile');
  expect(projectile).toBeDefined();
  expect(projectile?.state['x']).toBe(player.x);
  expect(projectile?.state['endX']).toBe(player.x + 120);

  game.restore({ ...player, combat: { ...player.combat!, shots: [] } });
  expect([...game.gameObjects.values()].some(object => object.kind === 'projectile')).toBe(false);
});

it('keeps the rocket projectile family when reconciling a compact client shot', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'client');
  const player = game.addPlayer('client');
  const shot = { x: player.x, y: player.y, endX: player.x + 120, endY: player.y, z: player.z, life: 4, weapon: 3, projectile: true };

  game.restore({ ...player, combat: { ...player.combat!, shots: [shot] } });

  const projectile = [...game.gameObjects.values()].find(object => object.kind === 'projectile');
  expect(projectile).toBeInstanceOf(RocketObject);
});

it('reconciles overlapping replicated shots independently', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'client');
  const player = game.addPlayer('client');
  const shots = [1, 2].map(sequence => ({
    x: player.x, y: player.y, endX: player.x + sequence * 120, endY: player.y,
    z: player.z, life: 8, weapon: 0, projectile: true, sequence,
  }));

  game.restore({ ...player, combat: { ...player.combat!, shots } });
  expect([...game.gameObjects.values()].filter(object => object.kind === 'projectile')).toHaveLength(2);

  game.restore({ ...player, combat: { ...player.combat!, shots: [shots[1]!] } });
  expect([...game.gameObjects.values()].filter(object => object.kind === 'projectile')).toHaveLength(1);
});
