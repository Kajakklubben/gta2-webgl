import type { HazardState, NpcState, PlayerState, TrafficState } from '../../protocol/types';
import type { CollisionBody } from '../physics/collision-world';
import type { GameObjectSprite, GameObjectSpriteLayer, GameObjectUpdateContext, HazardCombatContext, SpriteSourceSequence } from '../gameobjects/gameobject';
import { StatefulGameObject, type GameObjectUpdateHandler } from '../gameobjects/stateful';
import { COLLISION_CATEGORY } from '../../domain/physics/collision-rules';
import { WORLD } from '../../domain/world/world';
import { GTA2_CAR_FIRE_FRAME_SEQUENCES, GTA2_CAR_FIRE_SPRITE_RANGES, GTA2_CAR_FIRE_SPRITES, GTA2_EXPLOSION_SPRITES, GTA2_EXPLOSION_VISUAL_TICKS, GTA2_LARGE_EXPLOSION_SPRITES, GTA2_SOURCE_EFFECT_SPRITES, GTA2_SOURCE_OBJECT_MODELS, GTA2_SOURCE_OBJECT_SPRITES, GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../domain/world/gta2-sprites';
import { GTA2_VEHICLE_DAMAGE, sourceDamageForFire } from '../../domain/combat/vehicle-damage';
import { GTA2_MOLOTOV_LIGHT, WeaponId } from '../../domain/combat/weapons';
import { rotationFromDirection } from '../../domain/physics/motion-vector';
import { sourceSkidSprite } from '../../domain/physics/vehicle-skid';
import { sourceCarFireParticles } from './car-fire';
import { vehicleBombAnimationState } from '../../domain/vehicles/vehicle-weapons';

/** Particle_4C::PoolUpdate's source delays for explosion frames 0..15. */
const SOURCE_EXPLOSION_FRAME_TICKS = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1] as const;

const SOURCE_EXPLOSION_FLASH_MODEL = GTA2_SOURCE_EFFECT_SPRITES.explosionFlash.start;

function sourceExplosionFrame(age: number, frameCount: number) {
  const cycleTicks = SOURCE_EXPLOSION_FRAME_TICKS.slice(0, frameCount).reduce((sum, ticks) => sum + ticks, 0);
  let remaining = cycleTicks > 0 ? Math.max(0, age) % cycleTicks : 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const duration = SOURCE_EXPLOSION_FRAME_TICKS[frame] ?? 1;
    if (remaining < duration) return frame;
    remaining -= duration;
  }
  return Math.max(0, frameCount - 1);
}

