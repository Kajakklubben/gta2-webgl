import type { TrafficState } from '../../protocol/types';
import type { MapZone } from '../../engine/loader/models/map';
import { sameCollisionFloor } from '../physics/collision-rules';
import { directionFromRotation } from '../physics/motion-vector';
import { WORLD, tileToWorld } from '../world/world';

/** A player or pedestrian that can be encountered by an AI car. */
export interface TrafficObstacleActor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrafficForwardDirection {
  readonly x: number;
  readonly y: number;
}

/** Distances are world pixels, not map tiles. */
export interface TrafficObstacleScanOptions {
  readonly nearProbeDistance?: number | undefined;
  readonly farProbeDistance?: number | undefined;
  /** Half-width of the car's forward corridor. */
  readonly forwardCorridor?: number | undefined;
  /** Outer half-width used when checking the neighbouring lane. */
  readonly sideLaneCorridor?: number | undefined;
  readonly floorTolerance?: number | undefined;
  /** Prevents tiny numerical speed differences from being called slower. */
  readonly slowerSpeedMargin?: number | undefined;
}

export const TRAFFIC_OBSTACLE_DEFAULTS = {
  nearProbeDistance: tileToWorld(1.5),
  farProbeDistance: tileToWorld(3.5),
  forwardCorridor: tileToWorld(1.2),
  sideLaneCorridor: tileToWorld(2.5),
  floorTolerance: WORLD.interaction.sameFloor,
  slowerSpeedMargin: tileToWorld(0.05),
} as const;

export interface TrafficObstacleScanInput {
  readonly vehicle: TrafficState;
  readonly nearbyCars: readonly TrafficState[];
  readonly nearbyActors: readonly TrafficObstacleActor[];
  readonly arrowBlockerZones: readonly MapZone[];
  /** When supplied, this takes precedence over rotation and vehicle.rotation. */
  readonly forward?: TrafficForwardDirection | undefined;
  readonly rotation?: number | undefined;
  readonly options?: TrafficObstacleScanOptions | undefined;
}

export type TrafficObstacleCategory = 'car-ahead' | 'actor-ahead' | 'side-lane-car' | 'arrow-blocker';

export interface TrafficObstacleObservation {
  readonly category: TrafficObstacleCategory;
  readonly id: number | string;
  /** Euclidean distance from the vehicle to the obstacle. */
  readonly distance: number;
  /** Signed distance along the vehicle's forward axis. */
  readonly forwardDistance: number;
  /** Absolute distance from the vehicle's forward axis. */
  readonly lateralDistance: number;
  readonly near: boolean;
  readonly far: boolean;
  readonly slower?: boolean | undefined;
  readonly blocked?: boolean | undefined;
  readonly zone?: MapZone | undefined;
}

export interface TrafficObstacleProbe {
  readonly distance: number;
  readonly occupied: boolean;
  readonly blocked: boolean;
  readonly categories: readonly TrafficObstacleCategory[];
}

export interface TrafficObstacleScan {
  readonly forward: TrafficForwardDirection;
  readonly nearProbeDistance: number;
  readonly farProbeDistance: number;
  readonly nearProbe: TrafficObstacleProbe;
  readonly farProbe: TrafficObstacleProbe;
  readonly nearestCarAhead: TrafficObstacleObservation | undefined;
  readonly nearestSlowerOrBlockedCar: TrafficObstacleObservation | undefined;
  readonly nearestActorAhead: TrafficObstacleObservation | undefined;
  readonly nearestSideLaneCar: TrafficObstacleObservation | undefined;
  readonly arrowBlocker: TrafficObstacleObservation | undefined;
  readonly hasCarAhead: boolean;
  readonly hasSlowerOrBlockedCar: boolean;
  readonly hasActorAhead: boolean;
  readonly sideLaneOccupied: boolean;
  readonly arrowBlockerAhead: boolean;
  /** These are recommendations for the controller; the scan never applies them. */
  readonly shouldCoast: boolean;
  readonly shouldBrake: boolean;
  readonly shouldHandbrake: boolean;
  readonly shouldYield: boolean;
  readonly shouldAlignLane: boolean;
  readonly canCruise: boolean;
}

interface RelativePosition {
  readonly distance: number;
  readonly forwardDistance: number;
  readonly lateralDistance: number;
}

function normalizeDirection(direction: TrafficForwardDirection | undefined): TrafficForwardDirection | undefined {
  if (!direction) return undefined;
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-8) return undefined;
  return { x: direction.x / length, y: direction.y / length };
}

