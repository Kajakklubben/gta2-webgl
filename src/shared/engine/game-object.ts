import type { PhysicsBody } from './physics-world';
import type { SpatialPlacement } from './spatial-depth';

export type EngineGameObjectId = string | number;
export type EngineGameObjectKind = string;

export type EngineCollisionShape =
  | { readonly type: 'box'; readonly width: number; readonly height: number }
  | { readonly type: 'circle'; readonly radius: number };

export interface EngineGameObjectCollision {
  readonly shape: EngineCollisionShape;
  readonly solid?: boolean;
  readonly weight?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly fixedRotation?: boolean;
  readonly category?: number;
  readonly mask?: number;
}

interface ResolvedEngineGameObjectCollision {
  readonly shape: EngineCollisionShape;
  readonly solid: boolean;
  readonly weight: number;
  readonly restitution: number;
  readonly friction: number;
  readonly fixedRotation: boolean;
  readonly category: number;
  readonly mask: number;
}

export interface EnginePhysicsReadOptions {
  readonly updateRotation?: boolean;
  readonly updateAngularVelocity?: boolean;
  readonly updateSpeed?: boolean;
  readonly afterRead?: () => void;
}

export interface EngineGameObjectPlacement extends SpatialPlacement {}

export interface EngineCollisionBody<TKind extends EngineGameObjectKind = EngineGameObjectKind> {
  readonly id: string;
  readonly objectId: EngineGameObjectId;
  readonly kind: TKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
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
  readonly object: GameObject<any, any, TKind>;
}

/**
 * Engine-owned object boundary for placement, collision shape, and physics
 * state transfer. Game modules extend this with lifecycle, rendering, and
 * domain behavior; none of those concerns are needed by the solver.
 */
export abstract class GameObject<
  TState extends object,
  TId extends EngineGameObjectId = EngineGameObjectId,
  TKind extends EngineGameObjectKind = EngineGameObjectKind,
