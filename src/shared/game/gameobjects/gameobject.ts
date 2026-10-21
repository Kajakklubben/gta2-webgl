import { collisionId, defaultCollisionCategory, type CollisionBody, type CollisionQuery } from '../physics/collision-world';
import type { PhysicsBody } from '../../engine/physics-world';
import type { SpatialPlacement, SpatialRenderHint } from '../../engine/spatial-depth';
import type { SurfaceResult } from '../../domain/physics/map-surface';
import type { HazardState, NpcState, PlayerState, WorldEventInput } from '../../protocol/types';
import type { WeaponSystem } from '../../domain/combat/weapon-system';
import type { GameState } from './game-state';
import type { HazardObject } from '../effects/hazard';
import type { PickupObject } from '../effects/pickup';
import type { ProjectileObject } from '../effects/projectile';
import type { NpcObject } from './npc';
import type { PlayerObject } from './player';
import type { VehicleObject } from './vehicle';
import type { StaticMapObject } from './map-object';

export type CollisionShape = { type: 'box'; width: number; height: number } | { type: 'circle'; radius: number };
export interface GameObjectCollision {
  readonly shape: CollisionShape;
  readonly solid?: boolean;
  /** Zero is immovable; positive weights share separation between movable objects. */
  readonly weight?: number;
  /** Native solver contact response. Defaults match GTA2's non-bouncy ped objects. */
  readonly restitution?: number;
  readonly friction?: number;
  /** Keep circles/ped bodies upright; vehicle boxes may opt into native yaw. */
  readonly fixedRotation?: boolean;
  readonly category?: number;
  readonly mask?: number;
}

interface ResolvedGameObjectCollision {
  readonly shape: CollisionShape;
  readonly solid: boolean;
  readonly weight: number;
  readonly restitution: number;
  readonly friction: number;
  readonly fixedRotation: boolean;
  readonly category: number;
  readonly mask: number;
}

export type GameObjectId = string | number;
export type GameObjectKind = 'player' | 'vehicle' | 'pickup' | 'projectile' | 'npc' | 'hazard' | 'map-object';
export type GameObjectKey = string;

export function gameObjectKey(kind: GameObjectKind, id: GameObjectId): GameObjectKey {
  return `${kind}:${String(id)}`;
}

/** Canonical world placement shared by every placed game object. */
export interface GameObjectPlacement extends SpatialPlacement {}

/** Engine-facing sprite description consumed by the client renderer. */
export type SpriteAtlas = 'player' | 'cars' | 'codeObjects' | 'objects';
/** Source-facing identity used by the sprite engine. The legacy atlas/model
 * fields remain on GameObjectSprite for wire and scenario compatibility, but
 * new callers should identify an asset by its source bank and model id. */
export type SpriteDefinitionBank = 'car' | 'ped' | 'code-object' | 'map-object';
export interface SpriteDefinitionRef {
  readonly bank: SpriteDefinitionBank;
  readonly sourceId: number;
}
export type SpritePaletteArea =
  | 'tiles'
  | 'sprites'
  | 'car-remaps'
  | 'ped-remaps'
  | 'code-object-remaps'
  | 'map-object-remaps'
  | 'user-remaps'
  | 'font-remaps';
export interface SpritePaletteRef {
  readonly area: SpritePaletteArea;
  readonly index: number;
}
export interface CarSpriteLights {
  readonly headlights?: boolean;
  readonly brakeLights?: boolean;
  readonly emergencyLights?: boolean;
}
export interface GameObjectSpriteAttachment {
  readonly sprite: GameObjectSpriteLayer;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly offsetZ?: number;
  readonly rotationOffset?: number;
  readonly inheritRotation?: boolean;
}
export type SpriteSourceSequence =
  | 'rocket-trail'
  | 'explosion-small'
  | 'explosion-large'
  | 'fire-trail'
  | 'blood-burst'
  | 'impact-burst'
  | 'water-splash'
  | 'electric-arc'
  | 'car-fire-small'
  | 'car-fire-large'
  | 'car-fire-wreck'
  | 'ped-fire';
