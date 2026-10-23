import type { CombatShot, HazardState } from '../../protocol/types';
import type { GameObjectSprite, GameObjectSpriteLayer, ProjectileCombatContext, ProjectileImpactContext } from '../gameobjects/gameobject';
import { StatefulGameObject, type GameObjectUpdateHandler } from '../gameobjects/stateful';
import { WORLD } from '../../domain/world/world';
import { GTA2_EXPLOSION_VISUAL_TICKS, GTA2_FLAME_SEGMENT_FRAME_TICKS, GTA2_SOURCE_EFFECT_SPRITES, GTA2_SOURCE_OBJECT_MODELS, GTA2_SOURCE_OBJECT_SPRITES, GTA2_SOURCE_PROJECTILE_FRAME_TICKS, GTA2_WATER_SPLASH_VISUAL_TICKS, GTA2_WEAPON_PROJECTILE_SPRITES } from '../../domain/world/gta2-sprites';
import { sourceDamageForObjectModel, sourceDamageForWeapon } from '../../domain/combat/vehicle-damage';
import { GTA2_FLAME_MUZZLE_LEAD, GTA2_FLAME_SEGMENT_SCALE, GTA2_MOLOTOV_LIGHT, WEAPONS } from '../../domain/combat/weapons';
import { directionFromRotation, rotationFromDirection } from '../../domain/physics/motion-vector';
import { createHazardObject, ExplosionObject } from './hazard';
import type { PlayerObject } from '../gameobjects/player/player';

export interface ProjectileState {
  actor: string; weapon: number; x: number; y: number; endX: number; endY: number; z: number; life: number; rotation: number;
  vx: number; vy: number; vz: number; gravity: number; prevX: number; prevY: number; prevZ: number;
  /** Owner-local snapshot identity used to stop a replicated flame at impact. */
  shotSequence?: number;
  sourceModel?: number; explosive: boolean; selfDamage: boolean; collision: boolean; impact: boolean; beam: boolean;
  waterDeath: boolean; destroyedByWater: boolean; waterDeathAge: number;
  impactTarget?: { kind: 'player' | 'vehicle' | 'npc'; id: string | number };
  /** Concrete source object family used for behavior and rendering. */
  projectileType: ProjectileType;
}

export type ProjectileType = 'bullet' | 'rocket' | 'grenade' | 'molotov' | 'flame' | 'shock';
type ProjectileDefaults = 'rotation' | 'vx' | 'vy' | 'vz' | 'gravity' | 'prevX' | 'prevY' | 'prevZ' | 'explosive' | 'selfDamage' | 'collision' | 'impact' | 'beam' | 'waterDeath' | 'destroyedByWater' | 'waterDeathAge' | 'projectileType';
export type ProjectileStateInput = Omit<ProjectileState, ProjectileDefaults> & Partial<Pick<ProjectileState, ProjectileDefaults>>;

function normalizeProjectileState(state: ProjectileStateInput, projectileType: ProjectileType | 'from-weapon'): ProjectileState {
  let resolvedProjectileType: ProjectileType;
  if (projectileType === 'from-weapon') resolvedProjectileType = state.projectileType ?? projectileTypeForWeapon(state.weapon);
  else resolvedProjectileType = projectileType;
  return {
    ...state,
    rotation: state.rotation ?? 0,
    vx: state.vx ?? 0,
    vy: state.vy ?? 0,
    vz: state.vz ?? 0,
    gravity: state.gravity ?? 0,
    prevX: state.prevX ?? state.x,
    prevY: state.prevY ?? state.y,
    prevZ: state.prevZ ?? state.z,
    explosive: state.explosive ?? false,
    selfDamage: state.selfDamage ?? false,
    collision: state.collision ?? false,
    impact: state.impact ?? false,
    beam: state.beam ?? false,
    waterDeath: state.waterDeath ?? false,
    destroyedByWater: state.destroyedByWater ?? false,
    waterDeathAge: state.waterDeathAge ?? 0,
    projectileType: resolvedProjectileType,
  };
}

/** Translate a compact protocol shot into the complete runtime state owned by
 * a projectile object. Optional wire fields are interpreted once here; the
 * object itself never needs to model them as absent. */
export function projectileStateFromShot(actor: string, shot: CombatShot): ProjectileStateInput {
  const state: ProjectileStateInput = {
    actor, weapon: shot.weapon, x: shot.x, y: shot.y, endX: shot.endX, endY: shot.endY, z: shot.z, life: shot.life,
  };
  if (typeof shot.vx === 'number' && typeof shot.vy === 'number') { state.vx = shot.vx; state.vy = shot.vy; }
  if (typeof shot.impact === 'boolean') state.impact = shot.impact;
  if (typeof shot.beam === 'boolean') state.beam = shot.beam;
  if (typeof shot.sequence === 'number') state.shotSequence = shot.sequence;
  return state;
}

/** Resolve the authored projectile family from the stable weapon slot. This
 * is also used for client replicas, where the compact shot DTO does not carry
 * the server-only projectileType field. */
