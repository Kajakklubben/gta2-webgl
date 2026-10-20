import { GameObject, type GameObjectKind, type GameObjectUpdateContext } from './gameobject';

/** Optional behaviour hook. The object is passed instead of its raw state so
 * behaviour code uses the same encapsulated command surface as every other
 * system. */
export type GameObjectUpdateHandler<T extends object> = (object: StatefulGameObject<T, string | number>, context: GameObjectUpdateContext) => void;

export abstract class StatefulGameObject<T extends object, TId extends string | number> extends GameObject<T, TId> {
  private readonly updateHandler: GameObjectUpdateHandler<T>;

  protected constructor(
    id: TId,
    state: T,
    kind: GameObjectKind,
    updateHandler?: GameObjectUpdateHandler<T>,
  ) {
    super(id, state, kind);
    this.updateHandler = updateHandler ?? (() => {});
  }

  update(context: GameObjectUpdateContext): void { this.updateHandler(this, context); }

  /** Apply a complete authoritative pose to this object's positional state. */
  setPose(pose: MobilePose): void {
    const state = this.mutableState as T & { x: number; y: number; z: number; rotation: number; vx?: number; vy?: number; collisionLayer?: number; grounded?: boolean; verticalVelocity?: number };
    state.x = pose.x; state.y = pose.y; state.z = pose.z; state.rotation = pose.rotation;
    if ('vx' in state && pose.vx !== undefined) state.vx = pose.vx;
    if ('vy' in state && pose.vy !== undefined) state.vy = pose.vy;
    if ('collisionLayer' in state) {
      if (pose.collisionLayer === undefined) delete state.collisionLayer;
      else state.collisionLayer = pose.collisionLayer;
    }
    if ('grounded' in state && pose.grounded !== undefined) state.grounded = pose.grounded;
    if ('verticalVelocity' in state && pose.verticalVelocity !== undefined) state.verticalVelocity = pose.verticalVelocity;
  }

}

/** A placed world object with no per-tick movement integration. Static objects
 * still participate in the common lifecycle and rendering paths, but their
 * collision descriptor is immovable when the shared collision backend sees it. */
export abstract class StaticGameObject<T extends object, TId extends string | number> extends StatefulGameObject<T, TId> {
  protected constructor(id: TId, state: T, kind: GameObjectKind) {
    super(id, state, kind);
  }

  override get blockingWeight() { return 0; }
}

/** Shared world-actor behavior for entities that occupy and move through the map. */
export interface MobileState {
  x: number;
  y: number;
  z: number;
  rotation: number;
  health: number;
}

/** Canonical pose command used when one actor asks another actor to move. */
export interface MobilePose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotation: number;
  readonly vx?: number | undefined;
  readonly vy?: number | undefined;
  readonly collisionLayer?: number | undefined;
  readonly grounded?: boolean | undefined;
  readonly verticalVelocity?: number | undefined;
}

export abstract class MobileGameObject<T extends MobileState, TId extends string | number> extends StatefulGameObject<T, TId> {
  protected constructor(id: TId, state: T, kind: GameObjectKind, update?: GameObjectUpdateHandler<T>) {
    super(id, state, kind, update);
  }

  get alive() { return this.mutableState.health > 0; }

}
