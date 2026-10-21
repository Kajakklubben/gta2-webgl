import { WORLD } from '../world/world';

/** Collision categories are part of the GTA2 gameplay contract, not the solver. */
export const COLLISION_CATEGORY = {
  player: 1 << 0,
  vehicle: 1 << 1,
  npc: 1 << 2,
  pickup: 1 << 3,
  projectile: 1 << 4,
  hazard: 1 << 5,
  'map-object': 1 << 6,
} as const;

export type CollisionKind = keyof typeof COLLISION_CATEGORY;

export interface CollisionFloor {
  readonly z: number;
  readonly layer?: number | undefined;
  readonly collisionLayer?: number | undefined;
}

export interface CollisionPosition extends CollisionFloor {
  readonly x: number;
  readonly y: number;
}

function floorLayer(value: CollisionFloor) {
  return value.layer ?? value.collisionLayer;
}

export function sameCollisionFloor(a: CollisionFloor, b: CollisionFloor, tolerance: number = WORLD.interaction.sameFloor) {
  const leftLayer = floorLayer(a), rightLayer = floorLayer(b);
  if (leftLayer !== undefined && rightLayer !== undefined) {
    // The integer layer filters map walls and portals, while the continuous
    // height still distinguishes a stale/explicit z override from a nearby
    // slope on that layer.
    return Math.abs(leftLayer - rightLayer) <= Math.max(0, Math.trunc(tolerance)) && Math.abs(a.z - b.z) <= tolerance;
  }
  return Math.abs(a.z - b.z) <= tolerance;
}

/** Proximity checks are gameplay queries, not native collision detection. */
export function withinCollisionRadius(a: CollisionPosition, b: CollisionPosition, radius: number, floorTolerance: number = WORLD.interaction.sameFloor) {
  return sameCollisionFloor(a, b, floorTolerance) && Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

export function defaultCollisionCategory(kind: CollisionKind) {
  return COLLISION_CATEGORY[kind];
}