export function projectileTypeForWeapon(weapon: number): ProjectileType {
  const definition = WEAPONS[weapon];
  if (!definition) return 'bullet';
  if (definition.kind === 'rocket') return 'rocket';
  if (definition.kind === 'flame') return 'flame';
  if (definition.sourceType === 4) return 'molotov';
  if (definition.sourceType === 5 || definition.sourceType === 15 || definition.sourceType === 23) return 'grenade';
  if (definition.kind === 'shock' || definition.kind === 'stun') return 'shock';
  return 'bullet';
}

function electricalBeamSprite(state: ProjectileState, placement: GameObjectSprite['placement']): GameObjectSprite {
  const dx = state.endX - state.x, dy = state.endY - state.y, length = Math.hypot(dx, dy);
  if (length < 1e-6) throw new RangeError('Cannot render a zero-length electrical beam');
  const nx = -dy / length, ny = dx / length;
  const seed = Math.abs(Math.floor(state.x * .17 + state.y * .31 + state.endX * .07));
  const range = GTA2_SOURCE_EFFECT_SPRITES.electricArc;
  const layers: GameObjectSpriteLayer[] = Array.from({ length: 6 }, (_, index) => {
    const t = (index + .5) / 6;
    const amount = (index % 2 ? 1 : -1) * (1.5 + (seed + index * 7) % 4);
    const frame = (seed + index * 3) % range.count;
    return {
      atlas: 'codeObjects', model: range.start, sourceSequence: 'electric-arc', frame,
      frameCount: range.count, animation: 'base', loop: false,
      placement: {
        ...placement,
        x: state.x + dx * t + nx * amount,
        y: state.y + dy * t + ny * amount,
        z: state.z + .2,
        rotation: Math.atan2(dy + amount * nx, dx - amount * ny),
      },
      opacity: .9 - index * .08, scale: .72 + (index % 2) * .12,
      alphaTest: .01,
      presentation: { band: 'overlay', elevation: .2 },
      fallbackColor: 0x9be7ff,
    };
  });
  const primary = layers[0]!;
  return { ...primary, layers: layers.slice(1) };
}

/** The source Armor power-up consumes one charge for direct projectile hits.
 * Keep this separate from PlayerObject.takeDamage(), whose half-damage armor
 * reduction is used by collisions and area effects. */
function absorbDirectProjectileArmor(victim: { readonly state: { readonly armor: number }; readonly mutablePlayerState: { armor: number } }) {
  if (victim.state.armor <= 0) return false;
  victim.mutablePlayerState.armor = Math.max(0, Math.floor(victim.state.armor) - 1);
  return true;
}

type WaterCannonCombatContext = Pick<ProjectileImpactContext, 'damagePlayer' | 'spawnEffect' | 'emit'>;

/** Ped::HandlePedHitByObject's model-198 branch. The water stream consumes one
 * armor charge when present; otherwise its authored player packet is 2. */
