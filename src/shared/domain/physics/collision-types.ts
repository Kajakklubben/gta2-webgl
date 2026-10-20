import * as planck from 'planck';
import type { GameObject, GameObjectId, GameObjectKind } from '../../game/gameobjects/gameobject';
import { WORLD, worldToPhysics } from '../world/world';

// The project uses pixels at a 10:1 Planck metre scale. Use a sub-pixel
// solver tolerance so the native contact result does not leave visible gaps.
planck.Settings.linearSlop = Math.min(planck.Settings.linearSlop, worldToPhysics(.000001));

/** Runtime collision participants are translated into native Planck fixtures. */
export interface CollisionBody {
  readonly id: string;
  readonly objectId: GameObjectId;
  readonly kind: GameObjectKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Integer map layer used for collision filtering; z may be fractional. */
  readonly layer?: number;
  readonly radius: number;
  readonly box?: { readonly width: number; readonly height: number; readonly rotation: number };
  readonly category: number;
  readonly mask: number;
  readonly solid: boolean;
  readonly active: boolean;
  readonly blockingWeight?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly fixedRotation?: boolean;
  readonly object: CollisionObject;
}

/** The small interface used by the Planck-backed collision adapter. */
export type CollisionObject = Pick<GameObject<any>, 'id' | 'kind' | 'state' | 'placement' | 'getCollider' | 'readPhysicsVelocity' | 'applyPhysicsResult'>;

export interface CollisionContact {
  readonly velocityA?: { x: number; y: number };
  readonly velocityB?: { x: number; y: number };
  readonly a: CollisionBody;
  readonly b: CollisionBody;
  readonly normalX: number;
  readonly normalY: number;
  readonly distance: number;
  readonly depth: number;
  readonly pointX: number;
  readonly pointY: number;
}

export interface CollisionQuery {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly layer?: number;
  readonly radius: number;
  readonly kinds?: readonly GameObjectKind[];
  readonly category?: number;
  readonly mask?: number;
  readonly floorTolerance?: number;
}

export interface CollisionStart {
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
}

export const COLLISION_CATEGORY = {
  player: 1 << 0,
  vehicle: 1 << 1,
  npc: 1 << 2,
  pickup: 1 << 3,
  projectile: 1 << 4,
  hazard: 1 << 5,
  'map-object': 1 << 6,
} as const;

export function collisionId(kind: GameObjectKind, id: GameObjectId) { return `${kind}:${id}`; }

type CollisionFloor = Pick<CollisionBody, 'z'> & {
  /** CollisionBody uses `layer`; protocol snapshots use `collisionLayer`. */
  layer?: number | undefined;
  collisionLayer?: number | undefined;
};

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

/** Proximity checks are gameplay queries, not collision detection. */
export function withinCollisionRadius(a: CollisionFloor & Pick<CollisionBody, 'x' | 'y'>, b: CollisionFloor & Pick<CollisionBody, 'x' | 'y'>, radius: number, floorTolerance: number = WORLD.interaction.sameFloor) {
  if (!sameCollisionFloor(a, b, floorTolerance)) return false;
  const point = new planck.CircleShape(0);
  const range = new planck.CircleShape(worldToPhysics(radius));
  return planck.Distance.testOverlap(
    point, 0, range, 0,
    new planck.Transform({ x: worldToPhysics(a.x), y: worldToPhysics(a.y) }),
    new planck.Transform({ x: worldToPhysics(b.x), y: worldToPhysics(b.y) }),
  );
}

export function defaultCollisionCategory(kind: GameObjectKind) { return COLLISION_CATEGORY[kind]; }

