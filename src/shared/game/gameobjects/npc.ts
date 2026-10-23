import type { CombatShot, NpcState } from '../../protocol/types';
import type { PhysicsBody } from '../../engine/physics-world';
import { type GameObjectCombatContext, type GameObjectPlacement, type GameObjectSprite, type PhysicsReadOptions } from './gameobject';
import { MobileGameObject, type GameObjectUpdateHandler, type MobilePose } from './stateful';
import { COLLISION_CATEGORY } from '../../domain/physics/collision-rules';
import { PED_DEATH_ANIMATION_TICKS, sourceAnimationDefinition, sourceAnimationFrame, sourceAnimationPosition } from '../../domain/animation';
import { GTA2_SOURCE_OBJECT_MODELS, GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../domain/world/gta2-sprites';
import { WORLD } from '../../domain/world/world';
import { createHazardObject } from '../effects/hazard';
import { createProjectileObject, projectileStateFromShot, ProjectileObject } from '../effects/projectile';
import { directionFromRotation, rotationFromDirection } from '../../domain/physics/motion-vector';

export class NpcObject extends MobileGameObject<NpcState, number> {
  private shotSequence = 0;
  private replicatedShots = new Map<string, ProjectileObject>();
  constructor(state: NpcState, update?: GameObjectUpdateHandler<NpcState>) {
    super(state.id, state, 'npc', update);
    // Pedestrians remain queryable for gameplay, but their entity collider is
    // a sensor: the player and other pedestrians can pass through them. Their
    // separate map-physics body still keeps their movement on the map surface.
    this.collision = { shape: { type: 'circle', radius: 12 }, solid: false, restitution: 0, friction: .15 };
  }

  /** Mutable action port for the NPC weapon runtime. The public state getter
   * remains read-only to systems that only observe replicated ped state. */
  get mutableNpcState() { return this.mutableState; }

  recordShot(shot: CombatShot & { projectile: true }): number;
  recordShot(shot: CombatShot): number | undefined;
  recordShot(shot: CombatShot) {
    if (!shot.projectile) return undefined;
    const sequence = ++this.shotSequence;
    this.mutableState.shots = [...this.mutableState.shots, { ...shot, sequence }].slice(-64);
    return sequence;
  }

  recordProjectileShot(shot: CombatShot & { projectile: true }) {
    return this.recordShot(shot);
  }

  markShotImpact(sequence: number) {
    const shot = this.mutableState.shots.find(item => item.sequence === sequence);
    if (!shot) return;
    shot.impact = true;
    shot.life = Math.min(shot.life, 1);
  }

  syncReplicatedShot() {
    const incoming = this.mutableState.shots;
    const desired = new Set<string>();
    for (const shot of incoming) {
      if (!shot.projectile || (shot.impact && !shot.beam)) continue;
      let identity = `${shot.weapon}:${shot.x}:${shot.y}:${shot.endX}:${shot.endY}`;
      if (shot.sequence !== undefined) identity = `${shot.sequence}`;
      const key = `npc:${this.id}:shot:${identity}`;
      desired.add(key);
      const existing = this.replicatedShots.get(key);
      if (existing) existing.syncReplicatedShot(shot);
      else this.replicatedShots.set(key, this.spawn(createProjectileObject(key, projectileStateFromShot(`npc:${this.id}`, shot))));
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
  override get collisionEnabled() {
    return this.mutableState.health > 0 && this.mutableState.drowningTimer === undefined && this.mutableState.vehicleId === undefined;
  }

  setBehavior(state: NpcState['state'], animation: NpcState['animation']) {
    this.mutableState.state = state; this.mutableState.animation = animation;
  }

  transitionAnimation(animation: NpcState['animation'], progress?: number, straightEntry?: boolean) {
    this.mutableState.animation = animation;
    this.mutableState.animationProgress = progress;
    this.mutableState.animationStraightEntry = straightEntry;
  }

  enterVehicle(vehicleId: number, progress?: number, straightEntry?: boolean) {
    this.mutableState.vehicleId = vehicleId;
    this.transitionAnimation('entering', progress, straightEntry);
    this.mutableState.state = 'entering';
  }

  /** Reconcile the vehicle-owned occupancy link from an authoritative snapshot. */
  syncVehicleOccupancy(vehicleId: number, animation: NpcState['animation'], progress?: number, straightEntry?: boolean, behavior: NpcState['state'] = 'entering') {
    this.mutableState.vehicleId = vehicleId;
    this.mutableState.state = behavior;
    this.transitionAnimation(animation, progress, straightEntry);
  }

  /** Clear a stale vehicle link when the vehicle no longer lists this NPC. */
  clearVehicleOccupancy() {
    this.mutableState.vehicleId = undefined;
    this.mutableState.animationProgress = undefined;
    this.mutableState.animationStraightEntry = undefined;
  }

  /** Source DoJump for a dummy pedestrian. The horizontal carry is kept in the
   * replicated jump state so a remote client renders the same fixed-step arc. */
  beginJump(floor: number, vx: number, vy: number) {
    const npc = this.mutableState;
    if (npc.jump || npc.vehicleId !== undefined || npc.health <= 0) return false;
    const speed = Math.max(WORLD.player.jumpSpeed, Math.hypot(vx, vy));
    let x = vx, y = vy;
    if (Math.hypot(x, y) <= 1e-6) {
      const direction = directionFromRotation(npc.rotation); x = direction.x * speed; y = direction.y * speed;
    } else {
      const length = Math.hypot(x, y); x = x / length * speed; y = y / length * speed;
    }
    npc.jump = { phase: 'rising', progress: 0, height: 0, baseZ: Math.max(floor, npc.z), vx: x, vy: y, vehicleCollision: false };
    npc.z = npc.jump.baseZ; npc.vx = x; npc.vy = y; npc.rotation = rotationFromDirection(x, y, npc.rotation);
    npc.state = 'walk'; npc.animation = 'jumping';
    return true;
  }

  updateJump(dt: number) {
    const npc = this.mutableState, jump = npc.jump;
    if (!jump) return false;
    if (npc.vehicleId !== undefined || npc.health <= 0) { npc.jump = undefined; return true; }
    jump.progress = Math.min(1, jump.progress + dt / WORLD.player.jumpDuration);
    if (jump.progress >= 1) {
      npc.z = jump.baseZ; npc.vx = jump.vx; npc.vy = jump.vy; npc.jump = undefined;
      if (npc.state !== 'dead') npc.animation = 'walking';
      return true;
    }
    if (jump.progress < .35) jump.phase = 'rising';
    else if (jump.progress > .65) jump.phase = 'falling';
    else jump.phase = 'apex';
    jump.height = Math.sin(Math.PI * jump.progress) * WORLD.player.jumpHeight;
    npc.z = jump.baseZ; npc.vx = jump.vx; npc.vy = jump.vy; npc.animation = 'jumping';
    return true;
  }

  followVehicle(pose: MobilePose) { this.setPose(pose); }

  leaveVehicle(pose: MobilePose, velocity: { vx: number; vy: number }, damage = 0) {
    this.mutableState.vehicleId = undefined;
    this.mutableState.animationProgress = undefined;
    this.mutableState.animationStraightEntry = undefined;
    this.setPose({ ...pose, vx: velocity.vx, vy: velocity.vy });
    if (damage > 0) this.applyImpact(damage, 0, 0);
    else this.setBehavior('walk', 'walking');
  }

  preparePhysics(body: PhysicsBody, start: { x: number; y: number }, dt: number, worldToPhysics: (value: number) => number, updateLayer: () => void, applySurface: () => void) {
    if (this.mutableState.vehicleId === undefined) applySurface();
    updateLayer();
    const active = this.mutableState.health > 0 && this.mutableState.drowningTimer === undefined && this.mutableState.vehicleId === undefined;
    let desiredType: 'dynamic' | 'static' = 'static';
    if (active) desiredType = 'dynamic';
    if (body.getType() !== desiredType) body.setType(desiredType);
    if (!active) {
      body.setPosition({ x: worldToPhysics(this.mutableState.x), y: -worldToPhysics(this.mutableState.y) });
      body.setLinearVelocity({ x: 0, y: 0 });
      return;
    }
    body.setPosition({ x: worldToPhysics(start.x), y: -worldToPhysics(start.y) });
    body.setLinearVelocity({ x: worldToPhysics((this.mutableState.x - start.x) / dt), y: -worldToPhysics((this.mutableState.y - start.y) / dt) });
    body.setAwake(true);
  }

  override readPhysics(body: PhysicsBody, physicsToWorld: (value: number) => number, options: PhysicsReadOptions = {}) {
    if (this.mutableState.health <= 0 || this.mutableState.vehicleId !== undefined) return;
    super.readPhysics(body, physicsToWorld, {
      ...options,
      updateRotation: false,
      updateAngularVelocity: false,
      updateSpeed: false,
    });
  }

  applyDamage(damage: number, mode: 'panic' | 'knockdown' = 'panic', animation?: 'walking' | 'knockdown' | 'electrocuted') {
    const state = this.mutableState;
    const wasAlive = state.health > 0;
    state.health = Math.max(0, state.health - damage);
    const alive = state.health > 0;
    let resolvedAnimation: 'walking' | 'knockdown' | 'electrocuted' = 'walking';
    if (mode === 'knockdown') resolvedAnimation = 'knockdown';
    if (animation !== undefined) resolvedAnimation = animation;
    if (alive) {
      state.state = mode;
      state.animation = resolvedAnimation;
    } else {
      state.state = 'dead';
      state.animation = 'falling';
      state.jump = undefined;
    }
    if (wasAlive && !alive) { state.deathTimer = PED_DEATH_ANIMATION_TICKS; state.deathPose = undefined; if (!state.deathCause) state.deathCause = 'weapon'; }
    if (mode === 'knockdown') {
      if (alive) state.panicTimer = 34;
      else state.panicTimer = 0;
    }
    return alive;
  }

  applyImpact(damage: number, impulseX: number, impulseY: number) {
    const alive = this.applyDamage(damage, 'knockdown');
    this.mutableState.vx += impulseX;
    this.mutableState.vy += impulseY;
    return alive;
  }

  receiveVehicleImpact(impact: number, driverId: string | undefined, combat: Pick<GameObjectCombatContext, 'authoritative' | 'spawnEffect' | 'emit'>, options: { lethal: boolean; rotation?: number; impulseX?: number; impulseY?: number }) {
    if (!combat.authoritative || this.mutableState.vehicleId !== undefined || this.mutableState.health <= 0) return false;
    if (impact < WORLD.vehicle.pedestrianImpact.contactTrigger) return false;
    const lethal = options.lethal;
    // The source's sub-threshold branch creates a knockdown object; it does
    // not spend ordinary health. A second car impact while the ped is down is
    // lethal, which is represented by the state check above.
    const damage = lethal ? this.mutableState.health + 100 : 0;
    const alive = this.applyImpact(damage, options.impulseX ?? 0, options.impulseY ?? 0);
    if (!alive) {
      this.mutableState.killer = driverId;
      this.mutableState.deathCause = 'run-over';
    }
    combat.spawnEffect({
      x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z, life: lethal ? 20 : 12,
      kind: lethal ? 'blood' : 'impact', owner: driverId, rotation: options.rotation, scale: lethal ? 1 : .75,
      variant: lethal ? 1 : 0,
    });
    combat.emit({ type: 'hit', actor: driverId, target: `npc:${this.id}`, damage, lethal: !alive, x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z });
    return true;
  }

  shock(amount: number) {
    this.mutableState.shockCounter = Math.min(WORLD.combat.electrocutionThreshold, this.mutableState.shockCounter + amount);
    this.mutableState.state = 'panic';
    this.mutableState.vx = 0; this.mutableState.vy = 0;
    if (this.mutableState.shockCounter >= WORLD.combat.electrocutionThreshold) {
      this.mutableState.electrocuted = true;
      if (this.mutableState.health > 0) this.mutableState.animation = 'electrocuted';
    }
  }

  addThreat(actor: string, duration = 45) {
    this.mutableState.threatenedBy = actor;
    this.mutableState.threatTimer = Math.max(this.mutableState.threatTimer ?? 0, duration);
  }

  applyExplosionImpulse(x: number, y: number) {
    this.mutableState.vx += x;
    this.mutableState.vy += y;
  }

  /** Source Ped::SetOnFire. The fire is an attached object (model 197), not a
   * generic ground hazard, so it follows this ped until the burn is cleared. */
  setOnFire(combat?: Pick<GameObjectCombatContext, 'authoritative' | 'nextHazardId'>, threatId?: string) {
    if (this.mutableState.health <= 0 || this.mutableState.onFire) return false;
    this.mutableState.onFire = true;
    this.mutableState.fireTimer = 0;
    this.mutableState.state = 'flee';
    this.mutableState.animation = 'running';
    if (threatId) {
      this.addThreat(threatId);
      if (!threatId.startsWith('npc:')) this.mutableState.target = threatId;
    }
    this.mutableState.panicTimer = Math.max(this.mutableState.panicTimer ?? 0, 30);
    if (combat?.authoritative) {
      this.spawn(createHazardObject({
        id: combat.nextHazardId(), x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z,
        collisionLayer: this.mutableState.collisionLayer, kind: 'fire', life: 2,
        owner: `npc:${this.id}`, effect: 'fire', sourceModel: GTA2_SOURCE_OBJECT_MODELS.pedFire,
      }));
    }
    return true;
  }

  putOutFire() {
    this.mutableState.onFire = false;
    this.mutableState.fireTimer = 0;
  }

  /** Enter Char_B4::sinking_20.  The source keeps a drowning ped alive for
   * ten fixed updates, so this state is replicated instead of killing the NPC
   * at the first water sample. */
  beginDrowning(spawnEffect?: Pick<GameObjectCombatContext, 'spawnEffect'>) {
    const state = this.mutableState;
    if (state.health <= 0 || state.drowningTimer !== undefined) return false;
    state.drowningTimer = WORLD.player.waterDeathTicks;
    this.putOutFire();
    state.target = undefined;
    state.path = undefined;
    state.pathPointIndex = undefined;
    state.pathGoal = undefined;
    state.jump = undefined;
    state.vx = 0;
    state.vy = 0;
    state.panicTimer = 0;
    state.state = 'knockdown';
    state.animation = 'idle';
    spawnEffect?.spawnEffect({
      x: state.x, y: state.y, z: state.z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS,
      owner: `npc:${this.id}`, rotation: state.rotation, scale: .85,
    });
    return true;
  }

  /** Final state reached by source sinking_20 after its last splash. */
  killByWater() {
    const state = this.mutableState;
    if (state.health <= 0) return false;
    state.drowningTimer = undefined;
    state.vehicleId = undefined;
    state.health = 0;
    state.state = 'dead';
    state.animation = 'dead';
    state.deathTimer = undefined;
    state.deathPose = undefined;
    state.deathCause = 'water';
    state.jump = undefined;
    state.vx = 0;
    state.vy = 0;
    // Char_B4 sinks the sprite to z=0 and suppresses the normal weapon-drop
    // corpse path. The runtime has no weapon-drop object, so the terminal
    // pose is represented by the dead state and the zeroed height.
    state.z = 0;
    return true;
  }

  /** Start a water death after the vehicle occupancy pass has copied the
   * current car pose onto a seated NPC. Existing drowning timers are advanced
   * by tickStatus, so this method only starts a newly detected transition. */
  tickWaterStatus(combat: Pick<GameObjectCombatContext, 'authoritative' | 'isWaterAt' | 'spawnEffect'>) {
    if (!combat.authoritative || this.mutableState.health <= 0 || this.mutableState.drowningTimer !== undefined) return false;
    if (!combat.isWaterAt({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z })) return false;
    this.beginDrowning(combat);
    return true;
  }

  /** Source Char_B4::HandlePedHitByObject entry point. Fire-stream objects
   * force the panic animation, baton objects electrocute without inventing a
   * new health packet, and ordinary objects use the authored NPC packet. */
  receiveWeaponHit(damage: number, sourceModel?: number, killer?: string, combat?: Pick<GameObjectCombatContext, 'authoritative' | 'nextHazardId'>, impactRotation?: number, cause: NpcState['deathCause'] = 'weapon') {
    if (killer && this.mutableState.health > 0) this.addThreat(killer);
    if (sourceModel === 277) {
      let shockDamage = 5;
      if (damage > 0) shockDamage = damage;
      this.shock(shockDamage);
      if (damage > 0) this.applyDamage(damage, 'panic', 'walking');
      if (this.mutableState.health <= 0) this.mutableState.deathCause = cause;
      return this.mutableState.health > 0;
    }
    if (sourceModel === GTA2_SOURCE_OBJECT_MODELS.fireHitting) {
      this.setOnFire(combat, killer);
      return this.mutableState.health > 0;
    }
    if (sourceModel === GTA2_SOURCE_OBJECT_MODELS.bulletOnFire) {
      // Ped::HandlePedHitByObject model 198 is the fire-truck water stream:
      // clear the attached fire first, then apply its small NPC packet.
      this.putOutFire();
      const wasAlive = this.mutableState.health > 0;
      const alive = this.applyDamage(Math.max(1, damage), 'panic', 'walking');
      if (wasAlive && !alive) this.mutableState.deathCause = cause;
      return alive;
    }
    if (sourceModel === GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact) {
      this.applyDamage(Math.max(1, damage), 'panic', 'walking');
      if (this.mutableState.health <= 0) this.mutableState.deathCause = cause;
      this.mutableState.panicTimer = Math.max(this.mutableState.panicTimer ?? 0, 30);
      return this.mutableState.health > 0;
    }
    const wasAlive = this.mutableState.health > 0;
    const alive = this.applyDamage(Math.max(1, damage), 'panic', 'walking');
    const hitRotation = impactRotation;
    if (wasAlive && !alive && hitRotation !== undefined && Number.isFinite(hitRotation)) {
      // Char_B4::HandlePedHitByObject chooses between the two lying/fall
      // orientations from the projectile's incoming angle. Reproduce that
      // source-side 90-degree split and keep the chosen heading fixed while
      // the lethal fall and corpse are rendered.
      const delta = Math.atan2(Math.sin(hitRotation - this.mutableState.rotation), Math.cos(hitRotation - this.mutableState.rotation));
      if (Math.abs(delta) <= Math.PI / 2) {
        this.mutableState.deathPose = 'lyingReverse';
      } else {
        this.mutableState.deathPose = 'lying';
      }
    }
    if (!alive) { this.mutableState.killer = killer; this.mutableState.deathCause = cause; }
    return alive;
  }

  tickStatus(combat: Pick<GameObjectCombatContext, 'authoritative' | 'isWaterAt' | 'killNpc' | 'spawnEffect'>) {
    if (this.mutableState.shockCounter > 0) {
      this.mutableState.shockCounter = Math.max(0, this.mutableState.shockCounter - 1);
      if (this.mutableState.shockCounter === 0) {
        this.mutableState.electrocuted = false;
        if (this.mutableState.animation === 'electrocuted' && this.mutableState.health > 0) this.mutableState.animation = 'walking';
      }
    }
    if (!combat.authoritative || this.mutableState.health <= 0) return;
    if (this.mutableState.drowningTimer !== undefined) {
      this.mutableState.drowningTimer = Math.max(0, this.mutableState.drowningTimer - 1);
      if (this.mutableState.drowningTimer === 0) {
        this.mutableState.drowningTimer = undefined;
        combat.killNpc(this);
      }
      return;
    }
    if (combat.isWaterAt({ x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z })) {
      this.beginDrowning(combat);
      return;
    }
    if (!this.mutableState.onFire) return;
    this.mutableState.fireTimer += 1;
    // Ped::ManageBurning applies one source damage packet every fixed update.
    const threatId = this.mutableState.target;
    const alive = this.applyDamage(1, 'panic', 'walking');
    if (alive) {
      // ManageBurning keeps the civilian in the flee objective after each
      // damage packet; applyDamage's generic panic transition must not turn
      // a burning pedestrian back into an ordinary walker.
      this.mutableState.state = 'flee';
      this.mutableState.animation = 'running';
      this.mutableState.target = threatId;
    }
    this.mutableState.panicTimer = Math.max(this.mutableState.panicTimer ?? 0, 30);
    if (!alive) this.putOutFire();
  }

  override update(context: Parameters<NonNullable<GameObjectUpdateHandler<NpcState>>>[1]) {
    super.update(context);
    if ((this.mutableState.threatTimer ?? 0) > 0) {
      this.mutableState.threatTimer = Math.max(0, (this.mutableState.threatTimer ?? 0) - 1);
      if (this.mutableState.threatTimer === 0) this.mutableState.threatenedBy = undefined;
    }
    this.mutableState.shots = this.mutableState.shots.map(shot => ({ ...shot, life: shot.life - 1 })).filter(shot => shot.life > 0);
    const combat = context.combat;
    if (combat) {
      this.tickStatus(combat);
    }
  }
  override getCollider() {
    const collider = super.getCollider();
    const first = collider[0];
    if (!first) return [];
    if ((this.mutableState.vehicleId !== undefined && this.mutableState.animationProgress === undefined) || (this.mutableState.jump && !this.mutableState.jump.vehicleCollision)) return [{ ...first, mask: first.mask & ~COLLISION_CATEGORY.vehicle }];
    return collider;
  }
  override getSprite(_now: number): GameObjectSprite {
    const placement: GameObjectPlacement = { ...this.placement, rotation: this.mutableState.rotation - Math.PI };
    const base = (animation: Parameters<typeof sourceAnimationDefinition>[0], extra: Partial<GameObjectSprite> = {}): GameObjectSprite => {
      const definition = sourceAnimationDefinition(animation);
      let remap: number | undefined;
      if (this.mutableState.kind === 'civilian') remap = this.mutableState.remap;
      let opacity = 0;
      if (this.mutableState.vehicleId === undefined) opacity = 1;
      const pedDefinition = this.mutableState.kind === 'police' ? 2 : 1;
      let sprite: GameObjectSprite = { atlas: 'player', definition: { bank: 'ped', sourceId: pedDefinition }, animation, frameTicks: definition.frameTicks, loop: definition.loop, placement, opacity, alphaTest: .01, shadow: { opacity: .28, scale: .55, offsetY: 4 }, ...extra };
      if (definition.frameTicksByFrame) sprite = { ...sprite, frameTicksByFrame: definition.frameTicksByFrame };
      if (typeof remap === 'number') sprite = { ...sprite, pedRemap: remap };
      return sprite;
    };
    if (this.mutableState.animationProgress !== undefined && this.mutableState.animation === 'exiting') {
      let animation: 'walking' | 'exiting' = 'exiting';
      if (this.mutableState.animationStraightEntry) animation = 'walking';
      return base(animation, { frame: sourceAnimationPosition(animation, this.mutableState.animationProgress), opacity: 1, animationKey: `npc:${this.mutableState.id}:exiting` });
    }
    if (this.mutableState.animationProgress !== undefined && this.mutableState.vehicleId !== undefined) {
      let animation: 'walking' | 'entering' = 'entering';
      if (this.mutableState.animationStraightEntry) animation = 'walking';
      return base(animation, { frame: sourceAnimationPosition(animation, this.mutableState.animationProgress), opacity: 1, animationKey: `npc:${this.mutableState.id}:entering` });
    }
    if (this.mutableState.drowningTimer !== undefined) {
      const scale = Math.max(.2, this.mutableState.drowningTimer / WORLD.player.waterDeathTicks);
      return base('idle', {
        frame: 0,
        scale,
        opacity: this.mutableState.vehicleId === undefined ? 1 : 0,
        animationKey: `npc:${this.mutableState.id}:drowning`,
      });
    }
    if (this.mutableState.vehicleId !== undefined) return base('idle', { opacity: 0, animationKey: `npc:${this.mutableState.id}:seated` });
    const moving = Math.hypot(this.mutableState.vx, this.mutableState.vy) > .05, stateAnimation = this.mutableState.animation;
    if (this.mutableState.health <= 0 || this.mutableState.state === 'dead' || stateAnimation === 'dead') {
      const deathTimer = this.mutableState.deathTimer ?? 0;
      if (deathTimer > 0) {
        const elapsed = Math.max(0, PED_DEATH_ANIMATION_TICKS - deathTimer);
        return base('falling', { frame: sourceAnimationFrame('falling', elapsed / PED_DEATH_ANIMATION_TICKS), mirrorY: this.mutableState.deathPose === 'lyingReverse', animationKey: `npc:${this.mutableState.id}:death-fall` });
      }
      if (this.mutableState.deathPose) {
        const mirrorY = this.mutableState.deathPose === 'lyingReverse';
        let mirrorSuffix = '';
        if (mirrorY) mirrorSuffix = '-mirrored';
        return base('lying', { frame: sourceAnimationDefinition('lying').offsets.length - 1, mirrorY, animationKey: `npc:${this.mutableState.id}:death-lying${mirrorSuffix}` });
      }
      return base('dead', { animationKey: `npc:${this.mutableState.id}:dead` });
    }
    if (this.mutableState.electrocuted) return base('electrocuted', { animationKey: `npc:${this.mutableState.id}:electrocuted` });
    if (this.mutableState.state === 'knockdown' || stateAnimation === 'knockdown' || stateAnimation === 'falling') {
      const remaining = this.mutableState.panicTimer ?? 0;
      const frame = Math.min(16, Math.max(0, (34 - remaining) / 2));
      return base('falling', { frame, animationKey: `npc:${this.mutableState.id}:falling` });
    }
    if (stateAnimation === 'firing') return base('firing', { animationKey: `npc:${this.mutableState.id}:fire` });
    if (stateAnimation === 'throwing' || stateAnimation === 'throwingIdle') return base(stateAnimation, { animationKey: `npc:${this.mutableState.id}:throw` });
    if (stateAnimation === 'jumping') return base('jumping', { animationKey: `npc:${this.mutableState.id}:jump`, presentation: { elevation: this.mutableState.jump?.height ?? 0 } });
    if (stateAnimation === 'lying' || stateAnimation === 'lyingReverse') return base(stateAnimation, { animationKey: `npc:${this.mutableState.id}:${stateAnimation}` });
    if (stateAnimation === 'armedRunning' || stateAnimation === 'armedWalking') return base(stateAnimation, { animationKey: `npc:${this.mutableState.id}:${stateAnimation}` });
    if (stateAnimation === 'armed') {
      let animation: 'armedRunning' | 'armedWalking' = 'armedWalking';
      if (moving) animation = 'armedRunning';
      return base(animation, { animationKey: `npc:${this.mutableState.id}:${animation}` });
    }
    if (stateAnimation === 'running') return base('running', { animationKey: `npc:${this.mutableState.id}:running` });
    if (stateAnimation === 'walking') return base('walking', { animationKey: `npc:${this.mutableState.id}:walking` });
    return base('idle', { animationKey: `npc:${this.mutableState.id}:idle` });
  }
}