export type SpriteAnimation =
  | 'idle' | 'walking' | 'running' | 'jumping' | 'armedRunning' | 'armedWalking'
  | 'firing' | 'throwing' | 'throwingIdle' | 'falling' | 'knockdown' | 'dead'
  | 'lying' | 'lyingReverse' | 'electrocuted' | 'entering' | 'exiting' | 'pulledOut'
  | 'base' | 'rotate' | 'projectile' | 'slick' | 'mine' | 'fire' | 'blood' | 'impact' | 'skid' | 'water';
export interface GameObjectSpriteLayer {
  readonly atlas: SpriteAtlas;
  /** Source definition identity. This is the preferred lookup key. */
  readonly definition?: SpriteDefinitionRef;
  /** Explicit source palette. The engine derives this from the definition when omitted. */
  readonly palette?: SpritePaletteRef;
  readonly model?: number;
  /** Optional non-contiguous source frame sequence. */
  readonly modelSequence?: readonly number[];
  /** Source Object_2C model id, distinct from a resolved code-bank frame. */
  readonly sourceModel?: number;
  /** Named source sequence resolved by the sprite engine. */
  readonly sourceSequence?: SpriteSourceSequence;
  readonly animation?: SpriteAnimation;
  readonly frame?: number;
  readonly frameCount?: number;
  readonly frameMs?: number;
  /** Source fixed-step frame delay. The renderer converts ticks to ms. */
  readonly frameTicks?: number;
  /** Source sequences whose frame delay changes at a transition boundary. */
  readonly frameTicksByFrame?: readonly number[];
  /** Whether an unbounded animation wraps at the end of its sequence. */
  readonly loop?: boolean;
  /** Source-relative palette remap for a code-object sprite. */
  readonly codeObjectRemap?: number;
  /** Stable state-machine key. A changed key resets the sequence timer. */
  readonly animationKey?: string;
  /** Car sprite bank to use for authored paint/damage variants. */
  readonly variant?: 'base' | 'paint' | 'damage';
  readonly variantIndex?: number;
  /** Logical source DELS bits to compose over the selected car paint. */
  readonly carDeltaIndices?: readonly number[];
  /** Runtime light channels that resolve to authored car DELS bits. */
  readonly carLights?: CarSpriteLights;
  /** Source pedestrian palette remap index, before the style ped-palette base is applied. */
  readonly pedRemap?: number;
  readonly placement: GameObjectPlacement;
  readonly opacity?: number;
  readonly depthTest?: boolean;
  readonly depthWrite?: boolean;
  readonly alphaTest?: number;
  /** Semantic intent resolved by the client renderer. */
  readonly renderDepth?: SpatialRenderHint;
  /** Source sprite blend mode for presentation layers. */
  readonly blending?: 'normal' | 'additive';
  readonly fallbackColor?: number;
  /** Presentation scale relative to the decoded source pixels. */
  readonly scale?: number;
  /** Mirror the decoded sprite around its local horizontal axis. */
  readonly mirrorY?: boolean;
  /** Optional source-style ground shadow rendered from the same sprite. */
  readonly shadow?: { opacity?: number; scale?: number; offsetX?: number; offsetY?: number };
  /** Child sprites that follow this layer's world transform. */
  readonly attachments?: readonly GameObjectSpriteAttachment[];
}

export interface GameObjectSprite extends GameObjectSpriteLayer {
  /** Optional top-down beam geometry used by transient source particle effects. */
  readonly beam?: {
    readonly points: readonly { x: number; y: number; z: number }[];
    readonly width: number;
    readonly color: number;
    readonly opacity?: number;
  };
  /** Additional source particle layers rendered with the same draw command. */
  readonly layers?: readonly GameObjectSpriteLayer[];
}

export interface GameObjectUpdateContext {
  readonly tick: number;
  readonly dt: number;
  /** Narrow lifecycle and ownership services available to object behaviours. */
  readonly world: GameStateAccess;
  /** Optional authoritative combat services used by transient effect objects. */
  readonly combat?: GameObjectCombatContext | undefined;
}

/** World-facing actions available to projectile and hazard game objects. The
 * effect owns when it acts; the world owns queries, damage routing, and event
 * replication. */
