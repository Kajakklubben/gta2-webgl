import { expect, it } from 'vitest';
import { TrafficLightSystem } from '../../shared/domain/vehicles/traffic-lights';
import type { MapZone } from '../../shared/engine/loader/models/map';

const zone = (x: number, y: number, name = 'junction') => ({ type: 2, typeName: 'traffic-light', x, y, w: 2, h: 2, name } satisfies MapZone);

it('uses one shared phase for both directions at an intersection', () => {
  const lights = new TrafficLightSystem([zone(10, 10)]);
  expect(lights.signal(zone(10, 10), 'up', 0)).toBe('green');
  expect(lights.signal(zone(10, 10), 'left', 0)).toBe('red');
  expect(lights.signal(zone(10, 10), 'up', 100)).toBe('red');
  expect(lights.signal(zone(10, 10), 'left', 148)).toBe('green');
});

it('uses the same global phase for every authored zone', () => {
  const first = zone(10, 10, 'first'), second = zone(30, 30, 'second');
  const lights = new TrafficLightSystem([first, second]);
  expect(lights.phase(first, 17)).toEqual(lights.phase(first, 17));
  expect(lights.phase(first, 80)).toEqual(lights.phase(second, 80));
});

it('resolves a zone by map tile and exposes a stop decision', () => {
  const lights = new TrafficLightSystem([zone(10, 10)]);
  const found = lights.zoneAt(11, 11);
  expect(found?.name).toBe('junction');
  expect(lights.shouldStop(found, 'left', 0)).toBe(true);
  expect(lights.zoneAt(1, 1)).toBeUndefined();
});

it('keeps amber, red, pedestrian-crossing, and all-red phases stopped', () => {
  const lights = new TrafficLightSystem([zone(10, 10)]);
  expect(lights.phase(zone(10, 10), 0).index).toBe(0);
  expect(lights.phase(zone(10, 10), 100).index).toBe(1);
  expect(lights.phase(zone(10, 10), 124).index).toBe(2);
  expect(lights.phase(zone(10, 10), 148).index).toBe(3);
  expect(lights.phase(zone(10, 10), 296).index).toBe(6);
  expect(lights.phase(zone(10, 10), 446).index).toBe(7);
  expect(lights.signal(zone(10, 10), 'up', 100)).toBe('red');
  expect(lights.signal(zone(10, 10), 'left', 148)).toBe('green');
  expect(lights.shouldStop(zone(10, 10), 'up', 296)).toBe(true);
});
