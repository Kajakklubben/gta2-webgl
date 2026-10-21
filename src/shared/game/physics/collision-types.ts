import type { GameObjectId, GameObjectKind, GameObjectPlacement } from '../gameobjects/gameobject';

/** Runtime collision participants translated by a game-specific physics adapter. */
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

/** Minimal object port consumed by an entity physics adapter. */
export interface CollisionObject {
  readonly id: GameObjectId;
  readonly kind: GameObjectKind;
  readonly state: unknown;
  readonly placement: GameObjectPlacement;
  getCollider(): readonly CollisionBody[];
  readPhysicsVelocity(): { vx?: number; vy?: number; angularVelocity?: number };
  applyPhysicsResult(pose: GameObjectPlacement, velocity: { vx?: number; vy?: number; angularVelocity?: number }): void;
}

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

export function collisionId(kind: GameObjectKind, id: GameObjectId) { return `${kind}:${id}`; }