export interface GameObjectCombatContext {
  readonly authoritative: boolean;
  readonly weaponSystem: Pick<WeaponSystem, 'get'>;
  nextEventId(): number;
  nextHazardId(): number;
  /** Allocate a replicated transient source effect. */
  spawnEffect(effect: Omit<HazardState, 'id'>): void;
  canPlaceHazard(x: number, y: number, z: number): boolean;
  surfaceAt(x: number, y: number, z: number): SurfaceResult;
  queryCircle(query: CollisionQuery): readonly CollisionBody[];
  findPlayer(id: string): PlayerObject | undefined;
  findVehicle(id: number): VehicleObject | undefined;
  findNpc(id: number): NpcObject | undefined;
  /** Finalize a source-style drowning death, including vehicle detachment. */
  killNpc(target: NpcObject): void;
  damagePlayer(target: PlayerObject, damage: number, killer?: string, cause?: PlayerState['deathCause']): void;
  damageVehicle(target: VehicleObject, damage: number, x?: number, y?: number, sourceModel?: number, attacker?: string): void;
  damageNpc(target: NpcObject, damage: number, killer?: string, sourceModel?: number, impactRotation?: number, cause?: NpcState['deathCause']): void;
  readonly isWaterAt: (point: { x: number; y: number; z: number }) => boolean;
  raiseWanted(player: PlayerObject): void;
  emit(event: WorldEventInput): void;
}

/** Narrow capability ports used by effect and actor actions. The world builds
 * one full context, but individual objects only depend on the operations they
 * actually need. */
export type ProjectileCombatContext = Pick<GameObjectCombatContext,
  'authoritative' | 'weaponSystem' | 'nextHazardId' | 'spawnEffect' | 'surfaceAt' | 'findPlayer' |
  'findVehicle' | 'findNpc' | 'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'raiseWanted' | 'queryCircle' | 'emit'>;
export type ProjectileImpactContext = Pick<GameObjectCombatContext,
  'authoritative' | 'weaponSystem' | 'findPlayer' | 'findVehicle' | 'findNpc' |
  'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'raiseWanted' | 'emit' | 'nextHazardId' | 'spawnEffect'>;
export type HazardCombatContext = Pick<GameObjectCombatContext,
  'authoritative' | 'weaponSystem' | 'nextHazardId' | 'spawnEffect' | 'queryCircle' | 'findPlayer' | 'findVehicle' | 'findNpc' |
  'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'emit'>;
export type PlayerDamageContext = Pick<GameObjectCombatContext, 'damagePlayer' | 'emit' | 'spawnEffect'>;
export type VehicleCollisionContext = Pick<GameObjectCombatContext, 'damageVehicle'>;

export interface GameObjectDrawCommand {
  readonly kind: GameObjectKind;
  readonly id: GameObjectId;
  readonly key: GameObjectKey;
  /** Read-only render data. GameObject state is never writable through a draw command. */
  readonly state: Readonly<object>;
  readonly sprite: GameObjectSprite;
}

export type SpriteDrawCommand = GameObjectDrawCommand;

/** Rendering stays engine-agnostic. A client renderer consumes these commands. */
export interface GameObjectDrawContext {
  readonly now: number;
  submit(command: GameObjectDrawCommand): void;
}

/** Stable object-host contract exposed to domain behaviours. */
export interface GameObjectWorld {
  spawn<T extends GameObject<any>>(object: T): T;
  despawn(object: GameObject<any>): void;
  deferSpawn<T extends GameObject<any>>(object: T): T;
  deferDespawn(object: GameObject<any>): void;
}

/** Optional differences between a native physics body and an object's
 * replicated state. The coordinate/velocity transfer itself belongs to the
 * common object adapter; individual objects only opt out of fields their
 * body does not own. */
export interface PhysicsReadOptions {
  readonly updateRotation?: boolean;
  readonly updateAngularVelocity?: boolean;
  readonly updateSpeed?: boolean;
  readonly afterRead?: () => void;
}

/** Shared state view available to every registered object. The concrete
 * GameState adds typed collections, while this narrow contract keeps object
 * behaviours independent of the world runtime composition root. */
