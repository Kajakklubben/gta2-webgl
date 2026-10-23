import type { Input, TrafficState } from '../../../protocol/types';
import type { PhysicsBody } from '../../../engine/physics-world';
import { type GameObjectCombatContext, type VehicleCollisionContext } from '../gameobject';
import { MobileGameObject, type GameObjectUpdateHandler, type MobilePose } from '../stateful';
import { integrateVehicle } from '../../../domain/physics/vehicle-integration';
import type { VehicleControl, VehicleGeometry, VehicleGroundContact, VehicleIntegrationOptions } from '../../../domain/physics/vehicle-kinematics';
import { directionFromRotation, type Vector2 } from '../../../domain/physics/motion-vector';
import { isSourceTrainModel, SOURCE_OIL_SPIN_TICKS, skidSegmentRotation, sourceOilSpinDirection, sourceSkidObjectModel, vehicleSkidWheelPoints } from '../../../domain/physics/vehicle-skid';
import { vehicleMass } from '../../../domain/physics/vehicle-kinematics';
import type { CarPhysics } from '../../../engine/loader/gci';
import type { CarInfo } from '../../../engine/loader/style-parser';
import { WORLD } from '../../../domain/world/world';
import { DEFAULT_VEHICLE_BOUNDS, type VehicleBounds } from '../../../engine/loader/vehicle-bounds';
import { sourceDamageForImpact, type VehicleDamageTransition } from '../../../domain/combat/vehicle-damage';
import { hasWreckModel, resolveWreckModel } from '../../../domain/world/gta2-sprites';
import type { SurfaceResult } from '../../../domain/physics/map-surface';
import { VehicleDamageState } from './vehicle-damage';
import { VehicleSpriteState } from './vehicle-sprite';
import type { PlayerObject } from '../player/player';
import type { NpcObject } from '../npc';
import { VehicleAiController } from './vehicle-ai';
import { VehiclePlayerController, type VehicleEntryCandidate, type VehicleObjectContext } from './vehicle-player';
import type { VehicleControlAdapter, VehicleControlMode } from './vehicle-control';

export type { VehicleEntryCandidate, VehicleObjectContext } from './vehicle-player';
export type { VehicleControlAdapter, VehicleControlMode } from './vehicle-control';

export class VehicleObject extends MobileGameObject<TrafficState, number> {
  private groundContact: VehicleGroundContact = { grounded: true, surfaceType: 0, slopeLength: 0 };
  private readonly damageState: VehicleDamageState;
  private readonly spriteState: VehicleSpriteState;
  private readonly lastSkidPositions: Array<Vector2 | undefined> = [undefined, undefined, undefined, undefined];
  private readonly playerController: VehiclePlayerController;
  private readonly aiController: VehicleAiController;
  private controlAdapter: VehicleControlAdapter;
  private oilSpinTimer = 0;
  private oilSpinDirectionValue: -1 | 1 = 1;

  constructor(
    state: TrafficState,
    update?: GameObjectUpdateHandler<TrafficState>,
    readonly bounds: VehicleBounds = DEFAULT_VEHICLE_BOUNDS,
    readonly physics?: CarPhysics,
    readonly info?: CarInfo,
  ) {
    super(state.id, state, 'vehicle', update);
    const wreckGraphic = info?.wreck;
    if (typeof state.wreckModel !== 'number' && typeof wreckGraphic === 'number' && hasWreckModel(wreckGraphic)) state.wreckModel = resolveWreckModel(wreckGraphic);
    this.collision = { shape: { type: 'box', ...bounds }, restitution: WORLD.vehicle.collisionRestitution, friction: WORLD.vehicle.collisionFriction, fixedRotation: false };
    this.damageState = new VehicleDamageState(state, physics?.antiStrength ?? 1);
    this.spriteState = new VehicleSpriteState(state);
    this.playerController = new VehiclePlayerController(this);
    this.aiController = new VehicleAiController(this);
    const driver = state.passengers[0];
    this.controlAdapter = driver && !driver.startsWith('npc:') ? this.playerController : this.aiController;
  }

  /** Prepare this vehicle's dynamic body from the authoritative pre-step pose.
   * The physics world owns the body; the vehicle owns how its state is mapped
   * onto that body. */
  preparePhysics(body: PhysicsBody, start: { x: number; y: number; rotation: number }, worldToPhysics: (value: number) => number, updateLayer: () => void) {
    updateLayer();
    if (body.getType() !== 'dynamic') body.setType('dynamic');
    body.setAngle(-start.rotation);
    body.setAngularVelocity(-this.mutableState.angularVelocity);
    body.setPosition({ x: worldToPhysics(start.x), y: -worldToPhysics(start.y) });
    body.setLinearVelocity({ x: worldToPhysics(this.mutableState.vx), y: -worldToPhysics(this.mutableState.vy) });
    body.setAwake(true);
  }