export class HazardObject extends StatefulGameObject<HazardState, number> {
  private animationAge = 0;
  private vehicleVelocityX = 0;
  private vehicleVelocityY = 0;
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) {
    super(state.id, state, 'hazard', update);
    let mask = COLLISION_CATEGORY.player | COLLISION_CATEGORY.vehicle | COLLISION_CATEGORY.npc;
    if (state.kind === 'fire' || state.kind === 'blood' || state.kind === 'impact' || state.kind === 'skid' || state.kind === 'water') mask = 0;
    this.collision = { shape: { type: 'circle', radius: 0 }, solid: false, mask };
  }
  override get collisionEnabled() { return this.mutableState.life > 0; }
  /** Extend a hazard's lifetime through its own action surface. */
  extendLife(life: number) { this.mutableState.life = Math.max(this.mutableState.life, life); }
  /** Move a vehicle-attached fire effect with its owner. */
  followVehicle(vehicle: Readonly<TrafficState>, sourceModel?: number) {
    this.mutableState.x = vehicle.x;
    this.mutableState.y = vehicle.y;
    this.mutableState.z = vehicle.z;
    this.mutableState.collisionLayer = vehicle.collisionLayer;
    this.vehicleVelocityX = vehicle.vx;
    this.vehicleVelocityY = vehicle.vy;
    if (sourceModel === undefined) delete this.mutableState.sourceModel;
    else this.mutableState.sourceModel = sourceModel;
  }
  /** Move a ped-attached fire effect with its burning owner. */
  followNpc(npc: Readonly<NpcState>) {
    this.mutableState.x = npc.x;
    this.mutableState.y = npc.y;
    this.mutableState.z = npc.z;
    this.mutableState.collisionLayer = npc.collisionLayer;
  }
  /** Move a ped-attached fire effect with a player. */
  followPlayer(player: Readonly<PlayerState>) {
    this.mutableState.x = player.x;
    this.mutableState.y = player.y;
    this.mutableState.z = player.z;
  }
  tick() {
    this.mutableState.life = Math.max(0, this.mutableState.life - 1);
    if (this.mutableState.sourceTimer !== undefined) this.mutableState.sourceTimer = Math.max(0, this.mutableState.sourceTimer - 1);
    if (this.mutableState.armingTimer !== undefined) this.mutableState.armingTimer = Math.max(0, this.mutableState.armingTimer - 1);
    this.animationAge++;
  }
  expire() { this.mutableState.life = 0; }
  override update(context: GameObjectUpdateContext) {
    this.tick(); super.update(context);
    if ((this.mutableState.kind === 'blood' || this.mutableState.kind === 'impact' || this.mutableState.kind === 'skid' || this.mutableState.kind === 'water') && this.mutableState.life <= 0) this.deferDespawn();
  }

  /** Emit the six short-lived code-object particles used by Particle_8 for
   * blood, vehicle impacts, and water entry. These are deliberately generated
   * from the hazard's stable id instead of Math.random so every client gets
   * the same burst shape from the replicated state. */
  private sourceBurstParticles(kind: 'blood' | 'impact' | 'water'): GameObjectSpriteLayer[] {
    const sourceObjectRange = kind === 'impact' && this.mutableState.sourceModel !== undefined
      ? GTA2_SOURCE_OBJECT_SPRITES[this.mutableState.sourceModel]
      : undefined;
    const range = kind === 'blood' ? GTA2_SOURCE_EFFECT_SPRITES.bloodBurst
      : kind === 'impact' ? (this.mutableState.sourceModel === SOURCE_EXPLOSION_FLASH_MODEL ? GTA2_SOURCE_EFFECT_SPRITES.explosionFlash : sourceObjectRange ?? GTA2_SOURCE_EFFECT_SPRITES.impactBurst)
        : GTA2_SOURCE_EFFECT_SPRITES.waterSplash;
    const sourceSequence: SpriteSourceSequence = kind === 'blood' ? 'blood-burst' : kind === 'impact' ? 'impact-burst' : 'water-splash';
    const lifetime = kind === 'impact' ? (this.mutableState.sourceModel === SOURCE_EXPLOSION_FLASH_MODEL ? 10 : 7) : GTA2_WATER_SPLASH_VISUAL_TICKS;
    const age = Math.max(0, Math.min(lifetime - 1, this.animationAge));
    const sourceScale = this.mutableState.scale ?? 1;
    const baseRotation = this.mutableState.rotation ?? 0;
    const particles: GameObjectSpriteLayer[] = [];
    for (let index = 0; index < 6; index++) {
      const seed = (this.id * 1103515245 + index * 12345) >>> 0;
      const random = (salt: number) => ((seed + salt * 1013904223) >>> 0) / 0xffffffff;
      const angle = baseRotation + (random(1) - .5) * (kind === 'impact' ? .65 : 1.15);
      const speed = (kind === 'impact' ? 1.8 : 1.1) + random(2) * (kind === 'water' ? 2.6 : 2.1);
      const travel = speed * (age - age * Math.max(0, age - 1) / (2 * lifetime));
      const splashLift = kind === 'water' ? .08 + Math.sin(Math.PI * age / lifetime) * .18 : .04;
      const frame = kind === 'blood' ? 0
        : kind === 'impact' ? Math.min(range.count - 1, Math.floor(age / 2))
          : Math.min(range.count - 1, Math.max(0, age - 1));
      const opacity = this.mutableState.life <= 0 ? 0 : Math.max(.25, 1 - age / lifetime);
      particles.push({
        atlas: 'codeObjects', model: range.start, sourceSequence, sourceModel: this.mutableState.sourceModel ?? range.start,
        definition: { bank: 'code-object', sourceId: range.start },
        animation: kind, frame, frameCount: range.count, frameTicks: 1, loop: false,
        placement: {
          ...this.placement,
          x: this.placement.x + Math.cos(angle) * travel,
          y: this.placement.y + Math.sin(angle) * travel,
          z: this.placement.z + splashLift,
          rotation: angle,
        },
        opacity, scale: sourceScale * (kind === 'impact' ? .72 : .8),
        alphaTest: .01,
        presentation: { band: 'overlay' },
        fallbackColor: kind === 'blood' ? 0xc42d3d : kind === 'impact' ? (this.mutableState.variant === 2 ? 0xfff0a0 : 0xffc34a) : 0x69d8ff,
      });
    }
    return particles;
  }

  override getSprite(_now: number): GameObjectSprite {
    if (this.mutableState.kind === 'blood' || this.mutableState.kind === 'impact' || this.mutableState.kind === 'water') {
      const particles = this.sourceBurstParticles(this.mutableState.kind);
      const primary = particles[0]!;
      return { ...primary, layers: particles.slice(1) };
    }
    if (this.mutableState.kind === 'skid') {
      const kind = this.mutableState.kind;
      const color = 0x22252a;
      let scale = 1;
      if (this.mutableState.scale !== undefined) scale = this.mutableState.scale;
      const sprite: GameObjectSprite = {
        atlas: 'codeObjects', animation: kind, frameCount: 1, loop: false, frameMs: 60,
        placement: { ...this.placement, rotation: this.mutableState.rotation ?? 0 },
        // The source object is opaque until it is reclaimed. The decoded
        // skid sprite already contains its alpha; fading the old fallback
        // rectangle made the marks look like unrelated translucent blobs.
        opacity: kind === 'skid' ? (this.mutableState.life > 0 ? 1 : 0) : Math.min(1, this.mutableState.life / 10),
        alphaTest: .01, presentation: { band: 'underlay' }, fallbackColor: color, scale,
      };
      if (kind === 'skid' && this.mutableState.sourceModel !== undefined) {
        const sourceSprite = sourceSkidSprite(this.mutableState.sourceModel);
        return {
          ...sprite,
          model: sourceSprite?.model ?? this.mutableState.sourceModel,
          sourceModel: this.mutableState.sourceModel,
          definition: { bank: 'code-object', sourceId: this.mutableState.sourceModel },
          ...(sourceSprite?.remap === undefined ? {} : { codeObjectRemap: sourceSprite.remap }),
        };
      }
      return sprite;
    }
    const isExplosion = this.mutableState.kind === 'fire' && (this.mutableState.effect === 'explosion' || (this.mutableState.effect === undefined && this.mutableState.sourceModel === undefined));
    const isSourceFire = this.mutableState.kind === 'fire' && !isExplosion;
    const sourceModel = this.mutableState.sourceModel;
    const pedFire = sourceModel === GTA2_SOURCE_OBJECT_MODELS.pedFire;
    let sourceFireRange: { start: number; count: number };
    if (pedFire) {
      sourceFireRange = GTA2_SOURCE_OBJECT_SPRITES[GTA2_SOURCE_OBJECT_MODELS.pedFire] ?? GTA2_SOURCE_EFFECT_SPRITES.fireTrail;
    } else {
      const carFireRange = GTA2_CAR_FIRE_SPRITE_RANGES[sourceModel ?? GTA2_CAR_FIRE_SPRITES.wreck.start];
      sourceFireRange = carFireRange ?? GTA2_SOURCE_EFFECT_SPRITES.fireTrail;
    }
    let explosionRange = GTA2_EXPLOSION_SPRITES;
    if (this.mutableState.explosionType === 'large') explosionRange = GTA2_LARGE_EXPLOSION_SPRITES;
    let fireSequence: readonly number[] | undefined;
    if (isSourceFire && !pedFire && sourceModel !== undefined) fireSequence = GTA2_CAR_FIRE_FRAME_SEQUENCES[sourceModel];
    let sourceSequence: SpriteSourceSequence | undefined;
    if (fireSequence) {
      if (sourceModel === GTA2_CAR_FIRE_SPRITES.small.start) sourceSequence = 'car-fire-small';
      else if (sourceModel === GTA2_CAR_FIRE_SPRITES.large.start) sourceSequence = 'car-fire-large';
      else if (sourceModel === GTA2_CAR_FIRE_SPRITES.wreck.start) sourceSequence = 'car-fire-wreck';
    } else if (pedFire) {
      sourceSequence = 'ped-fire';
    } else if (isExplosion) {
      sourceSequence = this.mutableState.explosionType === 'large' ? 'explosion-large' : 'explosion-small';
    }
    let range: { start: number; count: number };
    if (this.mutableState.kind === 'mine') range = { start: 126, count: 8 };
    else if (isExplosion) range = explosionRange;
    else if (this.mutableState.kind === 'fire') range = sourceFireRange;
    else range = { start: 118, count: 8 };
    const frameCount = fireSequence?.length ?? range.count;
    let sourceExplosionAge = this.animationAge;
    if (this.mutableState.sourceTimer !== undefined) sourceExplosionAge = WORLD.projectile.sourceExplosionTicks - this.mutableState.sourceTimer;
    let frame: number | undefined;
    if (isExplosion) frame = sourceExplosionFrame(sourceExplosionAge, frameCount);
    else if (fireSequence) frame = this.animationAge % frameCount;
    let fireParticles: GameObjectSprite[] | undefined;
    if (isSourceFire && fireSequence && !pedFire && sourceModel !== undefined) {
      fireParticles = sourceCarFireParticles({
        sourceModel,
        sequence: fireSequence,
        animationAge: this.animationAge,
        placement: this.placement,
        vehicleVelocityX: this.vehicleVelocityX,
        vehicleVelocityY: this.vehicleVelocityY,
      });
    }
    const primaryFire = fireParticles?.[0];
    const renderedFrame = primaryFire?.frame ?? frame;
    let sourceExplosionParticles: GameObjectSprite[] | undefined;
    if (isExplosion && this.mutableState.life > 0) {
      sourceExplosionParticles = Array.from({ length: 6 }, (_, index) => {
        const phase = index * Math.PI / 3 + sourceExplosionAge * .07;
        let distance = 3 + (sourceExplosionAge % 18) * .35;
        if (index % 2 !== 0) distance = 3 + (sourceExplosionAge % 18) * .6;
        let sourceFrame = 0;
        if (typeof frame === 'number') sourceFrame = frame;
        let opacity = 0;
        if (this.mutableState.life > 0) opacity = .34;
        return {
          atlas: 'codeObjects' as const,
          model: explosionRange.start + ((sourceFrame + index * 3) % frameCount),
          animation: 'fire' as const,
          frame: 0,
          frameCount: 1,
          loop: false,
          placement: { ...this.placement, x: this.placement.x + Math.cos(phase) * distance, y: this.placement.y + Math.sin(phase) * distance, z: this.placement.z + .15 + index * .05 },
          scale: .72 + (index % 2) * .16,
          opacity,
          alphaTest: .01,
          presentation: { band: 'overlay' },
          fallbackColor: 0xff7040,
        };
      });
    }
    let model = range.start;
    if (primaryFire?.model !== undefined) model = primaryFire.model;
    else if (fireSequence?.[0] !== undefined) model = fireSequence[0];
    let frameCountForSprite = frameCount;
    if (primaryFire?.frameCount !== undefined) frameCountForSprite = primaryFire.frameCount;
    let loop = true;
    if (isExplosion || fireSequence) loop = false;
    let frameMs = 120;
    if (this.mutableState.kind === 'fire') {
      frameMs = 45;
      if (pedFire || isSourceFire) frameMs = 55;
    }
    let scale: number | undefined;
    if (isExplosion && this.mutableState.explosionType === 'item') scale = 1.5;
    let layers: readonly GameObjectSpriteLayer[] | undefined;
    if (fireParticles) layers = fireParticles.slice(1);
    else if (sourceExplosionParticles) layers = sourceExplosionParticles;
    let placement = this.placement;
    if (primaryFire?.placement !== undefined) placement = primaryFire.placement;
    let opacity = 0;
    if (this.mutableState.life > 0) {
      opacity = 1;
      if (primaryFire?.opacity !== undefined) opacity = primaryFire.opacity;
    }
    let fallbackColor = 0x75c043;
    if (this.mutableState.kind === 'mine') fallbackColor = 0xff3b30;
    else if (this.mutableState.kind === 'fire') fallbackColor = 0xff8a3d;
    let sprite: GameObjectSprite = {
      atlas: 'codeObjects',
      model,
      animation: this.mutableState.kind,
      frameCount: frameCountForSprite,
      loop,
      frameMs,
      placement,
      opacity,
      alphaTest: .01,
      presentation: this.mutableState.kind === 'fire' ? { band: 'overlay' } : { band: 'underlay' },
      fallbackColor,
    };
    if (fireSequence) sprite = { ...sprite, modelSequence: fireSequence };
    if (sourceSequence) sprite = { ...sprite, sourceSequence };
    if (sourceModel !== undefined) sprite = { ...sprite, sourceModel, definition: { bank: 'code-object', sourceId: sourceModel } };
    if (this.mutableState.kind === 'fire' && this.mutableState.effect === 'fire' && sourceModel === undefined) sprite = { ...sprite, light: GTA2_MOLOTOV_LIGHT };
    if (typeof renderedFrame === 'number') sprite = { ...sprite, frame: renderedFrame };
    if (scale !== undefined) sprite = { ...sprite, scale };
    if (layers) sprite = { ...sprite, layers };
    return sprite;
  }
}