export interface GameStateAccess extends GameObjectWorld {
  findPlayer(id: string): PlayerObject | undefined;
  findVehicle(id: number): VehicleObject | undefined;
  findPickup(id: number): PickupObject | undefined;
  findProjectile(id: string | number): ProjectileObject | undefined;
  findHazard(id: number): HazardObject | undefined;
  findNpc(id: number): NpcObject | undefined;
  findMapObject(id: number): StaticMapObject | undefined;
  objectsOfKind<T extends GameObject<any> = GameObject<any>>(kind: GameObjectKind): readonly T[];
  readonly players: readonly PlayerObject[];
  readonly vehicles: readonly VehicleObject[];
  readonly pickups: readonly PickupObject[];
  readonly projectiles: readonly ProjectileObject[];
  readonly hazards: readonly HazardObject[];
  readonly npcs: readonly NpcObject[];
  readonly mapObjects: readonly StaticMapObject[];
}

/** Common lifecycle for every simulated/rendered world entity. */
export abstract class GameObject<TState extends object, TId extends GameObjectId = GameObjectId> {
  private collisionConfig: readonly Readonly<ResolvedGameObjectCollision>[] = [];
  /** Collision configuration is hidden from systems; subclasses set it during construction or behavior setup. */
  get collision(): readonly Readonly<ResolvedGameObjectCollision>[] { return this.collisionConfig; }
  protected set collision(value: GameObjectCollision) {
    this.collisionConfig = [Object.freeze({
      ...value,
      shape: Object.freeze({ ...value.shape }),
      solid: value.solid ?? true,
      weight: value.weight ?? 1,
      restitution: value.restitution ?? 0,
      friction: value.friction ?? 0,
      fixedRotation: value.fixedRotation ?? true,
      category: value.category ?? defaultCollisionCategory(this.kind),
      mask: value.mask ?? 0xffff,
    })];
  }
  private worldObject: GameStateAccess | undefined = undefined;
  get collisionEnabled() { return true; }
  get blockingWeight() {
    const first = this.collision[0];
    if (!first) return 1;
    return first.weight;
  }

  private readonly stateData: TState;

  protected constructor(
    readonly id: TId,
    state: TState,
    readonly kind: GameObjectKind,
  ) { this.stateData = state; }

  /**
   * Authoritative state is exposed as a read-only view. Behaviours use
   * `mutableState`; adapters that still need to bridge legacy state APIs use
   * an explicit object method instead of assigning through this getter.
   */
  get state(): Readonly<TState> { return this.stateData; }
  protected get mutableState(): TState { return this.stateData; }

  /** Physics adapters read velocity through the common object boundary. */
  readPhysicsVelocity(): { vx?: number; vy?: number; angularVelocity?: number } {
    const state = this.stateData as { vx?: number; vy?: number; angularVelocity?: number };
    const result: { vx?: number; vy?: number; angularVelocity?: number } = {};
    if (state.vx !== undefined) result.vx = state.vx;
    if (state.vy !== undefined) result.vy = state.vy;
    if (state.angularVelocity !== undefined) result.angularVelocity = state.angularVelocity;
    return result;
  }

  /** Self-action used by physics and collision adapters; callers cannot assign
   * the object's state fields directly. */
  protected setVelocity(vx: number, vy: number): void {
    const state = this.stateData as { vx?: number; vy?: number };
    if ('vx' in state) state.vx = vx;
    if ('vy' in state) state.vy = vy;
  }