function compareIds(left: number | string, right: number | string) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function compareObservations(left: TrafficObstacleObservation, right: TrafficObstacleObservation) {
  return left.forwardDistance - right.forwardDistance
    || left.lateralDistance - right.lateralDistance
    || compareIds(left.id, right.id);
}

function relativePosition(origin: TrafficState, forward: TrafficForwardDirection, x: number, y: number): RelativePosition {
  const dx = x - origin.x;
  const dy = y - origin.y;
  return {
    distance: Math.hypot(dx, dy),
    forwardDistance: dx * forward.x + dy * forward.y,
    lateralDistance: Math.abs(dx * forward.y - dy * forward.x),
  };
}

function currentForwardSpeed(vehicle: TrafficState, forward: TrafficForwardDirection) {
  const projected = vehicle.vx * forward.x + vehicle.vy * forward.y;
  return Math.max(0, Number.isFinite(projected) ? projected : vehicle.speed);
}

function carIsBlocked(car: TrafficState) {
  return Boolean(car.wrecked)
    || car.aiState === 'brake'
    || car.aiState === 'yield'
    || car.aiState === 'stuck'
    || Boolean(car.brakeLights)
    || car.speed <= tileToWorld(0.05);
}

function zoneBounds(zone: MapZone) {
  // Map zones address tile centres. Expand by half a tile so a scan detects
  // the authored rectangular condition rather than only its centre point.
  const x1 = tileToWorld(zone.x - 0.5);
  const x2 = tileToWorld(zone.x + zone.w - 0.5);
  const y1 = -tileToWorld(zone.y - 0.5);
  const y2 = -tileToWorld(zone.y + zone.h - 0.5);
  return {
    minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
  };
}

function closestPointOnZone(zone: MapZone, x: number, y: number) {
  const bounds = zoneBounds(zone);
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, y)),
  };
}

function zoneId(zone: MapZone) {
  return zone.name || `${zone.type}:${zone.x}:${zone.y}:${zone.w}:${zone.h}`;
}

function isMainCategory(category: TrafficObstacleCategory) {
  return category !== 'side-lane-car';
}

function makeProbe(distance: number, observations: readonly TrafficObstacleObservation[]): TrafficObstacleProbe {
  const inProbe = observations.filter(obstacle => obstacle.forwardDistance >= 0 && obstacle.forwardDistance <= distance);
  const categories = [...new Set(inProbe.map(obstacle => obstacle.category))];
  return {
    distance,
    occupied: inProbe.length > 0,
    blocked: inProbe.some(obstacle => isMainCategory(obstacle.category)
      && (obstacle.category !== 'car-ahead' || obstacle.blocked === true)),
    categories,
  };
}

/**
 * Classify the source-style forward probes used by CarAI without applying any
 * control input. All distances and zone extents use the shared GTA2 world
 * scale, so the result is suitable for both local and authoritative runtimes.
 */
