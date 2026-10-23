import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { CarTrafficSpawner } from '../../shared/domain/vehicles/car-traffic';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from './fixtures';

it('spawns parked cars at the source traffic limit without autonomous movement', () => {
  const level = parseMap(mapFixture());
  const roads = Array.from({ length: 20 }, (_, index) => ({
    x: 20 + index, y: 20, z: 0, arrows: 2, green: { left: false, right: true, up: false, down: false },
    red: { left: false, right: false, up: false, down: false }, next: [(index + 1) % 20], specialNext: [],
  }));
  level.roads = roads;
  level.traffic.roadNodes = roads;
  const game = new GameWorld(level, undefined, [], new Map(), [0]);
  const player = game.addPlayer('one');
  // Keep the interest anchor near the synthetic road so the server does not
  // recycle the cars before the movement assertion can observe them.
  game.restore({ ...player, x: 20 * 64 + 32, y: -20 * 64 - 32, z: 0 });
  const before = game.gameState.vehicleStates.map(vehicle => ({ id: vehicle.id, x: vehicle.x, y: vehicle.y }));
  expect(game.gameState.vehicleStates.length).toBeGreaterThan(0);
  expect(game.gameState.vehicleStates.length).toBeLessThanOrEqual(16);
  // Traffic spawn points use the same centered tile coordinates as map blocks,
  // pickups, and players; they must not spawn on tile edges.
  expect(before.every(vehicle => vehicle.x % 64 === 0 && vehicle.y % 64 === 0)).toBe(true);
  for (let tick = 0; tick < 45; tick++) game.step(new Map());
  expect(game.gameState.vehicleStates.every(vehicle => {
    const start = before.find(item => item.id === vehicle.id);
    return (!start || (vehicle.x === start.x && vehicle.y === start.y))
      && vehicle.speed === 0 && (vehicle.vx ?? 0) === 0 && (vehicle.vy ?? 0) === 0
      && vehicle.aiState === undefined;
  })).toBe(true);
  expect(game.gameState.vehicleStates.every(vehicle => vehicle.health > 0 && (vehicle.passengers?.length ?? 0) === 0)).toBe(true);
});

it('recycles cars after they leave the server interest radius', () => {
  const level = parseMap(mapFixture());
  const roads = Array.from({ length: 20 }, (_, index) => ({
    x: 20 + index, y: 20, z: 0, arrows: 2, green: { left: false, right: true, up: false, down: false },
    red: { left: false, right: false, up: false, down: false }, next: [(index + 1) % 20], specialNext: [],
  }));
  level.roads = roads;
  level.traffic.roadNodes = roads;
  const game = new GameWorld(level, undefined, [], new Map(), [0]);
  const player = game.addPlayer('one');
  game.restore({ ...player, x: 20 * 64 + 32, y: -20 * 64 - 32, z: 0 });
  const oldIds = new Set(game.gameState.vehicleStates.map(vehicle => vehicle.id));
  for (const vehicle of game.gameState.vehicleStates) { vehicle.x = 1e6; vehicle.y = 1e6; }
  game.step(new Map());
  expect(game.gameState.vehicleStates.length).toBeGreaterThan(0);
  expect(game.gameState.vehicleStates.some(vehicle => !oldIds.has(vehicle.id))).toBe(true);
});

it('keeps inward-facing traffic spawns outside the camera rectangle', () => {
  const level = parseMap(mapFixture());
  const roads = Array.from({ length: 32 }, (_, index) => {
    const next: number[] = [];
    if (index < 31) next.push(index + 1);
    return {
      x: 20, y: index, z: 0, arrows: 8, green: { left: false, right: false, up: false, down: true },
      red: { left: false, right: false, up: false, down: false }, next, specialNext: [],
    };
  });
  level.roads = roads;
  level.traffic.roadNodes = roads;
  const game = new GameWorld(level, undefined, [], new Map(), [0]);
  const player = game.addPlayer('one');
  const x = 20 * 64, y = -16 * 64;
  game.restore({ ...player, x, y, z: 0 });

  const centerX = Math.round(x / 64), centerY = Math.round(-y / 64);
  const minX = centerX - 6, maxX = centerX + 6, minY = centerY - 4, maxY = centerY + 4;
  expect(game.gameState.vehicleStates.length).toBeGreaterThan(0);
  expect(game.gameState.vehicleStates.every(vehicle => {
    const tileX = Math.round(vehicle.x / 64), tileY = Math.round(-vehicle.y / 64);
    return tileX < minX || tileX > maxX || tileY < minY || tileY > maxY;
  })).toBe(true);
});

it('uses the signed shortest turn when a traffic target is to the right', () => {
  const level = parseMap(mapFixture());
  const roads = [
    { x: 10, y: 10, z: 0, arrows: 2, green: { left: false, right: true, up: false, down: false }, red: { left: false, right: false, up: false, down: false }, next: [1], specialNext: [] },
    { x: 11, y: 10, z: 0, arrows: 2, green: { left: false, right: true, up: false, down: false }, red: { left: false, right: false, up: false, down: false }, next: [1], specialNext: [] },
  ];
  level.roads = roads;
  level.traffic.roadNodes = roads;
  const spawner = new CarTrafficSpawner(level, new Map(), [0]);
  const vehicle: TrafficState = {
    id: 1, x: 10 * 64, y: -10 * 64, z: 0, rotation: 0, speed: 0, color: 0, health: 100,
    vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0,
    model: 0, passengers: [], occupants: [], doorStates: [], routeNode: 0, targetNode: 1,
  };
  expect(spawner.controlFor(vehicle, [], 0).steer).toBeLessThan(0);
});

