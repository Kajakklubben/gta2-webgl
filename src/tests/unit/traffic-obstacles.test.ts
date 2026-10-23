import { describe, expect, it } from 'vitest';
import type { TrafficState } from '../../shared/protocol/types';
import { scanTrafficObstacles, type TrafficObstacleActor } from '../../shared/domain/vehicles/traffic-obstacles';
import type { MapZone } from '../../shared/engine/loader/models/map';
import { WORLD, tileToWorld } from '../../shared/domain/world/world';

function car(id: number, overrides: Partial<TrafficState> = {}): TrafficState {
  return {
    id,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    speed: 0,
    color: 0,
    health: 100,
    vx: 0,
    vy: 0,
    angularVelocity: 0,
    throttle: 0,
    brakePressure: 0,
    handbrakeForce: 0,
    passengers: [],
    occupants: [],
    doorStates: [],
    ...overrides,
  };
}

interface ScanOverrides {
  nearbyCars?: readonly TrafficState[];
  nearbyActors?: readonly TrafficObstacleActor[];
  arrowBlockerZones?: readonly MapZone[];
  forward?: { x: number; y: number };
  rotation?: number;
}

const scan = (vehicle: TrafficState, options: ScanOverrides = {}) => scanTrafficObstacles({
  vehicle,
  nearbyCars: options.nearbyCars ?? [],
  nearbyActors: options.nearbyActors ?? [],
  arrowBlockerZones: options.arrowBlockerZones ?? [],
  forward: options.forward,
  rotation: options.rotation,
  ...options,
});

describe('scanTrafficObstacles', () => {
  it('finds the nearest slower car in the forward corridor', () => {
    const vehicle = car(1, { speed: 100, vx: 0, vy: 100 });
    const farther = car(3, { y: tileToWorld(2), speed: 20, vx: 0, vy: 20 });
    const nearer = car(2, { y: tileToWorld(1), speed: 120, vx: 0, vy: 120 });

    const result = scan(vehicle, { nearbyCars: [farther, nearer] });

    expect(result.nearestCarAhead?.id).toBe(2);
    expect(result.nearestSlowerOrBlockedCar?.id).toBe(3);
    expect(result.nearestSlowerOrBlockedCar?.forwardDistance).toBe(tileToWorld(2));
    expect(result.hasSlowerOrBlockedCar).toBe(true);
    expect(result.shouldBrake).toBe(true);
    expect(result.shouldCoast).toBe(false);
  });

  it('classifies an actor in the near probe as a brake and yield obstacle', () => {
    const vehicle = car(1, { speed: 80, vx: 0, vy: 80 });
    const result = scan(vehicle, {
      nearbyActors: [{ id: 'pedestrian:4', x: 0, y: tileToWorld(1), z: 0 }],
    });

    expect(result.nearestActorAhead?.id).toBe('pedestrian:4');
    expect(result.nearProbe.categories).toContain('actor-ahead');
    expect(result.shouldBrake).toBe(true);
    expect(result.shouldHandbrake).toBe(true);
    expect(result.shouldYield).toBe(true);
  });

  it('reports a car in the adjacent forward lane without treating it as ahead', () => {
    const vehicle = car(1, { speed: 80, vx: 0, vy: 80 });
    const result = scan(vehicle, {
      nearbyCars: [car(2, { x: tileToWorld(1.75), y: tileToWorld(1.5), speed: 20, vx: 0, vy: 20 })],
    });

    expect(result.nearestCarAhead).toBeUndefined();
    expect(result.nearestSideLaneCar?.id).toBe(2);
    expect(result.sideLaneOccupied).toBe(true);
    expect(result.shouldAlignLane).toBe(false);
  });

  it('filters cars and actors on unrelated floors', () => {
    const vehicle = car(1, { speed: 80, vx: 0, vy: 80, z: 3, collisionLayer: 3 });
    const result = scan(vehicle, {
      nearbyCars: [car(2, { y: tileToWorld(1), z: 5, collisionLayer: 5 })],
      nearbyActors: [{ id: 'player:2', x: 0, y: tileToWorld(1), z: 5 }],
    });

    expect(result.hasCarAhead).toBe(false);
    expect(result.hasActorAhead).toBe(false);
    expect(result.canCruise).toBe(true);
    expect(WORLD.interaction.sameFloor).toBe(1);
  });

  it('detects an authored arrow-blocker zone in the far forward probe', () => {
    const vehicle = car(1, { speed: 80, vx: 0, vy: 80 });
    const result = scan(vehicle, {
      arrowBlockerZones: [{ type: 3, typeName: 'arrow-blocker', x: 0, y: -2, w: 1, h: 1, name: 'blocked-lane' }],
    });

    expect(result.arrowBlockerAhead).toBe(true);
    expect(result.arrowBlocker?.id).toBe('blocked-lane');
    expect(result.arrowBlocker?.distance).toBe(tileToWorld(1.5));
    expect(result.farProbe.categories).toContain('arrow-blocker');
    expect(result.shouldYield).toBe(true);
  });
});
