import type { CombatShot, CombatState, Input, PlayerControl, PlayerState, WorldEventInput } from '../../protocol/types';
import { type GameObjectCombatContext, type GameObjectPlacement, type GameObjectSprite, type PlayerDamageContext } from './gameobject';
import { StatefulGameObject, type GameObjectUpdateHandler, type MobilePose } from './stateful';
import { COLLISION_CATEGORY } from '../../domain/physics/collision';
import { WORLD } from '../../domain/world/world';
import { sourceAnimationDefinition, sourceAnimationPosition } from '../../domain/animation';
import { directionFromRotation, rotationFromDirection } from '../../domain/physics/motion-vector';
import { GTA2_PLAYER_FIRE_POINT_FORWARD, GTA2_PLAYER_FIRE_POINT_RIGHT, projectileTravelTicks, sourceThrowableSpeed, sourceWeaponAngleToRadians, WeaponId } from '../../domain/combat/weapons';
import type { HistoryTick } from '../../domain/combat/lag-compensation';
import type { WeaponRay, WeaponRayActor } from '../../domain/combat/weapon-raycaster';
import type { WeaponSystem } from '../../domain/combat/weapon-system';
import type { ProjectileSpawnResult } from '../runtime/projectile-controller';
import { PlayerMovementSystem } from '../player-movement';
import { createProjectileObject, GrenadeObject, HitscanImpactObject, projectileStateFromShot, ProjectileObject, type ProjectileStateInput } from '../effects/projectile';
import { createHazardObject } from '../effects/hazard';
import { GTA2_SOURCE_OBJECT_MODELS, GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../domain/world/gta2-sprites';
import { sourcePedestrianImpact } from '../../domain/physics/pedestrian-impact';

export interface PlayerCombatContext {
  readonly input: Input;
  readonly weaponSystem: Pick<WeaponSystem, 'get'>;
  readonly traceWeaponRay: (actor: WeaponRayActor, weaponId: number, originX: number, originY: number, angle: number, clientTick: HistoryTick) => WeaponRay;
  readonly traceShockerWeapon: (actor: WeaponRayActor, originX: number, originY: number, angle: number, clientTick: HistoryTick) => WeaponRay[];
  readonly spawnWeaponVisual: (actor: WeaponRayActor, weaponId: number, originX: number, originY: number, z: number, angle: number, distance: number, explosive?: boolean, collision?: boolean) => ProjectileSpawnResult;
  readonly combat: GameObjectCombatContext;
  readonly emit: (event: WorldEventInput) => void;
}

export class PlayerObject extends StatefulGameObject<PlayerState, string> {
  private heldControlMask = 0;
  private shotSequence = 0;
  private readonly movementSystem = new PlayerMovementSystem();
  private replicatedShots = new Map<string, ProjectileObject>();
  constructor(state: PlayerState, update?: GameObjectUpdateHandler<PlayerState>) {
    super(state.id, state, 'player', update);
    this.collision = { shape: { type: 'circle', radius: WORLD.player.radius }, restitution: 0, friction: .15 };
  }
  /** A seated ped has no independent world location: the vehicle chassis is
   * the canonical placement used by rendering, camera tracking, and physics
   * adapters. Entry/exit animations retain their authored transition pose. */
  override get placement(): Readonly<GameObjectPlacement> {
    if (this.mutableState.vehicleId !== undefined && this.mutableState.animation?.kind === 'seated') {
      return this.gameState.findVehicle(this.mutableState.vehicleId)?.placement ?? super.placement;
    }
    return super.placement;
  }

  protected override set placement(value: GameObjectPlacement) {
    super.placement = value;
  }

  override readPhysicsVelocity() {
    if (this.mutableState.vehicleId !== undefined && this.mutableState.animation?.kind === 'seated') {
      const vehicle = this.gameState.findVehicle(this.mutableState.vehicleId);
      if (vehicle) return vehicle.readPhysicsVelocity();
    }
    return super.readPhysicsVelocity();
  }

  override get collisionEnabled() {
    const combat = this.mutableState.combat;
    return combat.health > 0 && combat.respawn <= 0 && (this.mutableState.vehicleId === undefined || this.mutableState.animation === undefined);
  }

  transitionAnimation(animation: PlayerState['animation']) { this.mutableState.animation = animation; }

  /** Combat state is read through a typed object boundary. Systems may query
   * it, but state transitions go through the action methods below. */
  get combatState(): Readonly<CombatState> { return this.mutableState.combat; }

  get activeWeapon() { return this.mutableState.combat.weapon; }

  get heldControls() { return this.heldControlMask; }

  /** Direction the player is facing. Vehicle objects use their own chassis
   * direction once this player delegates movement to them. */
  get forward() { return directionFromRotation(this.mutableState.rotation); }

  /** Route one movement command through the object that owns the movement.
   * A seated/passenger player has no independent movement integration. */
  applyMovementInput(input: Input, floor: number, dt: number, slippery = false) {
    if (this.mutableState.vehicleId !== undefined) {
      this.driveVehicle(input, dt, slippery);
      return;
    }
    this.movementSystem.update(this.mutableState, input, floor, dt);
  }

  /** Delegate driver input to the occupied vehicle. The vehicle validates the
   * driver seat and entry state before applying throttle or steering. */
  driveVehicle(input: Input, dt: number, slippery = false) {
    if (this.mutableState.vehicleId === undefined) return false;
    const vehicle = this.gameState.findVehicle(this.mutableState.vehicleId);
    return vehicle?.applyDriverInput(this.id, input, dt, slippery) ?? false;
  }

  /** Let the player own the short-lived client replica of its shot. */
  syncReplicatedShot() {
    const combat = this.mutableState.combat;
    const incoming = combat.shots;
    const desired = new Set<string>();
    for (const shot of incoming) {
      if (!shot.projectile || (shot.impact && !shot.beam)) continue;
      let identity = `${shot.weapon}:${shot.x}:${shot.y}:${shot.endX}:${shot.endY}`;
      if (shot.sequence !== undefined) identity = `${shot.sequence}`;
      const key = `${this.id}:shot:${identity}`;
      desired.add(key);
      const existing = this.replicatedShots.get(key);
      if (existing) existing.syncReplicatedShot(shot);
      else this.replicatedShots.set(key, this.spawn(createProjectileObject(key, projectileStateFromShot(this.id, shot))));
    }
    for (const [key, projectile] of this.replicatedShots) {
      if (desired.has(key)) continue;
      projectile.despawn();
      this.replicatedShots.delete(key);
    }
  }

  override despawn() {
    for (const projectile of this.replicatedShots.values()) projectile.despawn();
    this.replicatedShots.clear();
    super.despawn();
  }

  /** Apply explicit start/end controls and retain the resulting held state for
   * continuous movement and firing between network packets. */
  applyControls(controls: readonly PlayerControl[]) {
    const bits: Record<string, number> = {
      forwardStart: 1, forwardEnd: 1, backwardStart: 2, backwardEnd: 2,
      leftStart: 4, leftEnd: 4, rightStart: 8, rightEnd: 8,
      shootStart: 16, shootEnd: 16, sprintStart: 32, sprintEnd: 32,
    };
    for (const control of controls) {
      const bit = bits[control];
      if (!bit) continue;
      if (control.endsWith('Start')) this.heldControlMask |= bit;
      else this.heldControlMask &= ~bit;
    }
    return this.heldControlMask;
  }

  ammoFor(weapon = this.activeWeapon) {
    const ammo = this.mutableState.combat.ammo[weapon];
    return ammo ?? 0;
  }

  consumeAmmo(weapon = this.activeWeapon) {
    const combat = this.mutableState.combat;
    if (!Number.isInteger(weapon) || weapon < 0 || weapon >= combat.ammo.length) return false;
    const ammo = combat.ammo[weapon];
    if (ammo === undefined || ammo <= 0) return false;
    combat.ammo[weapon] = ammo - 1;
    return true;
  }

  /** Commit one authored weapon emission as a player-owned state transition. */
  fireWeapon(weapon: number, cooldown: number) {
    if (!this.consumeAmmo(weapon)) return false;
    this.startWeaponCooldown(cooldown);
    // The source firing pose is a consequence of a successful emission, not
    // of a held trigger or a cooldown-ready check. Keep it visible briefly
    // while the weapon's reload timer is already running.
    this.mutableState.combat.fireAnimation = 2;
    return true;
  }

  /** Interpret one authoritative combat tick and create the relevant effect
   * objects through the injected world actions. Player-owned state remains in
   * this object; raycasts and target resolution stay world services. */
  updateCombat(context: PlayerCombatContext) {
    const player = this.mutableState, combat = this.mutableState.combat;
    const input = context.input, explicitControls = input.controls !== undefined;
    const shootStart = input.controls?.includes('shootStart') === true;
    const shootEnd = input.controls?.includes('shootEnd') === true;
    if (explicitControls) {
      if (shootStart) this.beginAttack();
      if (shootEnd) this.endAttack();
    } else this.endAttack();
    let fireDown = Boolean(input.keys & 16);
    if (explicitControls) fireDown = Boolean(combat.attacking);
    if (combat.respawn) { this.resetCombatInput(input.keys); return; }
    if (combat.weapon === WeaponId.None) {
      this.endAttack();
      if (combat.throwing) this.cancelThrow(0);
      this.rememberCombatInput(input.keys);
      return;
    }
    const weapon = context.weaponSystem.get(combat.weapon);
    const ammo = () => this.ammoFor(combat.weapon);
    if (weapon.throwable) {
      if (fireDown && ammo() > 0) {
        if (!this.beginThrow()) { this.rememberCombatInput(input.keys); return; }
        const throwCharge = this.chargeThrow();
        this.recordShot({ x: player.x, y: player.y, endX: player.x, endY: player.y, z: player.z, life: 2, weapon: combat.weapon, projectile: false });
        if (combat.weapon === WeaponId.Grenade && throwCharge >= 96 && !combat.cooldown) {
          this.fireWeapon(combat.weapon, weapon.interval); this.finishThrow(weapon.interval);
          this.detonateGrenade(combat.weapon, context.combat);
          context.emit({ type: 'shot', actor: this.id, weapon: combat.weapon, x: player.x, y: player.y, z: player.z });
        }
      } else if (!fireDown && combat.throwing && !combat.cooldown && ammo() > 0) {
        const charge = Math.max(1, combat.throwCharge), strength = Math.max(1, Math.min(60, charge)), ratio = strength / 60;
        const direction = directionFromRotation(player.rotation);
        const speed = sourceThrowableSpeed(combat.weapon, strength);
        const travelDistance = weapon.range * (.35 + ratio * .65);
        if (travelDistance <= .5) this.cancelThrow();
        else {
          const pending = context.spawnWeaponVisual(player, combat.weapon, player.x, player.y, player.z + .5, player.rotation, travelDistance, true);
          let carried = 0;
          if (Math.hypot(player.vx, player.vy) > 1e-6) carried = WORLD.projectile.sourceThrow.carriedVelocity * WORLD.projectile.sourceThrow.fix16Scale * WORLD.tileSize * WORLD.tickRate;
          const throwSpeed = speed + carried;
          const life = Math.max(WORLD.projectile.minimumTravelTicks, Math.ceil(travelDistance / Math.max(1, speed) * WORLD.tickRate));
          // Grenades use Object_2C::o8.timer as their fuse.  The source does
          // not keep them airborne until the authored range is exhausted.
          let projectileLife = life;
          if (combat.weapon === WeaponId.Grenade) projectileLife = Math.max(1, Math.floor((96 - charge) / 8));
          pending.configureLaunch({ vx: direction.x * throwSpeed + player.vx, vy: direction.y * throwSpeed + player.vy, life: projectileLife, selfDamage: true, vz: 0, gravity: WORLD.projectile.sourceThrow.gravity });
          this.fireWeapon(combat.weapon, weapon.interval); this.finishThrow(weapon.interval);
          const sequence = this.recordProjectileShot({ x: player.x, y: player.y, endX: pending.endpoint.x, endY: pending.endpoint.y, z: player.z, life: pending.lifeRemaining, vx: pending.state.vx, vy: pending.state.vy, weapon: combat.weapon, projectile: true });
          pending.setShotSequence(sequence);
          context.emit({ type: 'shot', actor: this.id, weapon: combat.weapon, x: player.x, y: player.y, z: player.z });
        }
      } else if (!fireDown && combat.throwing) this.cancelThrow();
      this.rememberCombatInput(input.keys); return;
    }
    if (fireDown && ammo() > 0) this.beginAttack(); else this.endAttack();
    if (!fireDown || combat.respawn || combat.cooldown || !ammo()) { this.rememberCombatInput(input.keys); return; }
    if (weapon.vehicleOnly && player.vehicleId === undefined) { this.endAttack(); this.rememberCombatInput(input.keys); return; }
    if (weapon.kind === 'slick' || weapon.kind === 'mine') {
      this.endAttack();
      let vehicle: ReturnType<typeof this.gameState.findVehicle>;
      if (player.vehicleId !== undefined) vehicle = this.gameState.findVehicle(player.vehicleId);
      if (vehicle?.deployHazard(this, combat.weapon, context.combat)) {
        this.fireWeapon(combat.weapon, weapon.interval);
        this.recordShot({ x: player.x, y: player.y, endX: player.x, endY: player.y, z: player.z, life: 4, weapon: combat.weapon, projectile: false });
        context.emit({ type: 'shot', actor: this.id, weapon: combat.weapon, x: player.x, y: player.y, z: player.z });
      }
      this.rememberCombatInput(input.keys); return;
    }
    if (weapon.sourceType === 15 || weapon.sourceType === 23) {
      let vehicle: ReturnType<typeof this.gameState.findVehicle>;
      if (player.vehicleId !== undefined) vehicle = this.gameState.findVehicle(player.vehicleId);
      let fired = false;
      if (vehicle) fired = vehicle.fireCarBomb(this, weapon.sourceType === 23, context.combat);
      if (fired) {
        this.fireWeapon(combat.weapon, weapon.interval);
        this.recordShot({ x: player.x, y: player.y, endX: player.x, endY: player.y, z: player.z, life: 4, weapon: combat.weapon, projectile: true, impact: true });
        context.emit({ type: 'shot', actor: this.id, weapon: combat.weapon, x: player.x, y: player.y, z: player.z });
      }
      this.rememberCombatInput(input.keys); return;
    }
    const origins: { x: number; y: number; angle: number }[] = [];
    if (weapon.vehicleOnly && player.vehicleId !== undefined) {
      const vehicle = this.gameState.findVehicle(player.vehicleId);
      if (vehicle) origins.push(...vehicle.weaponOrigins(weapon.sourceType, this.id));
    }
    if (weapon.vehicleOnly && !origins.length) {
      this.endAttack();
      this.rememberCombatInput(input.keys);
      return;
    }
    if (!origins.length) {
      // Keep one shared on-foot fire point for every gun. Vehicle weapons
      // use their authored weaponOrigins above; throwable launch points stay
      // at the ped centre in their separate release path.
      const direction = directionFromRotation(player.rotation);
      // With the runtime heading convention, (cos(rotation), sin(rotation))
      // is the player's right-hand side of the facing vector.
      const right = { x: Math.cos(player.rotation), y: Math.sin(player.rotation) };
      const x = player.x + direction.x * GTA2_PLAYER_FIRE_POINT_FORWARD + right.x * GTA2_PLAYER_FIRE_POINT_RIGHT;
      const y = player.y + direction.y * GTA2_PLAYER_FIRE_POINT_FORWARD + right.y * GTA2_PLAYER_FIRE_POINT_RIGHT;
      origins.push({ x, y, angle: player.rotation });
    }
    const rays: WeaponRay[] = [];
    const projectiles: ProjectileObject[] = [];
    const spawned = origins.reduce((count, origin) => count + weapon.spread.reduce((inner, spread) => {
      const angle = origin.angle + sourceWeaponAngleToRadians(spread);
      let spawnedForSpread = 0;
      let traced: readonly WeaponRay[];
      if (weapon.kind === 'stun') traced = context.traceShockerWeapon(player, origin.x, origin.y, angle, input.clientTick ?? 'latest');
      else traced = [context.traceWeaponRay(player, combat.weapon, origin.x, origin.y, angle, input.clientTick ?? 'latest')];
      for (const ray of traced) {
        rays.push(ray);
        if (weapon.kind === 'stun') {
          this.applyWeaponRayDamage(combat.weapon, ray, context.combat);
          continue;
        }
        const explosive = weapon.kind === 'rocket' || weapon.sourceType === 15;
        // Bullets resolve their authored hit in the firing dispatch. The
        // moving object remains a tracer for misses and for visual parity.
        const immediate = weapon.kind === 'bullet' && ray.targets.length > 0;
        if (immediate) this.applyWeaponRayDamage(combat.weapon, ray, context.combat);
        if (weapon.sourceType === 23) continue;
        const projectile = context.spawnWeaponVisual(player, combat.weapon, ray.startX, ray.startY, player.z, ray.rotation, ray.distance, explosive, !immediate);
        projectiles.push(projectile); spawnedForSpread++;
      }
      return inner + spawnedForSpread;
    }, 0), 0);
    const first = rays[0], firstOrigin = origins[0];
    if (weapon.sourceType === 23 && firstOrigin) this.detonateAt(firstOrigin.x, firstOrigin.y, player.z, combat.weapon, context.combat);
    let fired = spawned > 0;
    if (weapon.sourceType === 23) fired = origins.length > 0;
    else if (weapon.sourceType === 3) fired = rays.length > 0;
    if (fired) this.fireWeapon(combat.weapon, weapon.interval);
    if (fired) {
      // rocket_5E3850 reports the crime at launch, before the moving object
      // reaches a wall or target. Keep silenced weapons quiet and leave the
      // NPC-specific threat path untouched.
      if ((weapon.kind === 'rocket' || weapon.kind === 'stun') && !weapon.silent && context.combat.authoritative) context.combat.raiseWanted(this);
      // The compact player snapshot is also the client projectile stream. It
      // must live for the authored flight time, otherwise a remote client
      // renders a shot for four ticks and then drops it before it reaches the
      // endpoint. Use the actual first object lifetime so wall/target range
      // and weapon speed remain in sync with the authoritative projectile.
      let shotLife = Math.max(1, projectiles[0]?.lifeRemaining ?? projectileTravelTicks(combat.weapon));
      if (weapon.sourceType === 3) shotLife = 4;
      if (weapon.kind === 'stun') {
        for (const ray of rays) {
          this.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: player.z, life: 4, weapon: combat.weapon, projectile: true, impact: true, beam: true });
        }
      } else if (projectiles.length) {
        for (const projectile of projectiles) {
          const state = projectile.state;
          const sequence = this.recordProjectileShot({ x: state.x, y: state.y, endX: state.endX, endY: state.endY, z: state.z, life: projectile.lifeRemaining, vx: state.vx, vy: state.vy, weapon: combat.weapon, projectile: true });
          projectile.setShotSequence(sequence);
        }
      } else {
        this.recordShot({ x: firstOrigin?.x ?? player.x, y: firstOrigin?.y ?? player.y, endX: first?.endX ?? player.x, endY: first?.endY ?? player.y, z: player.z, life: shotLife, weapon: combat.weapon, projectile: true });
      }
      context.emit({ type: 'shot', actor: this.id, weapon: combat.weapon, x: firstOrigin?.x ?? player.x, y: firstOrigin?.y ?? player.y, z: player.z });
    }
    this.rememberCombatInput(input.keys);
  }

  private applyWeaponRayDamage(weaponId: number, ray: WeaponRay, combat: GameObjectCombatContext) {
    const weapon = combat.weaponSystem.get(weaponId);
    const target = ray.targets[0];
    if (!combat.authoritative || !target) return;
    const impactState: ProjectileStateInput = {
      actor: this.id, weapon: weaponId, x: ray.startX, y: ray.startY,
      endX: ray.endX, endY: ray.endY, z: this.mutableState.z, life: 1,
      rotation: ray.rotation,
      impact: true, impactTarget: { kind: target.kind, id: target.state.id },
      projectileType: 'shock', beam: weapon.kind === 'stun',
    };
    if (typeof weapon.sourceModel === 'number') impactState.sourceModel = weapon.sourceModel;
    const impact = new HitscanImpactObject(`${this.id}:hitscan:${combat.nextEventId()}`, impactState);
    this.spawn(impact);
    impact.resolveHitscan(combat);
    impact.deferDespawn();
  }

  private detonateGrenade(weaponId: number, combat: GameObjectCombatContext) {
    this.detonateAt(this.mutableState.x, this.mutableState.y, this.mutableState.z, weaponId, combat);
  }

  private detonateAt(x: number, y: number, z: number, weaponId: number, combat: GameObjectCombatContext) {
    const grenade = new GrenadeObject(`${this.id}:grenade:${combat.nextEventId()}`, {
      actor: this.id, weapon: weaponId, x, y,
      endX: x, endY: y, z,
      life: 0, impact: true, explosive: true, selfDamage: true, projectileType: 'grenade',
    });
    this.spawn(grenade);
    grenade.detonate(combat);
    grenade.deferDespawn();
  }

  beginAttack() { this.mutableState.combat.attacking = true; }

  endAttack() { this.mutableState.combat.attacking = false; }

  startWeaponCooldown(ticks: number) { this.mutableState.combat.cooldown = Math.max(0, Math.floor(ticks)); }

  recordShot(shot: CombatShot & { projectile: true }): number;
  recordShot(shot: CombatShot): number | undefined;
  recordShot(shot: CombatShot) {
    const combat = this.mutableState.combat;
    if (!shot.projectile) return undefined;
    const sequence = ++this.shotSequence;
    const projectile = { ...shot, sequence };
    combat.shots = [...combat.shots, projectile].slice(-64);
    return sequence;
  }

  recordProjectileShot(shot: CombatShot & { projectile: true }) {
    return this.recordShot(shot);
  }

  /** Stop one owner-local replicated projectile at its authoritative impact. */
  markShotImpact(sequence: number) {
    const shot = this.mutableState.combat.shots.find(item => item.sequence === sequence);
    if (!shot) return;
    shot.impact = true;
    shot.life = Math.min(shot.life, 1);
  }

  rememberCombatInput(keys: number) { this.mutableState.combat.previousKeys = keys; }

  beginThrow() {
    const combat = this.mutableState.combat;
    if (combat.respawn > 0 || combat.cooldown > 0 || this.ammoFor() <= 0) return false;
    if (!combat.throwing) {
      combat.throwing = true;
      combat.throwAnimation = 0;
      combat.throwCharge = 0;
    }
    return true;
  }

  chargeThrow(maximum = 96) {
    const combat = this.mutableState.combat;
    combat.throwCharge = Math.min(maximum, combat.throwCharge + 1);
    return combat.throwCharge;
  }

  finishThrow(cooldown: number, animation = 25) {
    const combat = this.mutableState.combat;
    combat.throwing = false;
    combat.throwCharge = 0;
    combat.throwAnimation = animation;
    combat.cooldown = Math.max(0, Math.floor(cooldown));
  }

  cancelThrow(animation = 25) {
    const combat = this.mutableState.combat;
    combat.throwing = false;
    combat.throwCharge = 0;
    combat.throwAnimation = animation;
  }

  resetCombatInput(keys: number) {
    const combat = this.mutableState.combat;
    combat.throwing = false;
    combat.throwCharge = 0;
    combat.throwAnimation = 0;
    combat.attacking = false;
    combat.previousKeys = keys;
  }

  enterVehicle(vehicleId: number, animation: PlayerState['animation'] = undefined) {
    this.mutableState.vehicleId = vehicleId;
    this.mutableState.animation = animation;
  }

  /** Reconcile the vehicle-owned occupancy link from an authoritative snapshot. */
  syncVehicleOccupancy(vehicleId: number, animation: PlayerState['animation']) {
    this.mutableState.vehicleId = vehicleId;
    this.mutableState.animation = animation;
  }

  /** Clear a stale vehicle link when the vehicle no longer lists this player. */
  clearVehicleOccupancy() {
    this.mutableState.vehicleId = undefined;
    this.mutableState.animation = undefined;
  }

  followVehicle(pose: MobilePose) { this.setPose(pose); }

  /** Reset movement-owned state when the player respawns. */
  resetMotion() {
    this.setVelocity(0, 0);
    this.mutableState.jump = undefined;
    this.stopMovement();
  }

  /** Apply a vehicle impact through the player's own damage action. The
   * collision router supplies only the measured impact and driver identity. */
  receiveVehicleImpact(impact: number, driverId: string | undefined, combat: PlayerDamageContext, options: { lethal: boolean; rotation?: number }) {
    const playerCombat = this.mutableState.combat;
    if (this.mutableState.vehicleId !== undefined || playerCombat.respawn > 0 || playerCombat.health <= 0) return false;
    if (impact < WORLD.vehicle.pedestrianImpact.contactTrigger) return false;
    const sourceImpact = sourcePedestrianImpact(impact);
    const lethal = options.lethal;
    const damage = lethal ? Math.max(100, playerCombat.health + this.mutableState.armor) : Math.max(1, Math.round((sourceImpact - WORLD.vehicle.pedestrianImpact.minimum) * .2));
    combat.damagePlayer(this, damage, driverId);
    combat.spawnEffect({
      x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, life: lethal ? 20 : 12,
      kind: lethal ? 'blood' : 'impact', owner: driverId, rotation: options.rotation, scale: lethal ? 1.1 : .8,
      variant: lethal ? 1 : 0,
    });
    combat.emit({ type: 'hit', actor: driverId, target: this.id, damage, lethal, x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z });
    return true;
  }

  leaveVehicle(pose: MobilePose, velocity: { vx: number; vy: number }) {
    this.mutableState.vehicleId = undefined;
    this.mutableState.animation = undefined;
    this.setPose({ ...pose, vx: velocity.vx, vy: velocity.vy });
    this.stopMovement();
  }

  /** Apply a pickup's gameplay effect through the player boundary. Pickup
   * objects never write combat state directly. */
  collectPickup(weapon: number, ammo: number) {
    const combat = this.mutableState.combat;
    if (!Number.isFinite(weapon) || weapon < 0 || weapon >= combat.ammo.length) return false;
    const currentAmmo = combat.ammo[weapon];
    if (currentAmmo === undefined) return false;
    combat.ammo[weapon] = currentAmmo + Math.max(0, Math.floor(ammo));
    combat.weapon = weapon;
    return true;
  }

  stopMovement() {
    if (this.mutableState.movement) {
      this.mutableState.movement.speed = 0;
      this.mutableState.movement.turnSpeed = 0;
      this.mutableState.movement.moveDirection = 0;
    }
  }

  /** Source-style jump state belongs to the player object; GameWorld only
   * decides when the world permits the transition. */
  beginJump(input: Input, floor: number) {
    const player = this.mutableState;
    if (player.jump || player.vehicleId !== undefined || player.combat.respawn > 0 || player.combat.health <= 0) return false;
    let x = 0, y = 0;
    if (input.moveX !== undefined && input.moveY !== undefined && Math.hypot(input.moveX, input.moveY) > 1e-6) {
      const length = Math.hypot(input.moveX, input.moveY); x = input.moveX / length; y = input.moveY / length;
    } else {
      const direction = directionFromRotation(player.rotation), reverse = Boolean(input.keys & 2) && !(input.keys & 1);
      let directionScale = 1;
      if (reverse) directionScale = -1;
      x = direction.x * directionScale; y = direction.y * directionScale;
      const existingSpeed = Math.hypot(player.vx, player.vy);
      if (existingSpeed > 1e-6) { x = player.vx / existingSpeed; y = player.vy / existingSpeed; }
    }
    const speed = Math.max(WORLD.player.jumpSpeed, Math.hypot(player.vx, player.vy));
    player.jump = { phase: 'rising', progress: 0, height: 0, baseZ: Math.max(floor + 1, player.z), vx: x * speed, vy: y * speed, vehicleCollision: false };
    player.z = player.jump.baseZ; player.vx = player.jump.vx; player.vy = player.jump.vy;
    if (x || y) player.rotation = rotationFromDirection(x, y, player.rotation);
    return true;
  }

  updateJump(dt: number) {
    const player = this.mutableState, jump = player.jump;
    if (!jump) return false;
    if (player.vehicleId !== undefined) { player.jump = undefined; return true; }
    jump.progress = Math.min(1, jump.progress + dt / WORLD.player.jumpDuration);
    if (jump.progress >= 1) { player.z = jump.baseZ; player.vx = jump.vx; player.vy = jump.vy; player.jump = undefined; return true; }
    if (jump.progress < .35) jump.phase = 'rising';
    else if (jump.progress > .65) jump.phase = 'falling';
    else jump.phase = 'apex';
    jump.height = Math.sin(Math.PI * jump.progress) * WORLD.player.jumpHeight;
    player.z = jump.baseZ; player.vx = jump.vx; player.vy = jump.vy;
    return true;
  }

  takeDamage(damage: number) {
    const combat = this.mutableState.combat;
    const armor = Math.min(this.mutableState.armor, Math.ceil(damage * .5));
    this.mutableState.armor = Math.max(0, this.mutableState.armor - armor);
    combat.health = Math.max(0, combat.health - damage + armor);
    return combat.health <= 0;
  }

  raiseWanted(amount = 1) {
    this.mutableState.wanted = Math.min(5, this.mutableState.wanted + Math.max(0, amount));
    return this.mutableState.wanted;
  }

  decayWanted() { this.mutableState.wanted = Math.max(0, this.mutableState.wanted - 1); }

  awardKill(score = 100, money = 100) {
    this.mutableState.kills += 1;
    this.mutableState.score += score;
    this.mutableState.money += money;
  }

  shock(amount: number) {
    const combat = this.mutableState.combat;
    combat.shockCounter = Math.min(WORLD.combat.electrocutionThreshold, combat.shockCounter + amount);
    combat.attacking = false;
    if (combat.shockCounter >= WORLD.combat.electrocutionThreshold) {
      combat.electrocuted = true;
      this.mutableState.vx = 0; this.mutableState.vy = 0;
      if (this.mutableState.movement) this.mutableState.movement.speed = 0;
    }
  }

  /** Source Ped::SetOnFire, including the attached model-197 flame object. */
  setOnFire(combat?: Pick<GameObjectCombatContext, 'authoritative' | 'nextHazardId'>) {
    const state = this.mutableState, playerCombat = state.combat;
    if (playerCombat.health <= 0 || playerCombat.onFire) return false;
    playerCombat.onFire = true;
    playerCombat.fireTimer = 0;
    if (combat?.authoritative) {
      this.spawn(createHazardObject({
        id: combat.nextHazardId(), x: state.x, y: state.y, z: state.z,
        kind: 'fire', life: 2, owner: `player:${this.id}`, effect: 'fire', sourceModel: GTA2_SOURCE_OBJECT_MODELS.pedFire,
      }));
    }
    return true;
  }

  putOutFire() {
    const combat = this.mutableState.combat;
    combat.onFire = false;
    combat.fireTimer = 0;
  }

  /** Source Char_B4::DrownPed_5459E0 enters sinking_20 first.  Keep the
   * countdown in the replicated player state so a driver and every client
   * observe the same ten-tick transition before Player::Kill. */
  private beginDrowning(spawnEffect?: Pick<GameObjectCombatContext, 'spawnEffect'>) {
    const state = this.mutableState;
    if (state.combat.health <= 0 || state.drowningTimer !== undefined) return false;
    state.drowningTimer = WORLD.player.waterDeathTicks;
    this.putOutFire();
    state.combat.attacking = false;
    state.combat.throwing = false;
    state.combat.throwCharge = 0;
    state.combat.throwAnimation = 0;
    state.combat.fireAnimation = 0;
    state.vx = 0;
    state.vy = 0;
    state.jump = undefined;
    state.verticalVelocity = 0;
    if (state.movement) {
      state.movement.speed = 0;
      state.movement.turnSpeed = 0;
      state.movement.moveDirection = 0;
    }
    spawnEffect?.spawnEffect({
      x: state.x, y: state.y, z: state.z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS,
      owner: `player:${this.id}`, rotation: state.rotation, scale: .9,
    });
    return true;
  }

  private tickDrowning(combatContext: Pick<GameObjectCombatContext, 'damagePlayer' | 'isWaterAt' | 'spawnEffect'>) {
    const state = this.mutableState;
    if (state.drowningTimer !== undefined) {
      state.drowningTimer = Math.max(0, state.drowningTimer - 1);
      if (state.drowningTimer === 0) {
        state.drowningTimer = undefined;
        // Bypass armor and route through the world kill operation so a
        // drowning driver is detached from its vehicle before respawning.
        combatContext.damagePlayer(this, state.combat.health + state.armor + 1);
      }
      return true;
    }
    if (combatContext.isWaterAt({ x: state.x, y: state.y, z: state.z })) {
      this.beginDrowning(combatContext);
      return true;
    }
    return false;
  }

  kill() {
    const state = this.mutableState, combat = state.combat;
    if (combat.respawn > 0) return false;
    state.drowningTimer = undefined;
    combat.health = 0;
    combat.respawn = WORLD.player.deathCountdown;
    state.vx = 0; state.vy = 0; state.jump = undefined;
    if (state.movement) { state.movement.speed = 0; state.movement.turnSpeed = 0; state.movement.moveDirection = 0; }
    state.deaths += 1;
    return true;
  }

  tickStatus(combatContext: Pick<GameObjectCombatContext, 'authoritative' | 'isWaterAt' | 'damagePlayer' | 'spawnEffect'>) {
    const combat = this.mutableState.combat;
    if (combat.shockCounter > 0) {
      combat.shockCounter = Math.max(0, combat.shockCounter - 1);
      if (combat.shockCounter === 0) combat.electrocuted = false;
    }
    if (!combatContext.authoritative || combat.health <= 0) return;
    if (this.tickDrowning(combatContext)) return;
    if (!combat.onFire) return;
    if (this.mutableState.vehicleId !== undefined || combatContext.isWaterAt({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z })) {
      this.putOutFire();
      return;
    }
    combat.fireTimer += 1;
    combatContext.damagePlayer(this, 1, this.id);
    if (combat.health <= 0) this.putOutFire();
  }
  override getCollider() {
    const collider = super.getCollider();
    const first = collider[0];
    if (!first) return [];
    const shouldIgnoreVehicles = (this.mutableState.vehicleId !== undefined && this.mutableState.animation === undefined) || (this.mutableState.jump && !this.mutableState.jump.vehicleCollision);
    if (shouldIgnoreVehicles) return [{ ...first, mask: first.mask & ~COLLISION_CATEGORY.vehicle }];
    return collider;
  }

  override getSprite(_now: number): GameObjectSprite {
    const combat = this.mutableState.combat;
    const placement: GameObjectPlacement = { ...this.placement, rotation: this.mutableState.rotation - Math.PI };
    const source = (animation: Parameters<typeof sourceAnimationDefinition>[0]) => sourceAnimationDefinition(animation);
    const base = (animation: Parameters<typeof sourceAnimationDefinition>[0], extra: Partial<GameObjectSprite> = {}): GameObjectSprite => {
      const definition = source(animation);
      const sprite: GameObjectSprite = { atlas: 'player', definition: { bank: 'ped', sourceId: 0 }, animation, frameTicks: definition.frameTicks, loop: definition.loop, placement, opacity: 1, depthTest: true, depthWrite: false, alphaTest: .01, shadow: { opacity: .3, scale: .55, offsetY: 4 }, ...extra };
      if (definition.frameTicksByFrame) return { ...sprite, frameTicksByFrame: definition.frameTicksByFrame };
      return sprite;
    };
    if (combat.respawn > 0) {
      const elapsed = Math.max(0, WORLD.player.deathCountdown - combat.respawn);
      if (elapsed < 34) return base('falling', { frame: Math.min(16, Math.floor(elapsed / 2)), animationKey: 'player-death-fall', depthOffset: 0 });
      return base('dead', { animationKey: 'player-dead' });
    }
    if (this.mutableState.drowningTimer !== undefined) {
      const scale = Math.max(.2, this.mutableState.drowningTimer / WORLD.player.waterDeathTicks);
      return base('idle', {
        frame: 0,
        scale,
        opacity: this.mutableState.vehicleId === undefined ? 1 : 0,
        animationKey: 'player-drowning',
      });
    }
    if (this.mutableState.animation?.kind === 'entering') {
      const progress = this.mutableState.animation.progress;
      let animation: 'walking' | 'entering' = 'entering';
      if (this.mutableState.animation.straightEntry) animation = 'walking';
      return base(animation, { frame: sourceAnimationPosition(animation, progress), animationKey: 'player-entering' });
    }
    if (this.mutableState.animation?.kind === 'exiting') {
      const progress = this.mutableState.animation.progress;
      let animation: 'walking' | 'exiting' = 'exiting';
      if (this.mutableState.animation.straightEntry) animation = 'walking';
      return base(animation, { frame: sourceAnimationPosition(animation, progress), animationKey: 'player-exiting', depthOffset: WORLD.render.vehicleOccupantDepthOffset });
    }
    if (this.mutableState.animation?.kind === 'seated') return base('idle', { opacity: 0, animationKey: 'player-seated' });
    const speed = Math.hypot(this.mutableState.vx, this.mutableState.vy), weapon = combat.weapon, jumping = this.mutableState.jump;
    if (combat.electrocuted) return base('electrocuted', { animationKey: 'player-electrocuted' });
    if (jumping) return base('jumping', { frame: sourceAnimationPosition('jumping', jumping.progress), animationKey: 'player-jump', depthOffset: jumping.height });
    const throwable = weapon === 4 || weapon === 8, throwRemaining = combat.throwAnimation;
    if (throwable && (combat.throwing || throwRemaining > 0)) {
      let animation: 'throwing' | 'throwingIdle' = 'throwingIdle';
      if (speed > 0.05) animation = 'throwing';
      let progress = Math.max(0, Math.min(1, (25 - throwRemaining) / 24));
      if (combat.throwing) progress = (combat.throwCharge / 3 % 8) / 8;
      return base(animation, { frame: sourceAnimationPosition(animation, progress), animationKey: 'player-throw' });
    }
    // The source firing pose follows a successful emission. It must not be
    // gated by cooldown: firing starts the cooldown, so that gate hid every
    // real shot. Failed trigger attempts leave fireAnimation at zero.
    if (combat.fireAnimation > 0 && !throwable) return base('firing', { animationKey: 'player-fire' });
    if (speed > WORLD.player.runAnimationThreshold) return base('armedRunning', { animationKey: 'player-movement' });
    if (speed > 0.05) return base('armedWalking', { animationKey: 'player-movement' });
    return base('idle', { animationKey: 'player-idle' });
  }
}