> {
  private collisionConfig: readonly Readonly<ResolvedEngineGameObjectCollision>[] = [];
  private readonly stateData: TState;
  /**
   * The live simulation body belongs to the object it represents. The
   * PhysicsRuntime still owns creation, stepping, and destruction; this
   * binding only keeps the object/body relationship explicit at the engine
   * boundary.
   */
  private simulationBody: PhysicsBody | undefined;

  protected constructor(
    readonly id: TId,
    state: TState,
    readonly kind: TKind,
  ) {
    this.stateData = state;
  }

  get collision(): readonly Readonly<ResolvedEngineGameObjectCollision>[] { return this.collisionConfig; }

  protected set collision(value: EngineGameObjectCollision) {
    this.collisionConfig = [Object.freeze({
      ...value,
      shape: Object.freeze({ ...value.shape }),
      solid: value.solid ?? true,
      weight: value.weight ?? 1,
      restitution: value.restitution ?? 0,
      friction: value.friction ?? 0,
      fixedRotation: value.fixedRotation ?? true,
      category: value.category ?? this.defaultCollisionCategory(),
      mask: value.mask ?? 0xffff,
    })];
  }

  /** Games may provide their own category mapping without entering the engine. */
  protected defaultCollisionCategory() { return 0xffff; }

  get state(): Readonly<TState> { return this.stateData; }
  protected get mutableState(): TState { return this.stateData; }
  get collisionEnabled() { return true; }

  get physicsBody(): PhysicsBody | undefined { return this.simulationBody; }

  attachPhysicsBody(body: PhysicsBody): PhysicsBody | undefined {
    const previous = this.simulationBody;
    this.simulationBody = body;
    return previous;
  }

  detachPhysicsBody(): PhysicsBody | undefined {
    const body = this.simulationBody;
    this.simulationBody = undefined;
    return body;
  }

  get blockingWeight() {
    return this.collision[0]?.weight ?? 1;
  }

  readPhysicsVelocity(): { vx?: number; vy?: number; angularVelocity?: number } {
    const state = this.stateData as { vx?: number; vy?: number; angularVelocity?: number };
    const result: { vx?: number; vy?: number; angularVelocity?: number } = {};
    if (state.vx !== undefined) result.vx = state.vx;
    if (state.vy !== undefined) result.vy = state.vy;
    if (state.angularVelocity !== undefined) result.angularVelocity = state.angularVelocity;
    return result;
  }

  protected setVelocity(vx: number, vy: number): void {
    const state = this.stateData as { vx?: number; vy?: number };
    if ('vx' in state) state.vx = vx;
    if ('vy' in state) state.vy = vy;
  }

  readPhysics(body: PhysicsBody, physicsToWorld: (value: number) => number, options: EnginePhysicsReadOptions = {}) {
    const state = this.mutableState as {
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      rotation?: number;
      angularVelocity?: number;
      speed?: number;
    };
    const position = body.getPosition();
    const velocity = body.getLinearVelocity();
    state.x = physicsToWorld(position.x);
    state.y = -physicsToWorld(position.y);
    if ('vx' in state) state.vx = physicsToWorld(velocity.x);
    if ('vy' in state) state.vy = -physicsToWorld(velocity.y);
    if (options.updateRotation !== false && 'rotation' in state) {
      state.rotation = ((-body.getAngle() % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }
    if (options.updateAngularVelocity !== false && 'angularVelocity' in state) state.angularVelocity = -body.getAngularVelocity();
    if (options.updateSpeed !== false && 'speed' in state && typeof state.rotation === 'number' && typeof state.vx === 'number' && typeof state.vy === 'number') {
      state.speed = state.vx * (-Math.sin(state.rotation)) + state.vy * Math.cos(state.rotation);
    }
    options.afterRead?.();
  }

  applyPhysicsResult(pose: EngineGameObjectPlacement, velocity: { vx?: number; vy?: number; angularVelocity?: number }): void {
    this.placement = pose;
    const state = this.stateData as { vx?: number; vy?: number; angularVelocity?: number };
    if (velocity.vx !== undefined && state.vx !== undefined) state.vx = velocity.vx;
    if (velocity.vy !== undefined && state.vy !== undefined) state.vy = velocity.vy;
    if (velocity.angularVelocity !== undefined && state.angularVelocity !== undefined) state.angularVelocity = velocity.angularVelocity;
  }

  get placement(): Readonly<EngineGameObjectPlacement> {
    const pose = this.mutableState as Partial<EngineGameObjectPlacement>;
    const layer = (this.mutableState as { collisionLayer?: number }).collisionLayer;
    const result: EngineGameObjectPlacement = { x: pose.x ?? 0, y: pose.y ?? 0, z: pose.z ?? 0, rotation: pose.rotation ?? 0 };
    if (layer !== undefined) result.layer = layer;
    return result;
  }

  protected set placement(value: EngineGameObjectPlacement) {
    const pose = this.mutableState as Partial<EngineGameObjectPlacement>;
    pose.x = value.x; pose.y = value.y; pose.z = value.z; pose.rotation = value.rotation;
    const state = this.mutableState as { collisionLayer?: number };
    if (value.layer === undefined) delete state.collisionLayer;
    else state.collisionLayer = value.layer;
  }

  getCollider(): EngineCollisionBody<TKind>[] {
    const config = this.collision[0];
    if (!config) return [];
    const pose = { ...this.placement };
    const shape = config.shape;
    const base = {
      id: `${this.kind}:${String(this.id)}`,
      objectId: this.id,
      kind: this.kind,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      category: config.category,
      mask: config.mask,
      solid: config.solid,
      active: this.collisionEnabled,
      blockingWeight: this.blockingWeight,
      restitution: config.restitution,
      friction: config.friction,
      fixedRotation: config.fixedRotation,
      object: this,
    };
    const withLayer = <T extends object>(value: T): T & { layer?: number } => {
      if (pose.layer === undefined) return value;
      return { ...value, layer: pose.layer };
    };
    const radius = shape.type === 'circle' ? shape.radius : Math.hypot(shape.width, shape.height) / 2;
    if (shape.type === 'box') return [withLayer({ ...base, radius, box: { width: shape.width, height: shape.height, rotation: pose.rotation } })];
    return [withLayer({ ...base, radius })];
  }
}

/** Descriptive alias for game adapters that want to distinguish the engine base. */
export { GameObject as EngineGameObject };