/** Persistent burning effect or a source-attached vehicle fire. */
export class FireObject extends HazardObject {
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) { super(state, update); }

  override update(context: GameObjectUpdateContext) {
    const npcOwnerId = this.mutableState.owner?.match(/^npc:(\d+)$/)?.[1];
    const playerOwnerId = this.mutableState.owner?.match(/^player:(.+)$/)?.[1];
    let npcOwner: ReturnType<GameObjectUpdateContext['world']['findNpc']>;
    if (npcOwnerId !== undefined) npcOwner = context.world.findNpc(Number(npcOwnerId));
    let playerOwner: ReturnType<GameObjectUpdateContext['world']['findPlayer']>;
    if (playerOwnerId !== undefined) playerOwner = context.world.findPlayer(playerOwnerId);
    if (npcOwner || playerOwner) {
      let ownerBurning = false;
      if (npcOwner) ownerBurning = npcOwner.state.onFire && npcOwner.state.health > 0;
      else if (playerOwner) ownerBurning = playerOwner.combatState.onFire && playerOwner.combatState.health > 0;
      if (!ownerBurning) {
        this.expire();
        this.deferDespawn();
        return;
      }
      if (npcOwner) this.followNpc(npcOwner.state);
      else if (playerOwner) this.followPlayer(playerOwner.state);
    }
    const combat = context.combat as HazardCombatContext | undefined;
    // Explosion_30::EmitFireTrail_5 is a dry-ground fire effect. Water puts
    // it out before it can re-ignite a nearby actor; actor-owned fire is
    // handled by the source burn state and its own water transition below.
    if (!npcOwner && !playerOwner && combat?.authoritative && combat.isWaterAt({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z })) {
      this.expire();
      this.deferDespawn();
      return;
    }
    super.update(context);
    if (npcOwner || playerOwner) this.extendLife(2);
    // Model 197 is the flame attached to a ped, not the separate ground-fire
    // hazard. The owner applies its own ManageBurning damage; the attached
    // sprite must not turn the nearby crowd into an area-of-effect fire.
    if (npcOwner || playerOwner) return;
    if (!combat?.authoritative || this.mutableState.life <= 0 || this.mutableState.life % 6 !== 0) return;
    const nearby = combat.queryCircle({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, radius: 24, kinds: ['player', 'vehicle', 'npc'] });
    for (const body of nearby) {
      if (combat.isWaterAt({ x: body.x, y: body.y, z: body.z })) continue;
      if (this.mutableState.owner?.startsWith('vehicle:') && body.kind === 'vehicle') {
        const ownerId = /^vehicle:(\d+):/.exec(this.mutableState.owner)?.[1];
        if (ownerId !== undefined && Number(ownerId) === Number(body.objectId)) continue;
      }
      if (this.mutableState.owner?.startsWith('npc:') && body.kind === 'npc') {
        const ownerId = /^npc:(\d+)$/.exec(this.mutableState.owner)?.[1];
        if (ownerId !== undefined && Number(ownerId) === Number(body.objectId)) continue;
      }
      if (this.mutableState.owner?.startsWith('player:') && body.kind === 'player' && String(body.objectId) === playerOwnerId) continue;
      if (body.kind === 'player') {
        const player = combat.findPlayer(String(body.objectId));
        if (!player || player.combatState.health <= 0 || player.combatState.respawn > 0) continue;
        // Ground fire uses the same authored ignition transition as a direct
        // flamethrower hit; the attached ped-fire hazard owns the continuing
        // burn while this area hazard supplies the cadence and contact damage.
        player.setOnFire(combat);
        const damage = 4;
        combat.damagePlayer(player, damage, this.mutableState.owner, 'fire');
        combat.emit({ type: 'hit', actor: this.mutableState.owner, target: player.id, damage, x: player.state.x, y: player.state.y, z: player.state.z });
      } else if (body.kind === 'vehicle') {
        const vehicle = combat.findVehicle(Number(body.objectId));
        if (!vehicle || !vehicle.alive) continue;
        const damage = sourceDamageForFire();
        combat.damageVehicle(vehicle, damage, vehicle.state.x, vehicle.state.y, this.mutableState.sourceModel, this.mutableState.owner);
        combat.emit({ type: 'hit', actor: this.mutableState.owner, target: String(vehicle.id), damage, x: vehicle.state.x, y: vehicle.state.y, z: vehicle.state.z });
      } else {
        const npc = combat.findNpc(Number(body.objectId));
        if (!npc || npc.state.health <= 0) continue;
        npc.setOnFire(combat, this.mutableState.owner);
        const damage = 5;
        combat.damageNpc(npc, damage, this.mutableState.owner, this.mutableState.sourceModel, undefined, 'fire');
        combat.emit({ type: 'hit', actor: this.mutableState.owner, target: `npc:${npc.id}`, damage, x: npc.state.x, y: npc.state.y, z: npc.state.z });
      }
    }
  }
}