  /** Internal behavior boundary for the specialized vehicle controllers. */
  get mutableVehicleState(): TrafficState { return this.mutableState; }

  /** The vehicle has exactly one active driver-control owner. */
  get controlMode(): VehicleControlMode { return this.controlAdapter.mode; }

  private updateGroundContactState(contact: VehicleGroundContact) { this.groundContact = { ...contact }; }

  override get blockingWeight() { return vehicleMass(this.physics); }

  /** The occupant in passenger slot zero, which is the vehicle's driver. */
  get driver(): string | undefined { return this.mutableState.passengers[0]; }

  syncSeatedOccupants(context: VehicleObjectContext) { this.playerController.syncSeatedOccupants(context); }

  vehiclePose(): MobilePose {
    return {
      x: this.mutableState.x, y: this.mutableState.y, z: this.mutableState.z,
      rotation: this.mutableState.rotation, vx: this.mutableState.vx, vy: this.mutableState.vy,
      collisionLayer: this.mutableState.collisionLayer, grounded: this.mutableState.grounded,
      verticalVelocity: this.mutableState.verticalVelocity,
    };
  }

  /** Resolve the support under the chassis footprint and update its authored
   * ground contact. Map lookup remains a world service; footprint ownership is
   * vehicle behavior. */
  updateFloor(
    resolveFootprint: (points: readonly { x: number; y: number }[], options: { height: number; blockLayer: number; maxClimb: number }) => SurfaceResult,
    collisionLayer: () => number,
    applySurface: (surface: SurfaceResult) => void,
    onSurface: (surface: SurfaceResult) => void,
  ) {
    const right = { x: Math.cos(this.mutableState.rotation), y: Math.sin(this.mutableState.rotation) };
    const forward = directionFromRotation(this.mutableState.rotation);
    const halfWidth = this.bounds.width * .45, halfHeight = this.bounds.height * .45;
    const samples = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => ({
      x: this.mutableState.x + right.x * halfWidth * sx + forward.x * halfHeight * sy,
      y: this.mutableState.y + right.y * halfWidth * sx + forward.y * halfHeight * sy,
    }));
    let maxClimb = 7;
    if (this.mutableState.grounded === false) maxClimb = 1.05;
    const surface = resolveFootprint(samples, {
      height: this.mutableState.z,
      blockLayer: Math.max(0, collisionLayer() - 1),
      maxClimb,
    });
    applySurface(surface);
    onSurface(surface);
  }

  updateGroundContact(surface: SurfaceResult, roadAt: () => boolean) {
    const support = surface[0];
    if (!support) {
      if (roadAt()) this.updateGroundContactState({ grounded: true, surfaceType: 0, slopeLength: 0 });
      else this.updateGroundContactState({ grounded: false, surfaceType: 6, slopeLength: 0 });
      return;
    }
    this.updateGroundContactState({ grounded: support.grounded, surfaceType: support.surfaceType, slopeDirection: support.slopeDirection, slopeLength: support.slopeLength });
  }

  stop() {
    const state = this.mutableState;
    state.vx = 0; state.vy = 0; state.speed = 0; state.angularVelocity = 0;
    state.throttle = 0; state.brakePressure = 1; state.brakeLights = true;
  }

  setPlayerControlMode() {
    this.aiController.setPlayerControlMode();
    this.controlAdapter = this.playerController;
  }

  setAutonomousControlMode() {
    this.aiController.setAutonomousControlMode();
    this.controlAdapter = this.aiController;
  }

  setBrakeLights(enabled: boolean) { this.mutableState.brakeLights = enabled; }

  applyBrakePressure(value: number) { this.mutableState.brakePressure = Math.max(0, Math.min(1, value)); }

  recomputeSpeed() {
    this.mutableState.speed = this.mutableState.vx * (-Math.sin(this.mutableState.rotation)) + this.mutableState.vy * Math.cos(this.mutableState.rotation);
  }

  /** Apply damage from a resolved vehicle collision. The engine owns the impulse
   * and separation; this object owns the GTA2 damage consequence. */
  receiveCollisionImpact(closingSpeed: number, x: number, y: number, combat: VehicleCollisionContext) {
    if (!this.alive || closingSpeed <= 0) return false;
    const damage = sourceDamageForImpact(closingSpeed, vehicleMass(this.physics));
    if (damage <= 0) return false;
    combat.damageVehicle(this, damage, x, y);
    return true;
  }

  receiveMapImpact(impact: number, combat: VehicleCollisionContext, x = this.mutableState.x, y = this.mutableState.y) {
    return this.receiveCollisionImpact(impact, x, y, combat);
  }

  /** Whether this chassis can accept another map-contact consequence. */
  canReceiveCollisionImpact() { return (this.mutableState.collisionCooldown ?? 0) <= 0; }

  /** Car_BC::HandleCarHitByObject checks runtime flags before accepting an
   * object packet. The retail tank is bulletproof and flameproof; rockets and
   * explosive packets still go through. */
  canReceiveObjectDamage(sourceModel: number | undefined) {
    if (sourceModel === undefined) return true;
    const model = this.info?.model ?? this.mutableState.model;
    if (model !== 54) return true;
    if (sourceModel === 128 || sourceModel === 138 || sourceModel === 10 || sourceModel === 183) return true;
    return sourceModel !== 154 && sourceModel !== 194 && sourceModel !== 195 && sourceModel !== 198 &&
      sourceModel !== 254 && sourceModel !== 265 && sourceModel !== 192 && sourceModel !== 277;
  }

  /** Car_BC::IsImmuneToExplosionType_43B850. Trains are separately excluded
   * by the source blast loop; the tank's rocket/flame-proof flags reject every
   * explosion family except the large type 20 dispatch. */
  canReceiveExplosion(explosionType: number) {
    if (this.mutableState.transport === 'train' || isSourceTrainModel(this.info?.model ?? this.mutableState.model)) return false;
    const model = this.info?.model ?? this.mutableState.model;
    return model !== 54 || explosionType === 20;
  }

  fireCarBomb(actor: PlayerObject, instant: boolean, combat: GameObjectCombatContext) {
    return this.playerController.fireCarBomb(actor, instant, combat);
  }

  spinOutOnOil() {
    if (!this.alive || this.mutableState.transport === 'train' || isSourceTrainModel(this.info?.model ?? this.mutableState.model)) return false;
    if (this.oilSpinTimer <= 0) this.oilSpinDirectionValue = sourceOilSpinDirection(this.mutableState.id);
    this.oilSpinTimer = SOURCE_OIL_SPIN_TICKS;
    return true;
  }

  /** Exposed for deterministic tests and telemetry without replicating a new
   * protocol field. The authoritative source state remains the private timer. */
  get oilSpinTicksRemaining() { return this.oilSpinTimer; }
  get oilSpinDirection() { return this.oilSpinTimer > 0 ? this.oilSpinDirectionValue : 0; }

  markCollisionCooldown(ticks = 18) { this.mutableState.collisionCooldown = Math.max(0, Math.floor(ticks)); }

  tickCollisionCooldown() {
    const cooldown = this.mutableState.collisionCooldown ?? 0;
    if (cooldown > 0) this.mutableState.collisionCooldown = cooldown - 1;
  }

  weaponOrigins(sourceType: number, occupantId: string) { return this.playerController.weaponOrigins(sourceType, occupantId); }

  canFireWeapon(sourceType: number, occupantId: string) { return this.playerController.canFireWeapon(sourceType, occupantId); }

  applyExplosionImpulse(x: number, y: number) {
    this.mutableState.vx += x;
    this.mutableState.vy += y;
    this.recomputeSpeed();
  }

  rearHazardPoint(sourceType: number, ammo: number) { return this.playerController.rearHazardPoint(sourceType, ammo); }

  deployHazard(actor: PlayerObject, weaponId: number, combat: GameObjectCombatContext) {
    return this.playerController.deployHazard(actor, weaponId, combat);
  }

  isDriven() { return this.aiController.isDriven(); }

  updateUnoccupied(dt: number, control: VehicleControl = { throttle: 0, steer: 0 }) {
    return this.controlAdapter.updateUnoccupied(dt, control);
  }

  isPlayerDriven() { return this.controlAdapter.mode === 'player' && this.aiController.isDriven(); }

  applyDriverInput(playerId: string, input: Input, dt: number, slippery = false) {
    if (!this.playerController.canApplyDriverInput(playerId, input)) return false;
    this.setPlayerControlMode();
    return this.controlAdapter.applyDriverInput(playerId, input, dt, slippery);
  }

  beginNpcEntry(npc: NpcObject, context: VehicleObjectContext) { return this.playerController.beginNpcEntry(npc, context); }

  updateOccupancy(dt: number, context: VehicleObjectContext) { this.playerController.updateOccupancy(dt, context); }

  beginEntry(player: PlayerObject, candidate: VehicleEntryCandidate, context: VehicleObjectContext) {
    return this.playerController.beginEntry(player, candidate, context);
  }

  beginExit(player: PlayerObject, exit: { door: number }, context: VehicleObjectContext, immediate = false) {
    return this.playerController.beginExit(player, exit, context, immediate);
  }

  detachOccupant(id: string, context: VehicleObjectContext, damage = 0) {
    return this.playerController.detachOccupant(id, context, damage);
  }

  ejectOccupants(context: VehicleObjectContext, damage = 0) { this.playerController.ejectOccupants(context, damage); }

  /** Apply authored damage and update this vehicle's damage mask. */
  receiveDamage(damage: number, x = this.mutableState.x, y = this.mutableState.y) {
    return this.damageState.receive(damage, x, y);
  }

  tickDamage(): VehicleDamageTransition { return this.damageState.tick(); }

  /** Complete the source wreck transition. Child fire/explosion effects are
   * still coordinated by the world, but the chassis owns its final damage,
   * lights, and motion state. */
  completeWreck() {
    this.mutableState.damageMask = 0;
    this.mutableState.headlights = false;
    this.stop();
  }

  override getSprite(_now: number) {
    return { ...this.spriteState.getSprite({ ...this.placement, rotation: this.mutableState.rotation - Math.PI }), shadow: { opacity: .24, scale: .72, offsetY: 6 } };
  }

  private clearSkidTracks() {
    for (let index = 0; index < this.lastSkidPositions.length; index++) this.lastSkidPositions[index] = undefined;
  }

  /** Mirror CarPhysics_B0::UpdateWheelSkidEffects with the replicated car
   * state. The source remembers each wheel's previous contact point and
   * creates a rotated segment at the midpoint, rather than a decal at the
   * chassis centre. */
  private updateSkidmarks(context: Parameters<NonNullable<GameObjectUpdateHandler<TrafficState>>>[1]) {
    const combat = context.combat;
    const state = this.mutableState;
    const moving = Math.hypot(state.vx, state.vy) >= 45;
    const grounded = this.groundContact.grounded !== false && this.groundContact.surfaceType !== 6;
    if (!combat?.authoritative || !state.brakeLights || !moving || !grounded || !this.alive || context.tick % 4 !== 0) {
      if (!state.brakeLights || !moving || !grounded || !this.alive) this.clearSkidTracks();
      return;
    }
    const frontWheelOffset = this.info?.frontWheelOffset ?? this.bounds.height * .25;
    const rearWheelOffset = this.info?.rearWheelOffset ?? -this.bounds.height * .25;
    const points = vehicleSkidWheelPoints(state, this.bounds.width, frontWheelOffset, rearWheelOffset);
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      const previous = this.lastSkidPositions[index];
      if (previous) {
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        if (length > 1e-3) {
          combat.spawnEffect({
            x: (previous.x + point.x) * .5,
            y: (previous.y + point.y) * .5,
            z: state.z + .02,
            kind: 'skid',
            life: 240,
            owner: `vehicle:${this.id}`,
            collisionLayer: state.collisionLayer,
            rotation: skidSegmentRotation(previous, point, state.rotation),
            sourceModel: sourceSkidObjectModel(0, length),
          });
        }
      }
      this.lastSkidPositions[index] = point;
    }
  }

  override update(context: Parameters<NonNullable<GameObjectUpdateHandler<TrafficState>>>[1]) {
    super.update(context);
    this.updateSkidmarks(context);
  }

  /** Computes source drivetrain forces; the engine physics runtime commits the final pose. */
  drive(control: VehicleControl, physics: CarPhysics | undefined, dt: number, options: VehicleIntegrationOptions = {}) {
    let wheelBase: number | undefined;
    let footprint: VehicleGeometry = this.bounds;
    if (this.info) {
      wheelBase = Math.abs(this.info.frontWheelOffset - this.info.rearWheelOffset);
      footprint = {
        frontWheelOffset: this.info.frontWheelOffset,
        rearWheelOffset: this.info.rearWheelOffset,
        width: this.bounds.width,
        height: this.bounds.height,
      };
    }
    const oilDirection = this.oilSpinDirection;
    const sourceControl: VehicleControl & { sourceOilSpinDirection?: -1 | 1 } = oilDirection === 0 ? control : {
      ...control,
      // ApplyForcedSteering_559DD0 enables forward gas and replaces player
      // steering for the duration of the source oil timer.
      throttle: Math.max(control.throttle, 1),
      steer: oilDirection,
      brake: false,
      handbrake: false,
      slippery: true,
      sourceOilSpinDirection: oilDirection,
    };
    const integrationOptions = { advancePose: false, ...options };
    if (oilDirection !== 0) integrationOptions.applyDrivetrainForces = true;
    const result = integrateVehicle(this.mutableState, sourceControl, physics ?? this.physics, dt, wheelBase, footprint, this.groundContact, integrationOptions);
    if (oilDirection !== 0 && dt > 0) this.oilSpinTimer = Math.max(0, this.oilSpinTimer - Math.max(1, Math.round(dt * WORLD.tickRate)));
    return result;
  }
}