  /** Read an adapter body result into the object's canonical placement and
   * velocity. Surface resolution and other object-specific consequences are
   * supplied as a callback after the common transfer is complete. */
  readPhysics(
    body: PhysicsBody,
    physicsToWorld: (value: number) => number,
    options: PhysicsReadOptions = {},
  ) {
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

  /** Physics adapters write the solved pose and velocity through one method. */
  applyPhysicsResult(pose: GameObjectPlacement, velocity: { vx?: number; vy?: number; angularVelocity?: number }): void {
    this.placement = pose;
    const state = this.stateData as { vx?: number; vy?: number; angularVelocity?: number };
    if (velocity.vx !== undefined && state.vx !== undefined) state.vx = velocity.vx;
    if (velocity.vy !== undefined && state.vy !== undefined) state.vy = velocity.vy;
    if (velocity.angularVelocity !== undefined && state.angularVelocity !== undefined) state.angularVelocity = velocity.angularVelocity;
  }

  get key(): GameObjectKey { return gameObjectKey(this.kind, this.id); }

  /** GameState binds this when the object enters the world. Keeping the
   * reference on the object lets behaviours own lifecycle changes without
   * reaching into GameWorld or a concrete registry. */
  bindWorld(world: GameStateAccess | undefined) { this.worldObject = world; }

  /** Spawn a domain object immediately through the current world. */
  spawn<T extends GameObject<any>>(object: T) {
    return this.requireWorld().spawn(object);
  }

  /** Queue a domain object for the next lifecycle flush. */
  deferSpawn<T extends GameObject<any>>(object: T) {
    return this.requireWorld().deferSpawn(object);
  }

  /** Despawn this object through the current world. */
  despawn() {
    this.requireWorld().despawn(this);
  }

  /** Queue this object for removal after the current update pass. */
  deferDespawn() {
    this.requireWorld().deferDespawn(this);
  }

  private requireWorld() {
    if (!this.worldObject) throw new Error(`GameObject ${this.key} is not registered in a world`);
    return this.worldObject;
  }

  /** Shared object state for subclasses. Lookup and lifecycle operations are
   * available here; another object's state is still changed only by calling
   * that object's action methods. */
  protected get gameState(): GameState { return this.requireWorld() as GameState; }

  /** Read/write placement adapter over the flat protocol state. */
  get placement(): Readonly<GameObjectPlacement> {
    const pose = this.mutableState as Partial<GameObjectPlacement>;
    const layer = (this.mutableState as { collisionLayer?: number }).collisionLayer;
    const result: GameObjectPlacement = { x: pose.x ?? 0, y: pose.y ?? 0, z: pose.z ?? 0, rotation: pose.rotation ?? 0 };
    if (layer !== undefined) result.layer = layer;
    return result;
  }
  protected set placement(value: GameObjectPlacement) {
    const pose = this.mutableState as Partial<GameObjectPlacement>;
    pose.x = value.x; pose.y = value.y; pose.z = value.z; pose.rotation = value.rotation;
    const state = this.mutableState as { collisionLayer?: number };
    if (value.layer === undefined) delete state.collisionLayer;
    else state.collisionLayer = value.layer;
  }

  abstract update(context: GameObjectUpdateContext): void;
  getSprite(_now: number): GameObjectSprite { throw new Error(`Game object ${this.key} has no sprite`); }
  get isRenderable() { return this.getSprite !== GameObject.prototype.getSprite; }

  /**
   * Renderers receive a frame view rather than the live state object. The
   * shallow copy keeps nested authored data (occupants, damage flags, and
   * animation metadata) intact while preventing a later top-level world
   * write from mutating an already-submitted draw command.
   */
  protected getRenderState(): Readonly<TState> { return { ...this.stateData }; }

  draw(context: GameObjectDrawContext): void {
    if (!this.isRenderable) return;
    context.submit({ kind: this.kind, id: this.id, key: this.key, state: this.getRenderState(), sprite: this.getSprite(context.now) });
  }

  /** A common collision descriptor used by the authoritative world runtime. */
  getCollider(): CollisionBody[] {
    const config = this.collision[0];
    if (!config) return [];
    const pose = { ...this.placement };
    const shape = config.shape;
    const base = {
      id: collisionId(this.kind, this.id), objectId: this.id, kind: this.kind,
      x: pose.x, y: pose.y, z: pose.z,
      category: config.category, mask: config.mask,
      solid: config.solid, active: this.collisionEnabled, blockingWeight: this.blockingWeight,
      restitution: config.restitution, friction: config.friction,
      fixedRotation: config.fixedRotation, object: this,
    };
    const withLayer = <T extends object>(value: T): T & { layer?: number } => {
      if (pose.layer === undefined) return value;
      return { ...value, layer: pose.layer };
    };
    let radius: number;
    if (shape.type === 'circle') radius = shape.radius;
    else radius = Math.hypot(shape.width, shape.height) / 2;
    if (shape.type === 'box') {
      return [withLayer({ ...base, radius, box: { width: shape.width, height: shape.height, rotation: pose.rotation } })];
    }
    return [withLayer({ ...base, radius })];
  }

}