/** Explosion effect. It uses the fire hazard wire shape so old clients can
 * still render and replicate it; source rockets additionally carry their
 * authored countdown timer. */
export class ExplosionObject extends HazardObject {
  private blast?: {
    actor: string;
    weapon: number;
    radius: number;
    damage: number;
    pellets: number;
    selfDamage: boolean;
    height?: number;
    knockback?: number;
    sourceModel?: number | undefined;
  };
  private blastResolved = false;
  private blastImpulseResolved = false;
  private flashResolved = false;
  private readonly blastDamagedTargets = new Set<string>();
  private readonly blastVehicleWindows = new Set<string>();
  private readonly blastNearbyObjects = new Set<string>();
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) { super(state, update); }

  armBlast(blast: { actor: string; weapon: number; radius: number; damage: number; pellets: number; selfDamage: boolean; height?: number; knockback?: number; sourceModel?: number | undefined }) {
    this.blast = blast;
    return this;
  }

  override update(context: GameObjectUpdateContext) {
    super.update(context);
    const combat = context.combat as HazardCombatContext | undefined;
    // Rocket explosions are real Explosion_30 objects.  Their timer starts at
    // 100 and counts down; damage is applied from that timer instead of being
    // collapsed into the projectile's impact tick.
    if (combat?.authoritative && this.mutableState.sourceTimer !== undefined && this.mutableState.life > 0) {
      this.resolveBlast(combat);
    }
  }

  /** Resolve the one-shot area effect through typed target actions. The
   * explosion object owns target filtering and source damage packets; the
   * world only supplies the query, target actions, and event sink. */
  resolveBlast(combat: HazardCombatContext) {
    if ((!this.mutableState.sourceTimer && this.blastResolved) || !this.blast || !combat.authoritative) return;
    const sourceTimed = this.mutableState.sourceTimer !== undefined;
    const timer = this.mutableState.sourceTimer ?? 0;
    const sourceExplosionType = this.mutableState.sourceExplosionType ?? (this.mutableState.explosionType === 'large' ? 20 : this.mutableState.explosionType === 'item' ? 19 : 18);
    const pedDamageActive = !sourceTimed || timer > 50;
    let vehicleWindow: 'immediate' | 'early' | 'late' | undefined;
    if (!sourceTimed) vehicleWindow = 'immediate';
    else if (timer > 50 && timer < 60) vehicleWindow = 'early';
    else if (timer > 80 && timer < 90) vehicleWindow = 'late';
    if (!sourceTimed) this.blastResolved = true;
    const blast = this.blast, owner = combat.findPlayer(blast.actor), ownerVehicleId = owner?.state.vehicleId;
    const height = blast.height ?? 2;
    const isOccluded = (body: CollisionBody) => {
      if (body.kind !== 'player' && body.kind !== 'npc' && body.kind !== 'vehicle') return false;
      return combat.isExplosionOccluded?.(
        { x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z },
        { x: body.x, y: body.y, z: body.z },
        { kind: body.kind, id: body.objectId },
      ) === true;
    };
    const distanceToBlast = (body: { x: number; y: number }) => Math.max(Math.abs(body.x - this.mutableState.x), Math.abs(body.y - this.mutableState.y));
    const blastQuery = (kinds: CollisionBody['kind'][]) => combat.queryCircle({
      x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z,
      // The source uses MaxAbsDistance against a sprite rectangle. Query a
      // circumscribed broad phase so diagonal corners are not discarded
      // before that Chebyshev test runs.
      radius: blast.radius * Math.SQRT2, floorTolerance: height, kinds,
    });

    // Explosion_30::SpawnFlashParticle happens on the first source tick for
    // every family except the small/no-ring types 18 and 32. Immediate item
    // explosions use the same authored flash before their damage dispatch.
    if (!this.flashResolved && (!sourceTimed || timer === WORLD.projectile.sourceExplosionTicks - 1)) {
      this.flashResolved = true;
      if (sourceExplosionType !== 18 && sourceExplosionType !== 32) combat.spawnEffect({
        x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z,
        kind: 'impact', life: 10, owner: this.mutableState.owner, rotation: this.mutableState.rotation,
        sourceModel: SOURCE_EXPLOSION_FLASH_MODEL, sourceExplosionType,
      });
    }

    // Explosion_30 applies the first-tick impulse before its delayed car
    // damage windows (timer 50..59 and 80..89). Keep that impulse separate so
    // a source rocket does not push a chassis twice when the damage windows
    // arrive later.
    if (sourceTimed && timer === WORLD.projectile.sourceExplosionTicks - 1 && !this.blastImpulseResolved) {
      this.blastImpulseResolved = true;
      for (const body of blastQuery(['vehicle'])) {
        const vehicle = combat.findVehicle(Number(body.objectId));
        if (!vehicle || !vehicle.alive || !vehicle.canReceiveExplosion(sourceExplosionType) || !vehicle.canReceiveObjectDamage(blast.sourceModel)) continue;
        if (Math.abs(body.z - this.mutableState.z) > height || isOccluded(body)) continue;
        const distance = distanceToBlast(vehicle.state);
        if (distance > blast.radius || !blast.knockback) continue;
        const length = Math.max(1, distance);
        vehicle.applyExplosionImpulse((vehicle.state.x - this.mutableState.x) / length * blast.knockback, (vehicle.state.y - this.mutableState.y) / length * blast.knockback);
      }
    }
    for (const body of blastQuery(['player', 'npc'])) {
      const targetKey = `${body.kind}:${String(body.objectId)}`;
      if (sourceTimed && (!pedDamageActive || this.blastDamagedTargets.has(targetKey))) continue;
      if (Math.abs(body.z - this.mutableState.z) > height) continue;
      if (isOccluded(body)) continue;
      if (body.kind === 'npc') {
        const victim = combat.findNpc(Number(body.objectId));
        if (!victim || victim.state.health <= 0 || (!blast.selfDamage && `npc:${victim.id}` === blast.actor)) continue;
        const distance = distanceToBlast(victim.state);
        const npcDamage = combat.weaponSystem.get(blast.weapon).npcDamage ?? blast.damage;
        const falloff = Math.max(0, 1 - distance / blast.radius);
        const damage = Math.max(1, Math.round(npcDamage * blast.pellets * Math.max(.35, falloff)));
        if (blast.knockback) {
          const length = Math.max(1, distance);
          victim.applyExplosionImpulse((victim.state.x - this.mutableState.x) / length * blast.knockback * falloff, (victim.state.y - this.mutableState.y) / length * blast.knockback * falloff);
        }
        combat.damageNpc(victim, damage, blast.actor, undefined, rotationFromDirection(victim.state.x - this.mutableState.x, victim.state.y - this.mutableState.y), 'explosion');
        combat.emit({ type: 'hit', actor: blast.actor, target: `npc:${victim.id}`, weapon: blast.weapon, damage, lethal: victim.state.health <= 0, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        if (sourceTimed) this.blastDamagedTargets.add(targetKey);
        continue;
      }
      const victim = combat.findPlayer(String(body.objectId));
      const sameTeam = owner?.state.team !== undefined && owner.state.team === victim?.state.team;
      if (!victim || victim.combatState.respawn > 0 || (!blast.selfDamage && victim.id === blast.actor) || (sameTeam && victim.id !== blast.actor)) continue;
      const distance = distanceToBlast(victim.state);
      const falloff = Math.max(0, 1 - distance / blast.radius);
      const damage = Math.max(1, Math.round(blast.damage * blast.pellets * Math.max(.35, falloff)));
      if (blast.knockback) {
        const length = Math.max(1, distance);
        victim.applyExplosionImpulse((victim.state.x - this.mutableState.x) / length * blast.knockback * falloff, (victim.state.y - this.mutableState.y) / length * blast.knockback * falloff);
      }
      const currentHealth = victim.combatState.health, armor = Math.min(victim.state.armor, Math.ceil(damage * .5));
      combat.damagePlayer(victim, damage, blast.actor, 'explosion');
      combat.emit({ type: 'hit', actor: blast.actor, target: victim.id, weapon: blast.weapon, damage, lethal: currentHealth <= damage - armor, x: victim.state.x, y: victim.state.y, z: victim.state.z });
      if (sourceTimed) this.blastDamagedTargets.add(targetKey);
    }
    for (const body of blastQuery(['vehicle'])) {
      const vehicle = combat.findVehicle(Number(body.objectId));
      if (!vehicle || !vehicle.alive || (!blast.selfDamage && vehicle.id === ownerVehicleId) || vehicleWindow === undefined) continue;
      if (!vehicle.canReceiveExplosion(sourceExplosionType) || !vehicle.canReceiveObjectDamage(blast.sourceModel)) continue;
      if (Math.abs(body.z - this.mutableState.z) > height) continue;
      if (isOccluded(body)) continue;
      const vehicleKey = `${vehicle.id}:${vehicleWindow}`;
      if (sourceTimed && this.blastVehicleWindows.has(vehicleKey)) continue;
      const distance = distanceToBlast(vehicle.state);
      if (distance > blast.radius) continue;
      if (blast.knockback && !sourceTimed) {
        const length = Math.max(1, distance);
        vehicle.applyExplosionImpulse((vehicle.state.x - this.mutableState.x) / length * blast.knockback, (vehicle.state.y - this.mutableState.y) / length * blast.knockback);
      }
      // The original explosion path uses one full 32000-unit vehicle packet
      // for every car in range; unlike pedestrian/player damage it has no
      // distance falloff.
      combat.damageVehicle(vehicle, GTA2_VEHICLE_DAMAGE.maxDamage, vehicle.state.x, vehicle.state.y, blast.sourceModel, blast.actor);
      if (sourceTimed) this.blastVehicleWindows.add(vehicleKey);
    }
    if (vehicleWindow === 'early') {
      for (const body of combat.queryExplosionObjects?.({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, radius: blast.radius * Math.SQRT2, floorTolerance: height, kinds: ['map-object'] }) ?? []) {
        const key = `${body.kind}:${String(body.objectId)}`;
        if (this.blastNearbyObjects.has(key) || Math.abs(body.z - this.mutableState.z) > height) continue;
        if (distanceToBlast(body) > blast.radius) continue;
        this.blastNearbyObjects.add(key);
        combat.onExplosionNearby?.(body, { actor: blast.actor, explosionType: sourceExplosionType });
      }
    }
  }
}

/** Normal Car_BC bombs are animated objects attached to the target chassis;
 * the source only transitions them into a car explosion when that animation
 * finishes. Keeping the armed object separate from ExplosionObject preserves
 * the distinction from the instant large-bomb dispatch. */
export class VehicleBombObject extends HazardObject {
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) { super(state, update); }

  override update(context: GameObjectUpdateContext) {
    const combat = context.combat as HazardCombatContext | undefined;
    const vehicle = combat?.findVehicle(this.mutableState.vehicleId ?? -1);
    if (vehicle) {
      this.mutableState.x = vehicle.state.x;
      this.mutableState.y = vehicle.state.y;
      this.mutableState.z = vehicle.state.z;
      this.mutableState.collisionLayer = vehicle.state.collisionLayer;
    }
    super.update(context);
    if (!vehicle || this.mutableState.life <= 0) {
      this.expire();
      this.deferDespawn();
      return;
    }
    if (!combat?.authoritative || (this.mutableState.armingTimer ?? 0) > 0) return;
    const explosion = createHazardObject({
      id: combat.nextHazardId(), x: vehicle.state.x, y: vehicle.state.y, z: vehicle.state.z,
      collisionLayer: vehicle.state.collisionLayer, kind: 'fire', life: GTA2_EXPLOSION_VISUAL_TICKS,
      owner: this.mutableState.owner, effect: 'explosion', explosionType: 'item',
      sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
    });
    if (explosion instanceof ExplosionObject) {
      explosion.armBlast({
        actor: this.mutableState.owner ?? `vehicle:${vehicle.id}`, weapon: WeaponId.CarBomb,
        radius: 110, damage: GTA2_VEHICLE_DAMAGE.maxDamage, pellets: 1,
        selfDamage: true, height: 2, knockback: 10, sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
      });
      this.spawn(explosion);
      explosion.resolveBlast(combat);
    }
    combat.emit({ type: 'explosion', actor: this.mutableState.owner, weapon: WeaponId.CarBomb, damage: GTA2_VEHICLE_DAMAGE.maxDamage, x: vehicle.state.x, y: vehicle.state.y, z: vehicle.state.z });
    this.expire();
    this.deferDespawn();
  }

  override getSprite(_now: number): GameObjectSprite {
    const animationState = vehicleBombAnimationState(this.mutableState.armingTimer);
    return {
      atlas: 'codeObjects', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
      definition: { bank: 'code-object', sourceId: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb },
      animation: 'projectile', frameCount: 1, loop: false, frameMs: 55,
      animationKey: `car-bomb-${animationState}`,
      placement: this.placement, opacity: animationState === 'triggered' ? 0 : 1,
      alphaTest: .01, presentation: { band: 'overlay' },
      fallbackColor: 0xff7040,
    };
  }
}

