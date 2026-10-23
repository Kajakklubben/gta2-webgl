import { expect, it } from 'vitest';
import { CarTrafficSpawner } from '../../shared/domain/vehicles/car-traffic';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { TrafficState } from '../../shared/protocol/types';
import type { MapZone } from '../../shared/engine/loader/models/map';
import { mapFixture } from './fixtures';

function road(x: number, y: number, next: number[] = [], specialNext: number[] = [], right = true) {
  return {
    x, y, z: 0, arrows: right ? 2 : 1,
    green: { left: !right, right, up: false, down: false },
    red: { left: false, right: false, up: false, down: false }, next, specialNext,
  };
}

function vehicle(overrides: Partial<TrafficState> = {}): TrafficState {
  return {
    id: 1, x: 10 * 64, y: -10 * 64, z: 0, rotation: Math.PI * 1.5, speed: 100,
    vx: 100, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0,
    color: 0, health: 100, passengers: [], occupants: [], doorStates: [],
    routeNode: 0, targetNode: 1, aiActive: true, aiMode: 'ordinary', aiTask: 'follow-road',
    ...overrides,
  };
}

function spawner(roads: ReturnType<typeof road>[], trafficLightZones: readonly MapZone[] = []) {
  const level = parseMap(mapFixture());
  level.roads = roads;
  level.traffic.roadNodes = roads;
  level.traffic.trafficLightZones = [...trafficLightZones];
  return new CarTrafficSpawner(level, new Map(), [0]);
}

it('follows ordinary green links and refuses a special-only branch', () => {
  const sim = spawner([road(10, 10, [1], [2]), road(11, 10), road(10, 9, [], [], false)]);
  const state = vehicle({ targetNode: undefined });
  sim.controlFor(state, [], 0);
  expect(state.targetNode).toBe(1);
  expect(state.allowSpecialRoute).toBe(false);
  expect(state.currentDirection).toBe('east');
});

it('populates turn, lane, speed, and obstacle state from one authoritative tick', () => {
  const sim = spawner([road(10, 10, [1]), road(11, 10)]);
  const state = vehicle({ speed: 120, vx: 120 });
  const control = sim.controlFor(state, [vehicle({ id: 2, x: 10 * 64 + 32, y: -10 * 64, speed: 0, aiState: 'stuck' })], 0);
  expect(state.aiActive).toBe(true);
  expect(state.plannedTurn).toBe('none');
  expect(state.laneTarget).toBe(0);
  expect(state.targetSpeed).toBeGreaterThanOrEqual(0);
  expect(state.obstacleTimer).toBeGreaterThan(0);
  expect(control.brake).toBe(true);
});

it('stops for a shared red phase at the selected approach', () => {
  const light = { type: 2, typeName: 'traffic-light', x: 11, y: 10, w: 1, h: 1, name: 'crossing' };
  const sim = spawner([road(10, 10, [1]), road(11, 10)], [light]);
  const state = vehicle();
  const control = sim.controlFor(state, [], 0);
  expect(state.signal).toBe('red');
  expect(state.aiState).toBe('yield');
  expect(control.brake).toBe(true);
});

it('does not yield to the pursuit actor as an ordinary pedestrian obstacle', () => {
  const sim = spawner([road(10, 10, [1]), road(11, 10)]);
  const state = vehicle({ pursuitTarget: 'player-1', aiMode: 'chase', aiTask: 'chase', allowSpecialRoute: true });
  const control = sim.controlFor(state, [], 0, [{ id: 'player-1', x: state.x + 16, y: state.y, z: state.z }]);
  expect(control.ai).toBe(true);
  expect(state.aiMode).toBe('chase');
  expect(state.allowSpecialRoute).toBe(true);
});
