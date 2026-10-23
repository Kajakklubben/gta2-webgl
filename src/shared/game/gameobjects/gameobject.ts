import type { CollisionBody, CollisionQuery } from '../physics/collision-world';
import { defaultCollisionCategory } from '../../domain/physics/collision-rules';
import { GameObject as EngineGameObject, type EngineCollisionShape, type EngineGameObjectCollision, type EngineGameObjectId, type EngineGameObjectPlacement, type EnginePhysicsReadOptions } from '../../engine/game-object';
import type { PresentationSlot } from '../../engine/presentation-order';
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

export type CollisionShape = EngineCollisionShape;
export type GameObjectCollision = EngineGameObjectCollision;
export type GameObjectId = EngineGameObjectId;
export type GameObjectKind = 'player' | 'vehicle' | 'pickup' | 'projectile' | 'npc' | 'hazard' | 'map-object';
export type GameObjectKey = string;

export function gameObjectKey(kind: GameObjectKind, id: GameObjectId): GameObjectKey {
  return `${kind}:${String(id)}`;
}

/** Canonical world placement shared by every placed game object. */
export type GameObjectPlacement = EngineGameObjectPlacement;

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
/** A transient source light attached to a rendered game-object layer. The
 * shared game only describes it; the browser renderer owns the light object. */
export interface GameObjectLight {
  readonly color: number;
  readonly radius: number;
  readonly intensity: number;
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
  readonly alphaTest?: number;
  /** Semantic map level/band/priority intent resolved by the presentation adapter. */
  readonly presentation?: PresentationSlot;
  /** Source sprite blend mode for presentation layers. */
  readonly blending?: 'normal' | 'additive';
  readonly fallbackColor?: number;
  /** Optional renderer-owned dynamic light following this layer. */
  readonly light?: GameObjectLight;
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
  /** Optional map raycast used by Explosion_30 to hide targets behind walls. */
  isExplosionOccluded?: (origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, entity: { kind: 'player' | 'npc' | 'vehicle'; id: string | number }) => boolean;
  /** Static MOBJ query kept separate from dynamic physics bodies. */
  queryExplosionObjects?: (query: CollisionQuery) => readonly CollisionBody[];
  /** Object_2C::OnExplosionNearby dispatch for source-reactive map objects. */
  onExplosionNearby?: (object: CollisionBody, source: { actor: string; explosionType: number }) => void;
  findPlayer(id: string): PlayerObject | undefined;
  findVehicle(id: number): VehicleObject | undefined;
  findNpc(id: number): NpcObject | undefined;
  /** Finalize a source-style drowning death, including vehicle detachment. */
  killNpc(target: NpcObject): void;
  damagePlayer(target: PlayerObject, damage: number, killer?: string, cause?: PlayerState['deathCause']): void;
  damageVehicle(target: VehicleObject, damage: number, x?: number, y?: number, sourceModel?: number, attacker?: string): void;
  /** Source model 198 clears attached vehicle fire without repairing damage. */
  extinguishVehicleFire(target: VehicleObject): void;
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
  'findVehicle' | 'findNpc' | 'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'raiseWanted' | 'queryCircle' | 'isWaterAt' | 'emit'>;
export type ProjectileImpactContext = Pick<GameObjectCombatContext,
  'authoritative' | 'weaponSystem' | 'findPlayer' | 'findVehicle' | 'findNpc' |
  'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'extinguishVehicleFire' | 'raiseWanted' | 'emit' | 'nextHazardId' | 'spawnEffect'>;
export type HazardCombatContext = Pick<GameObjectCombatContext,
  'authoritative' | 'weaponSystem' | 'nextHazardId' | 'spawnEffect' | 'queryCircle' | 'findPlayer' | 'findVehicle' | 'findNpc' |
  'damagePlayer' | 'damageVehicle' | 'damageNpc' | 'isWaterAt' | 'emit'> & Pick<GameObjectCombatContext, 'isExplosionOccluded' | 'queryExplosionObjects' | 'onExplosionNearby'>;
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
export type PhysicsReadOptions = EnginePhysicsReadOptions;

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
export abstract class GameObject<TState extends object, TId extends GameObjectId = GameObjectId> extends EngineGameObject<TState, TId, GameObjectKind> {
  private worldObject: GameStateAccess | undefined = undefined;

  protected constructor(
    id: TId,
    state: TState,
    kind: GameObjectKind,
  ) { super(id, state, kind); }

  protected override defaultCollisionCategory() { return defaultCollisionCategory(this.kind); }

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

  abstract update(context: GameObjectUpdateContext): void;
  getSprite(_now: number): GameObjectSprite { throw new Error(`Game object ${this.key} has no sprite`); }
  get isRenderable() { return this.getSprite !== GameObject.prototype.getSprite; }

  /**
   * Renderers receive a frame view rather than the live state object. The
   * shallow copy keeps nested authored data (occupants, damage flags, and
   * animation metadata) intact while preventing a later top-level world
   * write from mutating an already-submitted draw command.
   */
  protected getRenderState(): Readonly<TState> { return { ...this.state }; }

  draw(context: GameObjectDrawContext): void {
    if (!this.isRenderable) return;
    context.submit({ kind: this.kind, id: this.id, key: this.key, state: this.getRenderState(), sprite: this.getSprite(context.now) });
  }

}