export class MineObject extends HazardObject {
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) { super(state, update); }

  override update(context: GameObjectUpdateContext) {
    super.update(context);
    const combat = context.combat as HazardCombatContext | undefined;
    // Mine states created by older/scripted callers may carry an explicit
    // arming countdown. Normal vehicle deployment omits it and is armed on
    // the next authoritative hazard update, matching the existing contract.
    if (!combat?.authoritative || this.mutableState.life <= 0 || (this.mutableState.armingTimer ?? 0) > 0) return;
    const target = combat.queryCircle({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, radius: WORLD.interaction.pickupRadius, kinds: ['player', 'vehicle', 'npc'] })
      .find(body => {
        const owner = this.mutableState.owner;
        const isOwner = owner !== undefined && (
          (body.kind === 'player' && String(body.objectId) === owner) ||
          (body.kind === 'npc' && `npc:${String(body.objectId)}` === owner) ||
          (body.kind === 'vehicle' && (`vehicle:${String(body.objectId)}` === owner || String(body.objectId) === owner))
        );
        if (isOwner) return false;
        if (body.kind === 'player') {
          const player = combat.findPlayer(String(body.objectId));
          return player !== undefined && player.combatState.health > 0 && player.combatState.respawn <= 0;
        }
        if (body.kind === 'npc') return (combat.findNpc(Number(body.objectId))?.state.health ?? 0) > 0;
        return combat.findVehicle(Number(body.objectId))?.alive ?? false;
      });
    if (!target) return;
    const explosionState: HazardState = {
      id: combat.nextHazardId(), x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z,
      collisionLayer: this.mutableState.collisionLayer, kind: 'fire', life: GTA2_EXPLOSION_VISUAL_TICKS,
      owner: this.mutableState.owner, effect: 'explosion', explosionType: 'small', sourceModel: this.mutableState.sourceModel,
    };
    const explosion = createHazardObject(explosionState);
    if (explosion instanceof ExplosionObject) {
      const weapon = combat.weaponSystem.get(WeaponId.LandMines);
      explosion.armBlast({
        actor: this.mutableState.owner ?? 'mine', weapon: WeaponId.LandMines, radius: WORLD.projectile.sourceSmallExplosionRadius,
        damage: weapon.damage, pellets: weapon.pellets,
        selfDamage: false, height: 2, knockback: 8, sourceModel: this.mutableState.sourceModel,
      });
      this.spawn(explosion);
      explosion.resolveBlast(combat);
    }
    combat.emit({ type: 'explosion', actor: this.mutableState.owner, weapon: WeaponId.LandMines, damage: 90, x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z });
    this.expire();
    this.deferDespawn();
  }
}

export class OilSlickObject extends HazardObject {
  constructor(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) { super(state, update); }

  override update(context: GameObjectUpdateContext) {
    super.update(context);
    const combat = context.combat as HazardCombatContext | undefined;
    if (!combat?.authoritative || this.mutableState.life <= 0) return;
    for (const body of combat.queryCircle({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, radius: WORLD.interaction.pickupRadius, kinds: ['vehicle'] })) {
      combat.findVehicle(Number(body.objectId))?.spinOutOnOil();
    }
  }
}

export function createHazardObject(state: HazardState, update?: GameObjectUpdateHandler<HazardState>) {
  if (state.kind === 'blood' || state.kind === 'impact' || state.kind === 'skid' || state.kind === 'water') return new HazardObject(state, update);
  if (state.kind === 'mine') return new MineObject(state, update);
  if (state.kind === 'slick') return new OilSlickObject(state, update);
  if (state.effect === 'fire' && state.sourceModel === GTA2_SOURCE_OBJECT_MODELS.movingCarBomb && state.armingTimer !== undefined) return new VehicleBombObject(state, update);
  if (state.effect === 'explosion' || (state.effect === undefined && state.sourceModel === undefined)) return new ExplosionObject(state, update);
  return new FireObject(state, update);
}