export function scanTrafficObstacles(input: TrafficObstacleScanInput): TrafficObstacleScan {
  const { vehicle } = input;
  const options = input.options ?? {};
  const nearProbeDistance = Math.max(0, options.nearProbeDistance ?? TRAFFIC_OBSTACLE_DEFAULTS.nearProbeDistance);
  const farProbeDistance = Math.max(nearProbeDistance, options.farProbeDistance ?? TRAFFIC_OBSTACLE_DEFAULTS.farProbeDistance);
  const forwardCorridor = Math.max(0, options.forwardCorridor ?? TRAFFIC_OBSTACLE_DEFAULTS.forwardCorridor);
  const sideLaneCorridor = Math.max(forwardCorridor, options.sideLaneCorridor ?? TRAFFIC_OBSTACLE_DEFAULTS.sideLaneCorridor);
  const floorTolerance = Math.max(0, options.floorTolerance ?? TRAFFIC_OBSTACLE_DEFAULTS.floorTolerance);
  const slowerSpeedMargin = Math.max(0, options.slowerSpeedMargin ?? TRAFFIC_OBSTACLE_DEFAULTS.slowerSpeedMargin);
  const forward = normalizeDirection(input.forward)
    ?? normalizeDirection(directionFromRotation(input.rotation ?? vehicle.rotation))
    ?? { x: 0, y: 1 };
  const ownSpeed = currentForwardSpeed(vehicle, forward);
  const observations: TrafficObstacleObservation[] = [];

  for (const car of input.nearbyCars) {
    if (car.id === vehicle.id || !sameCollisionFloor(vehicle, car, floorTolerance)) continue;
    const relative = relativePosition(vehicle, forward, car.x, car.y);
    if (relative.forwardDistance < 0 || relative.forwardDistance > farProbeDistance) continue;
    const slower = car.speed + slowerSpeedMargin < ownSpeed;
    const blocked = carIsBlocked(car);
    const category: TrafficObstacleCategory = relative.lateralDistance <= forwardCorridor ? 'car-ahead' : 'side-lane-car';
    if (relative.lateralDistance > sideLaneCorridor) continue;
    observations.push({
      category,
      id: car.id,
      distance: relative.distance,
      forwardDistance: relative.forwardDistance,
      lateralDistance: relative.lateralDistance,
      near: relative.forwardDistance <= nearProbeDistance,
      far: relative.forwardDistance <= farProbeDistance,
      slower,
      blocked,
    });
  }

  for (const actor of input.nearbyActors) {
    if (!sameCollisionFloor(vehicle, actor, floorTolerance)) continue;
    const relative = relativePosition(vehicle, forward, actor.x, actor.y);
    if (relative.forwardDistance < 0 || relative.forwardDistance > farProbeDistance || relative.lateralDistance > forwardCorridor) continue;
    observations.push({
      category: 'actor-ahead',
      id: actor.id,
      distance: relative.distance,
      forwardDistance: relative.forwardDistance,
      lateralDistance: relative.lateralDistance,
      near: relative.forwardDistance <= nearProbeDistance,
      far: relative.forwardDistance <= farProbeDistance,
      blocked: true,
    });
  }

  for (const zone of input.arrowBlockerZones) {
    const point = closestPointOnZone(zone, vehicle.x, vehicle.y);
    const relative = relativePosition(vehicle, forward, point.x, point.y);
    if (relative.forwardDistance < 0 || relative.forwardDistance > farProbeDistance || relative.lateralDistance > forwardCorridor) continue;
    observations.push({
      category: 'arrow-blocker',
      id: zoneId(zone),
      distance: relative.distance,
      forwardDistance: relative.forwardDistance,
      lateralDistance: relative.lateralDistance,
      near: relative.forwardDistance <= nearProbeDistance,
      far: relative.forwardDistance <= farProbeDistance,
      blocked: true,
      zone,
    });
  }

  const carsAhead = observations.filter(obstacle => obstacle.category === 'car-ahead').sort(compareObservations);
  const slowerOrBlockedCars = carsAhead
    .filter(obstacle => obstacle.slower === true || obstacle.blocked === true)
    .sort(compareObservations);
  const actorsAhead = observations.filter(obstacle => obstacle.category === 'actor-ahead').sort(compareObservations);
  const sideLaneCars = observations.filter(obstacle => obstacle.category === 'side-lane-car').sort(compareObservations);
  const arrowBlockers = observations.filter(obstacle => obstacle.category === 'arrow-blocker').sort(compareObservations);
  const nearestCarAhead = carsAhead[0];
  const nearestSlowerOrBlockedCar = slowerOrBlockedCars[0];
  const nearestActorAhead = actorsAhead[0];
  const nearestSideLaneCar = sideLaneCars[0];
  const arrowBlocker = arrowBlockers[0];
  const nearProbe = makeProbe(nearProbeDistance, observations);
  const farProbe = makeProbe(farProbeDistance, observations);
  const nearMainObstacle = observations.some(obstacle => obstacle.near && isMainCategory(obstacle.category));
  const farMainObstacle = observations.some(obstacle => obstacle.far && isMainCategory(obstacle.category));
  const shouldBrake = nearMainObstacle
    || (nearestSlowerOrBlockedCar !== undefined && nearestSlowerOrBlockedCar.forwardDistance <= nearProbeDistance);
  const shouldHandbrake = nearProbe.blocked;
  const shouldYield = Boolean(nearestSlowerOrBlockedCar?.blocked || nearestActorAhead || arrowBlocker);
  const shouldCoast = !shouldBrake && farMainObstacle;
  const sideLaneOccupied = nearestSideLaneCar !== undefined;

  return {
    forward,
    nearProbeDistance,
    farProbeDistance,
    nearProbe,
    farProbe,
    nearestCarAhead,
    nearestSlowerOrBlockedCar,
    nearestActorAhead,
    nearestSideLaneCar,
    arrowBlocker,
    hasCarAhead: nearestCarAhead !== undefined,
    hasSlowerOrBlockedCar: nearestSlowerOrBlockedCar !== undefined,
    hasActorAhead: nearestActorAhead !== undefined,
    sideLaneOccupied,
    arrowBlockerAhead: arrowBlocker !== undefined,
    shouldCoast,
    shouldBrake,
    shouldHandbrake,
    shouldYield,
    shouldAlignLane: Boolean(nearestCarAhead || nearestActorAhead) && !sideLaneOccupied,
    canCruise: !nearMainObstacle && !farMainObstacle,
  };
}
