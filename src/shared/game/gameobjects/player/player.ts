import type { CombatShot, CombatState, Input, PlayerControl, PlayerState, WorldEventInput } from '../../../protocol/types';
import { type GameObjectCombatContext, type GameObjectPlacement, type GameObjectSprite, type PlayerDamageContext } from '../gameobject';
import { StatefulGameObject, type GameObjectUpdateHandler, type MobilePose } from '../stateful';
import { COLLISION_CATEGORY } from '../../../domain/physics/collision-rules';
import { WORLD } from '../../../domain/world/world';
import { playerSprite } from './player-sprite';
import { applyPlayerMovement, beginPlayerJump, enterPlayerVehicle, leavePlayerVehicle, resetPlayerMotion, stopPlayerMovement, updatePlayerJump } from './player-motion';
import { tickPlayerStatus } from './player-status';
import { updatePlayerCombat } from './player-combat';
import { directionFromRotation } from '../../../domain/physics/motion-vector';
import type { HistoryTick } from '../../../domain/combat/lag-compensation';
import type { WeaponRay, WeaponRayActor } from '../../../domain/combat/weapon-raycaster';
import type { WeaponSystem } from '../../../domain/combat/weapon-system';
import type { ProjectileSpawnResult } from '../../runtime/projectile-controller';
import { ProjectileObject } from '../../effects/projectile';
import * as playerActions from './player-actions';
import { applyPlayerControls } from './player-controls';
import { syncPlayerShots } from './player-shots';

export interface PlayerCombatContext {
  readonly input: Input;
  readonly weaponSystem: Pick<WeaponSystem, 'get'>;
  readonly traceWeaponRay: (actor: WeaponRayActor, weaponId: number, originX: number, originY: number, angle: number, clientTick: HistoryTick) => WeaponRay;
  readonly traceShockerWeapon: (actor: WeaponRayActor, originX: number, originY: number, angle: number, clientTick: HistoryTick) => WeaponRay[];
  readonly spawnWeaponVisual: (actor: WeaponRayActor, weaponId: number, originX: number, originY: number, z: number, angle: number, distance: number, explosive?: boolean, collision?: boolean, sourceModelOverride?: number) => ProjectileSpawnResult;
  readonly combat: GameObjectCombatContext;
  readonly emit: (event: WorldEventInput) => void;
}

export class PlayerObject extends StatefulGameObject<PlayerState, string> {
  private heldControlMask = 0;
  private shotSequence = 0;
  private replicatedShots = new Map<string, ProjectileObject>();
  constructor(state: PlayerState, update?: GameObjectUpdateHandler<PlayerState>) {
    super(state.id, state, 'player', update);
    this.collision = { shape: { type: 'circle', radius: WORLD.player.radius }, restitution: 0, friction: .15 };
  }
  /** Mutable state port used by focused player behavior modules. */
  get mutablePlayerState() { return this.mutableState; }
  get heldControlState() { return this.heldControlMask; }
  set heldControlState(value: number) { this.heldControlMask = value; }
  get replicatedShotState() { return this.replicatedShots; }
  get worldState() { return this.gameState; }
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
    return applyPlayerMovement(this, input, floor, dt, slippery);
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
    syncPlayerShots(this);
  }

  override despawn() {
    for (const projectile of this.replicatedShots.values()) projectile.despawn();
    this.replicatedShots.clear();
    super.despawn();
  }

  /** Apply explicit start/end controls and retain the resulting held state for
   * continuous movement and firing between network packets. */
  applyControls(controls: readonly PlayerControl[]) {
    return applyPlayerControls(this, controls);
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
  fireWeapon(weapon: number, cooldown: number, consumesAmmo = true) {
    if (consumesAmmo && !this.consumeAmmo(weapon)) return false;
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
    return updatePlayerCombat(this, context);
  }

  /** Compatibility copy retained until the extracted combat path is fully fixture-parity checked. */

  beginAttack() { playerActions.beginAttack(this); }

  endAttack() { playerActions.endAttack(this); }

  startWeaponCooldown(ticks: number) { playerActions.startWeaponCooldown(this, ticks); }

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

  rememberCombatInput(keys: number) { playerActions.rememberCombatInput(this, keys); }

  beginThrow() { return playerActions.beginThrow(this); }

  chargeThrow(maximum = 96) { return playerActions.chargeThrow(this, maximum); }

  finishThrow(cooldown: number, animation = 25) { playerActions.finishThrow(this, cooldown, animation); }

  cancelThrow(animation = 25) { playerActions.cancelThrow(this, animation); }

  resetCombatInput(keys: number) { playerActions.resetCombatInput(this, keys); }

  enterVehicle(vehicleId: number, animation: PlayerState['animation'] = undefined) {
    enterPlayerVehicle(this, vehicleId, animation);
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
    resetPlayerMotion(this);
  }

  receiveVehicleImpact(impact: number, driverId: string | undefined, combat: PlayerDamageContext, options: { lethal: boolean; rotation?: number }) {
    return playerActions.receiveVehicleImpact(this, impact, driverId, combat, options);
  }
  leaveVehicle(pose: MobilePose, velocity: { vx: number; vy: number }) { leavePlayerVehicle(this, pose, velocity); }
  collectPickup(weapon: number, ammo: number) { return playerActions.collectPickup(this, weapon, ammo); }
  stopMovement() { stopPlayerMovement(this); }
  beginJump(input: Input, floor: number) { return beginPlayerJump(this, input, floor); }
  updateJump(dt: number) { return updatePlayerJump(this, dt); }
  takeDamage(damage: number, killer?: string, cause: PlayerState['deathCause'] = 'weapon') { return playerActions.takeDamage(this, damage, killer, cause); }
  applyExplosionImpulse(x: number, y: number) {
    this.mutableState.vx += x;
    this.mutableState.vy += y;
    if (this.mutableState.movement) this.mutableState.movement.speed = Math.hypot(this.mutableState.vx, this.mutableState.vy);
  }
  raiseWanted(amount = 1) { this.mutableState.wanted = Math.min(5, this.mutableState.wanted + Math.max(0, amount)); return this.mutableState.wanted; }
  decayWanted() { this.mutableState.wanted = Math.max(0, this.mutableState.wanted - 1); }
  awardKill(score = 100, money = 100) { this.mutableState.kills += 1; this.mutableState.score += score; this.mutableState.money += money; }
  shock(amount: number) {
    const combat = this.mutableState.combat;
    combat.shockCounter = Math.min(WORLD.combat.electrocutionThreshold, combat.shockCounter + amount); combat.attacking = false;
    if (combat.shockCounter >= WORLD.combat.electrocutionThreshold) { combat.electrocuted = true; this.mutableState.vx = 0; this.mutableState.vy = 0; if (this.mutableState.movement) this.mutableState.movement.speed = 0; }
  }
  setOnFire(combat?: Pick<GameObjectCombatContext, 'authoritative' | 'nextHazardId'>) { return playerActions.setOnFire(this, combat); }
  putOutFire() { playerActions.putOutFire(this); }
  kill() { return playerActions.kill(this); }

  tickStatus(combatContext: Pick<GameObjectCombatContext, 'authoritative' | 'isWaterAt' | 'damagePlayer' | 'spawnEffect'>) {
    return tickPlayerStatus(this, combatContext);
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
    return playerSprite(this.mutableState, this.placement);
  }
}