export function resolveWaterCannonPlayerHit(victim: PlayerObject, actor: string, weapon: number, combat: WaterCannonCombatContext) {
  victim.putOutFire();
  if (victim.state.armor > 0) {
    victim.mutablePlayerState.armor = Math.max(0, Math.floor(victim.state.armor) - 1);
    combat.emit({ type: 'hit', actor, target: victim.id, weapon, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
    return;
  }
  const damage = 2;
  const currentHealth = victim.combatState.health;
  combat.damagePlayer(victim, damage, actor, 'weapon');
  combat.emit({ type: 'hit', actor, target: victim.id, weapon, damage, lethal: currentHealth <= damage, x: victim.state.x, y: victim.state.y, z: victim.state.z });
}

function emitWaterCannonImpact(combat: Pick<ProjectileImpactContext, 'spawnEffect'>, actor: string, x: number, y: number, z: number, rotation: number) {
  combat.spawnEffect({ x, y, z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS, owner: actor, rotation, scale: .8, sourceModel: GTA2_SOURCE_OBJECT_MODELS.bulletOnFire });
}

/** The retail source creates these terminal object models, but this checkout
 * does not have dedicated code-object atlas ranges for them. Keep those
 * authored transitions renderable with the weapon's tracer art while leaving
 * unrelated missing source objects non-renderable. */
function sourceModelHasVisualFallback(sourceModel: number | undefined) {
  return sourceModel === GTA2_SOURCE_OBJECT_MODELS.fireHitting ||
    sourceModel === GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact ||
    sourceModel === GTA2_SOURCE_OBJECT_MODELS.bulletOnFire ||
    sourceModel === GTA2_SOURCE_OBJECT_MODELS.impactChild;
}

export class ProjectileObject extends StatefulGameObject<ProjectileState, string> {
  private detonationResolved = false;
  private impactEffectResolved = false;
  private impactCause: 'entity' | 'surface' | 'wall' | undefined;
  private impactExplosionType: number | undefined;
  private replicatedOrigin?: { x: number; y: number; endX: number; endY: number; initialLife: number; velocity: { vx: number; vy: number } };
  readonly projectileType: ProjectileType;
  constructor(id: string, state: ProjectileStateInput, projectileType: ProjectileType | 'from-weapon' = 'from-weapon', update?: GameObjectUpdateHandler<ProjectileState>) {
    const normalized = normalizeProjectileState(state, projectileType);
    const resolvedType = normalized.projectileType;
    super(id, { ...normalized, projectileType: resolvedType }, 'projectile', update);
    this.projectileType = resolvedType;
    this.collision = { shape: { type: 'circle', radius: 0 }, solid: false, mask: 0xffff };
  }
  override get collisionEnabled() { return this.mutableState.life > 0; }
  get lifeRemaining() { return this.mutableState.life; }
  get endpoint() { return { x: this.mutableState.endX, y: this.mutableState.endY }; }
  setShotSequence(sequence: number) { this.mutableState.shotSequence = sequence; return this; }
  /** Configure a thrown or launched projectile after its authored launch
   * point has been resolved. This keeps launch mutation behind the projectile
   * object's domain boundary. */
  configureLaunch(values: { vx: number; vy: number; life: number; selfDamage: boolean; vz: number; gravity: number }) {
    this.mutableState.vx = values.vx;
    this.mutableState.vy = values.vy;
    this.mutableState.vz = values.vz;
    this.mutableState.gravity = values.gravity;
    this.mutableState.life = Math.max(1, Math.floor(values.life));
    this.mutableState.selfDamage = values.selfDamage;
    // A thrown object's replicated endpoint is its actual launch vector over
    // its configured lifetime.  The initial spawn distance is only a
    // construction hint and must not survive this source launch rewrite.
    this.mutableState.endX = this.mutableState.x + values.vx * this.mutableState.life / WORLD.tickRate;
    this.mutableState.endY = this.mutableState.y + values.vy * this.mutableState.life / WORLD.tickRate;
    return this;
  }
  /** Apply the compact shot state replicated with a player snapshot. Client
   * replicas use this action instead of mutating another object's state. */
  syncReplicatedShot(shot: CombatShot) {
    if (shot.beam) {
      this.mutableState.x = shot.x;
      this.mutableState.y = shot.y;
      this.mutableState.endX = shot.endX;
      this.mutableState.endY = shot.endY;
      this.mutableState.z = shot.z;
      this.mutableState.life = shot.life;
      this.mutableState.impact = shot.impact ?? false;
      this.mutableState.beam = true;
      this.mutableState.vx = 0;
      this.mutableState.vy = 0;
      this.mutableState.rotation = rotationFromDirection(shot.endX - shot.x, shot.endY - shot.y, this.mutableState.rotation);
      return;
    }
    const origin = this.replicatedOrigin;
    const initialLife = Math.max(1, shot.life);
    let velocity: { vx: number; vy: number };
    if (typeof shot.vx === 'number' && typeof shot.vy === 'number') velocity = { vx: shot.vx, vy: shot.vy };
    else velocity = { vx: (shot.endX - shot.x) * WORLD.tickRate / initialLife, vy: (shot.endY - shot.y) * WORLD.tickRate / initialLife };
    let velocityChanged = true;
    if (origin) velocityChanged = origin.velocity.vx !== velocity.vx || origin.velocity.vy !== velocity.vy;
    if (!origin || origin.x !== shot.x || origin.y !== shot.y || origin.endX !== shot.endX || origin.endY !== shot.endY || velocityChanged) {
      this.replicatedOrigin = { x: shot.x, y: shot.y, endX: shot.endX, endY: shot.endY, initialLife, velocity };
    }
    const current = this.replicatedOrigin!;
    const elapsedTicks = Math.max(0, current.initialLife - shot.life);
    this.mutableState.x = current.x + current.velocity.vx * elapsedTicks / WORLD.tickRate;
    this.mutableState.y = current.y + current.velocity.vy * elapsedTicks / WORLD.tickRate;
    this.mutableState.endX = shot.endX;
    this.mutableState.endY = shot.endY;
    this.mutableState.z = shot.z;
    this.mutableState.life = shot.life;
    this.mutableState.impact = shot.impact ?? false;
    this.mutableState.beam = shot.beam ?? false;
    this.mutableState.vx = shot.vx ?? 0;
    this.mutableState.vy = shot.vy ?? 0;
    let rotationX = shot.endX - shot.x;
    if (typeof shot.vx === 'number') rotationX = shot.vx;
    let rotationY = shot.endY - shot.y;
    if (typeof shot.vy === 'number') rotationY = shot.vy;
    this.mutableState.rotation = rotationFromDirection(rotationX, rotationY, this.mutableState.rotation);
  }
  /** Mark a moving source object at its collision point. */
  impactAt(x: number, y: number, z = this.mutableState.z, cause: 'entity' | 'surface' | 'wall' = 'entity', wallImpact?: { wallSide?: number; explosionType?: number }) {
    this.mutableState.x = x; this.mutableState.y = y;
    this.mutableState.z = z;
    this.mutableState.endX = x; this.mutableState.endY = y;
    this.impactCause = cause;
    this.impactExplosionType = wallImpact?.explosionType;
    this.mutableState.impact = true; this.mutableState.life = 0;
  }
  markWaterDeath() {
    this.mutableState.destroyedByWater = true;
    this.mutableState.impact = false;
    this.mutableState.waterDeathAge = 0;
    this.mutableState.life = GTA2_WATER_SPLASH_VISUAL_TICKS;
  }
  setImpactTarget(target: NonNullable<ProjectileState['impactTarget']>) { this.mutableState.impactTarget = target; }
  private emitImpactEffect(combat: ProjectileImpactContext) {
    if (this.impactEffectResolved || this.mutableState.destroyedByWater) return;
    const state = this.mutableState, weapon = combat.weaponSystem.get(state.weapon);
    if (weapon.waterCannon) {
      this.impactEffectResolved = true;
      emitWaterCannonImpact(combat, state.actor, state.x, state.y, state.z, state.rotation);
      return;
    }
    // A source flame with no target is itself the stream segment; only its
    // target transition creates the separate fire-hitting child.
    if (state.projectileType === 'flame' && !state.impactTarget && this.impactCause !== 'wall') return;
    this.impactEffectResolved = true;
    combat.spawnEffect({
      x: state.x, y: state.y, z: state.z, kind: 'impact', life: 7,
      owner: state.actor, rotation: state.rotation, sourceModel: weapon.impactModel,
    });
  }
  /** Complete the projectile's authored terminal transition. The projectile
   * owns its explosion/fire children; the context supplies world capabilities. */
  detonate(combat: ProjectileCombatContext) {
    if (this.detonationResolved) return;
    this.detonationResolved = true;
    const state = this.mutableState;
    state.impact = true;
    state.life = 0;
    if (!combat.authoritative) return;
    const weapon = combat.weaponSystem.get(state.weapon);
    // The cook-timeout path creates a compact thrown-object state without a
    // copied source model. Resolve the authored model at the terminal
    // transition so explosion packets and vehicle immunity still use the
    // Weapon_30 mapping.
    const sourceModel = state.sourceModel ?? weapon.sourceModel;
    let impactX = state.endX;
    if (state.impact) impactX = state.x;
    let impactY = state.endY;
    if (state.impact) impactY = state.y;
    const wallSpecificExplosion = this.impactCause === 'wall' && (
      sourceModel === GTA2_SOURCE_OBJECT_MODELS.rocketBullet || sourceModel === GTA2_SOURCE_OBJECT_MODELS.movingMolotov
    );
    if (weapon.impactModel !== undefined && !wallSpecificExplosion) {
      combat.spawnEffect({
        x: impactX, y: impactY, z: state.z, kind: 'impact', life: 7,
        owner: state.actor, rotation: state.rotation, sourceModel: weapon.impactModel,
      });
    }
    const sourceTimedRocket = weapon.kind === 'rocket' && sourceModel === GTA2_SOURCE_OBJECT_MODELS.rocketBullet;
    let blastRadius = 110;
    if (sourceTimedRocket || weapon.sourceType === 2 || weapon.sourceType === 4 || weapon.sourceType === 5 || weapon.sourceType === 17) {
      // Explosion_30 type 18 is a half-tile blast. Grenades, moving
      // molotovs, rockets, and mines use that authored small radius; larger
      // item/car-bomb blasts are represented by their dedicated dispatchers.
      blastRadius = WORLD.projectile.sourceSmallExplosionRadius;
    }
    if (weapon.damage > 0) {
      let explosionLife = GTA2_EXPLOSION_VISUAL_TICKS;
      if (sourceTimedRocket) explosionLife = WORLD.projectile.sourceExplosionTicks;
      const sourceExplosionType = this.impactExplosionType ?? 18;
      const explosionState: HazardState = {
        id: combat.nextHazardId(), x: impactX, y: impactY, z: state.z,
        kind: 'fire', life: explosionLife,
        owner: state.actor, effect: 'explosion', explosionType: sourceExplosionType === 20 ? 'large' : sourceExplosionType === 19 ? 'item' : 'small', sourceExplosionType, sourceModel,
      };
      if (sourceTimedRocket) explosionState.sourceTimer = WORLD.projectile.sourceExplosionTicks;
      const explosion = createHazardObject(explosionState);
      if (explosion instanceof ExplosionObject) {
        // Car_BC::Explosion_30::ApplyBlastDamage applies the full vehicle
        // packet to every car inside the blast radius. The weapon's direct
        // object packet (e.g. grenade = 800) is a separate source path.
        explosion.armBlast({ actor: state.actor, weapon: state.weapon, radius: blastRadius, damage: weapon.damage, pellets: weapon.pellets, selfDamage: state.selfDamage || sourceTimedRocket, height: 2, knockback: sourceTimedRocket ? 10 : 6, sourceModel });
        this.spawn(explosion);
        // Mines, grenades, and other existing explosive paths keep their
        // immediate area resolution. A rocket enters Explosion_30's timed
        // phase and resolves from the hazard update loop instead.
        if (!sourceTimedRocket) explosion.resolveBlast(combat);
      }
      if (weapon.sourceType === 4) {
        const surface = combat.surfaceAt(impactX, impactY, state.z);
        const support = surface[0];
        // A source Molotov that reaches water loses the attached fire object;
        // the water splash/projectile death path remains responsible for the
        // visual transition. Ground fire is only left on a valid dry surface.
        if (!combat.isWaterAt({ x: impactX, y: impactY, z: state.z })) {
          const fire: HazardState = {
            id: combat.nextHazardId(), x: impactX, y: impactY, z: support?.height ?? state.z,
            kind: 'fire', life: WORLD.projectile.molotovFireTicks, owner: state.actor, effect: 'fire',
          };
          if (support) fire.collisionLayer = support.collisionLayer;
          this.spawn(createHazardObject(fire));
        }
      }
    }
    combat.emit({ type: 'explosion', actor: state.actor, weapon: state.weapon, damage: weapon.damage, x: impactX, y: impactY, z: state.z });
    combat.findPlayer(state.actor)?.recordShot({ x: state.x, y: state.y, endX: impactX, endY: impactY, z: state.z, life: 4, weapon: state.weapon, projectile: true, impact: true });
  }
  /** Resolve a moving projectile's terminal target through typed object
   * actions. Explosive projectiles are handled by ExplosionObject instead. */
  resolveImpact(combat: ProjectileImpactContext) {
    const state = this.mutableState, target = state.impactTarget;
    if (!combat.authoritative || state.destroyedByWater || state.explosive) return;
    if (!state.impact && state.life > 0) return;
    const weapon = combat.weaponSystem.get(state.weapon), actor = combat.findPlayer(state.actor);
    let actorNpc;
    if (state.actor.startsWith('npc:')) actorNpc = combat.findNpc(Number(state.actor.slice('npc:'.length)));
    // The server removes the moving stream object at impact, while clients
    // also have the owner's replicated shot. Stop that replica at the same
    // point; otherwise a burning target gets both the stream end and its
    // single attached fire object for one extra flight duration.
    const shotSequence = state.shotSequence;
    if (weapon.kind === 'flame' && shotSequence !== undefined) actor?.markShotImpact(shotSequence);
    this.emitImpactEffect(combat);
    if (!target) return;
    let actorNpcId: number | undefined;
    if (state.actor.startsWith('npc:')) actorNpcId = Number(state.actor.slice('npc:'.length));
    if (weapon.kind === 'shock') {
      if (shotSequence !== undefined) {
        actor?.markShotImpact(shotSequence);
        actorNpc?.markShotImpact(shotSequence);
      }
      let endpoint;
      if (target.kind === 'player') endpoint = combat.findPlayer(String(target.id))?.state;
      else if (target.kind === 'npc') endpoint = combat.findNpc(Number(target.id))?.state;
      else endpoint = combat.findVehicle(Number(target.id))?.state;
      const impactState: ProjectileStateInput = {
        actor: state.actor, weapon: state.weapon, x: state.x, y: state.y,
        endX: endpoint?.x ?? state.x, endY: endpoint?.y ?? state.y, z: state.z, life: 1, rotation: state.rotation,
        impact: true, beam: true, impactTarget: target,
        projectileType: 'shock',
      };
      if (typeof weapon.sourceModel === 'number') impactState.sourceModel = weapon.sourceModel;
      const impact = new HitscanImpactObject(`${this.key}:baton-impact`, impactState);
      this.spawn(impact);
      impact.resolveHitscan(combat);
      impact.deferDespawn();
      const owner = actor ?? actorNpc;
      owner?.recordShot({ x: state.x, y: state.y, endX: impactState.endX, endY: impactState.endY, z: state.z, life: 4, weapon: state.weapon, projectile: true, impact: true, beam: true });
      return;
    }
    if (weapon.waterCannon) {
      if (target.kind === 'player') {
        const victim = combat.findPlayer(String(target.id));
        if (!victim || victim.id === state.actor || victim.combatState.respawn > 0 || (actor?.state.team && actor.state.team === victim.state.team)) return;
        resolveWaterCannonPlayerHit(victim, state.actor, state.weapon, combat);
        return;
      }
      if (target.kind === 'npc') {
        const victim = combat.findNpc(Number(target.id));
        if (!victim || victim.state.health <= 0 || victim.state.vehicleId !== undefined || victim.id === actorNpcId) return;
        const damage = Math.max(1, Math.round(weapon.npcDamage ?? 5));
        combat.damageNpc(victim, damage, state.actor, GTA2_SOURCE_OBJECT_MODELS.bulletOnFire, state.rotation, 'weapon');
        combat.emit({ type: 'hit', actor: state.actor, target: `npc:${victim.id}`, weapon: state.weapon, damage, lethal: victim.state.health <= 0, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      const vehicle = combat.findVehicle(Number(target.id));
      if (vehicle?.alive) combat.extinguishVehicleFire(vehicle);
      return;
    }
    if (target.kind === 'player') {
      const victim = combat.findPlayer(String(target.id));
      if (!victim || victim.id === state.actor || victim.combatState.respawn > 0 || (actor?.state.team && actor.state.team === victim.state.team)) return;
      if (weapon.kind === 'flame') {
        victim.setOnFire(combat);
        combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      if (weapon.kind === 'bullet' && absorbDirectProjectileArmor(victim)) {
        combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      const damage = Math.max(1, Math.round(weapon.playerDamage ?? weapon.damage));
      const currentHealth = victim.combatState.health, armor = Math.min(victim.state.armor, Math.ceil(damage * .5));
      combat.damagePlayer(victim, damage, state.actor, 'weapon');
      combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage, lethal: currentHealth <= damage - armor, x: victim.state.x, y: victim.state.y, z: victim.state.z });
      return;
    }
    if (target.kind === 'npc') {
      const victim = combat.findNpc(Number(target.id));
      if (!victim || victim.state.health <= 0 || victim.state.vehicleId !== undefined || victim.id === actorNpcId) return;
      let sourceModel = state.sourceModel;
      if (weapon.kind === 'flame') sourceModel = GTA2_SOURCE_OBJECT_MODELS.fireHitting;
      let damage = Math.max(1, Math.round(weapon.npcDamage ?? weapon.damage));
      if (weapon.kind === 'flame') damage = 0;
      combat.damageNpc(victim, damage, state.actor, sourceModel, undefined, 'weapon');
      combat.emit({ type: 'hit', actor: state.actor, target: `npc:${victim.id}`, weapon: state.weapon, damage, lethal: victim.state.health <= 0, x: victim.state.x, y: victim.state.y, z: victim.state.z });
      return;
    }
    const vehicle = combat.findVehicle(Number(target.id));
    if (!vehicle || !vehicle.alive) return;
    let sourceModel = weapon.sourceModel;
    if (weapon.kind === 'flame') sourceModel = GTA2_SOURCE_OBJECT_MODELS.fireHitting;
    const damage = sourceDamageForObjectModel(sourceModel);
    if (damage > 0) combat.damageVehicle(vehicle, damage, state.x, state.y, sourceModel, state.actor);
  }
  /** Integrate the source projectile once per authoritative fixed tick. */
  advance(dt: number) {
    const state = this.mutableState;
    state.prevX = state.x; state.prevY = state.y; state.prevZ = state.z;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;
    if (state.gravity) state.vz += state.gravity * dt;
    if (state.destroyedByWater) state.waterDeathAge++;
    state.life--;
    return state.life <= 0;
  }
  private spriteRange() {
    const state = this.mutableState;
    const weapon = WEAPONS[state.weapon];
    const sourceModel = state.sourceModel ?? weapon?.sourceModel;
    if (sourceModel === undefined) return GTA2_WEAPON_PROJECTILE_SPRITES[state.weapon];
    const sourceRange = GTA2_SOURCE_OBJECT_SPRITES[sourceModel];
    return sourceRange ?? (sourceModelHasVisualFallback(sourceModel) ? GTA2_WEAPON_PROJECTILE_SPRITES[state.weapon] : undefined);
  }

  override get isRenderable() {
    const state = this.mutableState;
    if (state.beam) return Math.hypot(state.endX - state.x, state.endY - state.y) >= 1e-6;
    return this.spriteRange() !== undefined;
  }

  override getSprite(_now: number): GameObjectSprite {
    const state = this.mutableState;
    const weapon = WEAPONS[state.weapon];
    if (state.beam) return electricalBeamSprite(state, this.placement);
    const sourceModel = state.sourceModel ?? weapon?.sourceModel;
    let range;
    const sourceRange = sourceModel === undefined ? undefined : GTA2_SOURCE_OBJECT_SPRITES[sourceModel];
    if (sourceModel === undefined) range = GTA2_WEAPON_PROJECTILE_SPRITES[state.weapon];
    else range = sourceRange ?? (sourceModelHasVisualFallback(sourceModel) ? GTA2_WEAPON_PROJECTILE_SPRITES[state.weapon] : undefined);
    if (!range) throw new Error(`No projectile sprite for weapon ${state.weapon}`);
    const renderSourceModel = sourceRange ? sourceModel : undefined;
    const ordinaryBullet = sourceModel === GTA2_SOURCE_OBJECT_MODELS.machineGunBullet || sourceModel === GTA2_SOURCE_OBJECT_MODELS.pistolBullet;
    let bulletOffset = 0;
    if (ordinaryBullet && state.actor.startsWith('npc:')) bulletOffset = 2;
    const model = range.start + Math.min(bulletOffset, Math.max(0, range.count - 1));
    const rotation = state.rotation;
    let frameTicks;
    let frameTicksByFrame;
    if (renderSourceModel !== undefined) frameTicks = GTA2_SOURCE_PROJECTILE_FRAME_TICKS[renderSourceModel];
    if (weapon?.kind === 'flame') frameTicksByFrame = GTA2_FLAME_SEGMENT_FRAME_TICKS;
    let flameScale;
    if (weapon?.kind === 'flame') flameScale = GTA2_FLAME_SEGMENT_SCALE;
    let rocketTrail: GameObjectSpriteLayer | undefined;
    if (this.projectileType === 'rocket') {
      const direction = directionFromRotation(rotation);
      rocketTrail = {
        atlas: 'codeObjects',
        sourceSequence: 'rocket-trail',
        model: GTA2_SOURCE_EFFECT_SPRITES.rocketTrail.start,
        animation: 'projectile',
        frameCount: GTA2_SOURCE_EFFECT_SPRITES.rocketTrail.count,
        frameTicks: 1,
        loop: true,
        animationKey: `${this.key}:rocket-trail`,
        placement: {
          ...this.placement,
          x: state.x - direction.x * 9,
          y: state.y - direction.y * 9,
          rotation,
        },
        opacity: state.life <= 0 ? 0 : Math.min(1, state.life / 4),
        alphaTest: .01,
        presentation: { band: 'overlay', elevation: -.5 },
        fallbackColor: 0xff9a43,
      };
    }
    let molotovTrail: GameObjectSpriteLayer | undefined;
    if (this.projectileType === 'molotov') {
      const direction = directionFromRotation(rotation);
      molotovTrail = {
        atlas: 'codeObjects', sourceSequence: 'fire-trail', model: GTA2_SOURCE_EFFECT_SPRITES.fireTrail.start,
        animation: 'fire', frameCount: GTA2_SOURCE_EFFECT_SPRITES.fireTrail.count, frameTicks: 1, loop: true,
        animationKey: `${this.key}:molotov-trail`,
        placement: { ...this.placement, x: state.x - direction.x * 8, y: state.y - direction.y * 8, z: state.z + .08, rotation },
        opacity: state.life <= 0 ? 0 : Math.min(1, state.life / 4), scale: .65,
        alphaTest: .01,
        presentation: { band: 'overlay', elevation: -.4 }, fallbackColor: 0xff7b36,
      };
    }
    let flameLead = 0;
    if (weapon?.kind === 'flame') flameLead = GTA2_FLAME_MUZZLE_LEAD;
    let flameDirection;
    if (flameLead) flameDirection = directionFromRotation(rotation);
    let spritePlacement = { ...this.placement, rotation };
    if (flameDirection) spritePlacement = { ...this.placement, x: state.x + flameDirection.x * flameLead, y: state.y + flameDirection.y * flameLead, rotation };
    let frameCount = range.count;
    if (ordinaryBullet) frameCount = 1;
    const spriteBase = {
      atlas: 'codeObjects' as const, model, animation: 'projectile' as const,
      frameCount,
      placement: spritePlacement,
      opacity: state.life <= 0 ? 0 : Math.min(1, state.life / 4) * (state.destroyedByWater ? Math.min(1, state.life / GTA2_WATER_SPLASH_VISUAL_TICKS) : 1),
      alphaTest: .01, presentation: { band: 'overlay' as const }, fallbackColor: 0xffc04d,
    };
    let sprite: GameObjectSprite = { ...spriteBase, frameMs: 55 };
    if (frameTicks !== undefined) sprite = { ...spriteBase, frameTicks };
    if (frameTicksByFrame !== undefined) sprite = { ...sprite, frameTicksByFrame, loop: false, animationKey: `${this.key}:flame-segment` };
    if (renderSourceModel !== undefined) sprite = { ...sprite, sourceModel: renderSourceModel, definition: { bank: 'code-object', sourceId: renderSourceModel } };
    if (flameScale !== undefined) sprite = { ...sprite, scale: flameScale };
    if (this.projectileType === 'molotov') sprite = { ...sprite, light: GTA2_MOLOTOV_LIGHT };
    if (state.destroyedByWater) sprite = { ...sprite, scale: Math.max(.2, state.life / GTA2_WATER_SPLASH_VISUAL_TICKS), opacity: Math.min(1, state.life / GTA2_WATER_SPLASH_VISUAL_TICKS) };
    const layers = [rocketTrail, molotovTrail].filter((layer): layer is GameObjectSpriteLayer => layer !== undefined);
    if (layers.length) sprite = { ...sprite, layers };
    return sprite;
  }
}

/** Instantaneous weapon result represented as a short-lived object so shock,
 * hitscan damage, and wanted-level side effects follow the same lifecycle as
 * moving projectiles. It resolves immediately when spawned, then disappears
 * at the next lifecycle flush. */
export class HitscanImpactObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) { super(id, state, 'shock', update); }

  resolveHitscan(combat: ProjectileImpactContext) {
    const state = this.mutableState, target = state.impactTarget;
    if (!combat.authoritative || !target) return;
    const weapon = combat.weaponSystem.get(state.weapon), actor = combat.findPlayer(state.actor);
    if (weapon.waterCannon) {
      emitWaterCannonImpact(combat, state.actor, state.endX, state.endY, state.z, state.rotation);
      let actorNpcId: number | undefined;
      if (state.actor.startsWith('npc:')) actorNpcId = Number(state.actor.slice('npc:'.length));
      if (target.kind === 'player') {
        const victim = combat.findPlayer(String(target.id));
        if (!victim || victim.id === state.actor || victim.combatState.respawn > 0 || (actor?.state.team && actor.state.team === victim.state.team)) return;
        resolveWaterCannonPlayerHit(victim, state.actor, state.weapon, combat);
        return;
      }
      if (target.kind === 'npc') {
        const victim = combat.findNpc(Number(target.id));
        if (!victim || victim.state.health <= 0 || victim.state.vehicleId !== undefined || victim.id === actorNpcId) return;
        const damage = Math.max(1, Math.round(weapon.npcDamage ?? 5));
        combat.damageNpc(victim, damage, state.actor, GTA2_SOURCE_OBJECT_MODELS.bulletOnFire, state.rotation, 'weapon');
        combat.emit({ type: 'hit', actor: state.actor, target: `npc:${victim.id}`, weapon: state.weapon, damage, lethal: victim.state.health <= 0, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      const vehicle = combat.findVehicle(Number(target.id));
      if (vehicle?.alive) combat.extinguishVehicleFire(vehicle);
      return;
    }
    const impactModel = weapon.impactModel ?? (state.sourceModel === GTA2_SOURCE_OBJECT_MODELS.pistolBullet || state.sourceModel === GTA2_SOURCE_OBJECT_MODELS.machineGunBullet ? undefined : state.sourceModel);
    combat.spawnEffect({ x: state.endX, y: state.endY, z: state.z, kind: 'impact', life: 7, owner: state.actor, rotation: state.rotation, sourceModel: impactModel });
    let actorNpcId: number | undefined;
    if (state.actor.startsWith('npc:')) actorNpcId = Number(state.actor.slice('npc:'.length));
    if (target.kind === 'player') {
      const victim = combat.findPlayer(String(target.id));
      if (!victim || victim.id === state.actor || victim.combatState.respawn > 0 || (actor?.state.team && actor.state.team === victim.state.team)) return;
      if (weapon.kind === 'stun') {
        victim.shock(5); victim.endAttack();
        combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      let damage = Math.max(1, Math.round(weapon.playerDamage ?? weapon.damage));
      if (weapon.kind === 'shock') damage = 3;
      if (weapon.kind === 'shock') victim.shock(3);
      if (weapon.kind === 'bullet' && absorbDirectProjectileArmor(victim)) {
        combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
        return;
      }
      const currentHealth = victim.combatState.health, armor = Math.min(victim.state.armor, Math.ceil(damage * .5));
      combat.damagePlayer(victim, damage, state.actor, 'weapon');
      combat.emit({ type: 'hit', actor: state.actor, target: victim.id, weapon: state.weapon, damage, lethal: currentHealth <= damage - armor, x: victim.state.x, y: victim.state.y, z: victim.state.z });
      return;
    }
    if (target.kind === 'npc') {
      const victim = combat.findNpc(Number(target.id));
      if (!victim || victim.state.health <= 0 || victim.id === actorNpcId) return;
      let damage = Math.max(1, Math.round(weapon.npcDamage ?? weapon.damage));
      if (weapon.kind === 'stun') damage = 0;
      if (weapon.kind === 'stun') victim.shock(5);
      else combat.damageNpc(victim, damage, state.actor, state.sourceModel, undefined, 'weapon');
      combat.emit({ type: 'hit', actor: state.actor, target: `npc:${victim.id}`, weapon: state.weapon, damage, lethal: victim.state.health <= 0, x: victim.state.x, y: victim.state.y, z: victim.state.z });
      return;
    }
    const vehicle = combat.findVehicle(Number(target.id));
    if (!vehicle || !vehicle.alive) return;
    const damage = sourceDamageForWeapon(weapon);
    if (damage > 0) {
      // Hitscan bullets carry the ray's terminal point in endX/endY. Using
      // the car centre here makes every hit resolve to the same fallback
      // damage quadrant, regardless of where the ray actually touched the
      // chassis.
      combat.damageVehicle(vehicle, damage, state.endX, state.endY, state.sourceModel, state.actor);
    }
  }

  override get isRenderable() {
    const state = this.mutableState, weapon = WEAPONS[state.weapon];
    return (weapon?.kind === 'stun' || state.beam) && Boolean(state.impactTarget) && Math.hypot(state.endX - state.x, state.endY - state.y) >= 1e-6;
  }

  override getSprite(_now: number): GameObjectSprite {
    const state = this.mutableState, weapon = WEAPONS[state.weapon];
    if ((weapon?.kind !== 'stun' && !state.beam) || !state.impactTarget) throw new Error('Hitscan impact has no renderable beam');
    return electricalBeamSprite(state, this.placement);
  }
}

/** A short-lived firearm/tracer object. Hitscan damage is resolved by the
 * authoritative world, while this object owns the authored bullet sprite and
 * lifetime. */
export class BulletObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) { super(id, state, 'bullet', update); }
}

/** Rocket projectiles retain collision until they reach their impact point and
 * are marked explosive for the source-style blast transition. */
export class RocketObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) {
    state.explosive = true;
    super(id, state, 'rocket', update);
  }
}

/** Thrown grenade projectile. The throw velocity and any source gravity are
 * supplied by the firing code; this class identifies the authored behavior. */
export class GrenadeObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) {
    state.explosive = true;
    super(id, state, 'grenade', update);
  }
}

/** Molotov projectile. Its impact is converted into a FireObject by the world
 * after collision, preserving the source's separate projectile and fire
 * objects. */
export class MolotovObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) {
    state.explosive = true;
    super(id, state, 'molotov', update);
  }
}

/** Flamethrower segment; it is moving but intentionally non-explosive. */
export class FlameObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) { super(id, state, 'flame', update); }
}

/** Electric weapons render a transient beam/impact object without becoming a
 * moving collision projectile. */
export class ShockObject extends ProjectileObject {
  constructor(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) { super(id, state, 'shock', update); }
}

export function createProjectileObject(id: string, state: ProjectileStateInput, update?: GameObjectUpdateHandler<ProjectileState>) {
  switch (state.projectileType ?? projectileTypeForWeapon(state.weapon)) {
    case 'rocket': return new RocketObject(id, state, update);
    case 'grenade': return new GrenadeObject(id, state, update);
    case 'molotov': return new MolotovObject(id, state, update);
    case 'flame': return new FlameObject(id, state, update);
    case 'shock': return new ShockObject(id, state, update);
    default: return new BulletObject(id, state, update);
  }
}
