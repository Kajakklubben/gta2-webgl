import { SOURCE_FIX16_ONE, WORLD, sourceFixedPerTickToWorld, tilesPerSecondToWorld } from '../world/world';
import type { CarPhysics } from '../../engine/loader/gci';
import { directionFromRotation, type Vector2 } from './motion-vector';
import { vehicleGear } from './vehicle-kinematics-gears';
export { vehicleGear } from './vehicle-kinematics-gears';

/** A speed-based turn rate keeps the vehicle's curvature consistent. */
export function vehicleTurnRate(speed: number, physics?: CarPhysics, wheelBase?: number): number {
  const magnitude = Math.abs(speed);
  if (magnitude < 1) return WORLD.vehicle.lowSpeedTurnRate;
  const ratio = Math.max(0.35, Math.min(1, physics?.turnRatio ?? 1));
  let radius: number = WORLD.vehicle.turnRadius;
  if (wheelBase !== undefined && wheelBase > 1) radius = wheelBase;
  return Math.min(WORLD.vehicle.maxTurnRate, Math.max(WORLD.vehicle.lowSpeedTurnRate, magnitude / radius * ratio));
}

/**
 * Return the authored wheel-pointing amount used by
 * CarPhysics_B0::UpdateSteeringAngle_562560. Traffic uses the raw GCI turn
 * ratio. Player-controlled cars multiply it by the source's speed-dependent
 * factor, using velocity in map units per fixed tick (not browser pixels/s).
 */
export function vehicleSteeringScale(linearSpeed: number, physics?: CarPhysics, ai = false): number {
  const turnRatio = Math.max(0, physics?.turnRatio ?? 1);
  if (ai) return turnRatio * WORLD.vehicle.source.steeringAngleScale;
  const sourceSpeed = Math.abs(linearSpeed) / (WORLD.tileSize * WORLD.tickRate);
  const speedFactor = Math.max(
    WORLD.vehicle.source.steeringMinimumFactor,
    WORLD.vehicle.source.steeringSpeedSquared - sourceSpeed * sourceSpeed,
  ) / (WORLD.vehicle.source.steeringSpeedSquared * WORLD.vehicle.source.steeringReferenceScale);
  return turnRatio * speedFactor * WORLD.vehicle.source.steeringAngleScale;
}

export function vehicleForwardSpeed(physics?: CarPhysics): number {
  const authored = physics?.maxSpeed;
  // GCI stores linear velocity in map tiles per fixed tick. Convert once to
  // runtime pixels per second; gear thresholds use this same boundary.
  if (authored !== undefined && authored > 0) return sourceFixedPerTickToWorld(authored);
  return tilesPerSecondToWorld(WORLD.vehicle.forwardSpeed);
}

/** Source Car_BC::GetDamageFactorOnSpeed_439EE0. */
export function vehicleDamageSpeedFactor(sourceDamage: number | undefined) {
  if (sourceDamage === undefined || !Number.isFinite(sourceDamage) || sourceDamage < 16_000) return 1;
  return Math.max(0, (32_001 - sourceDamage) / 16_000);
}

export interface VehicleDynamicsState extends Vector2 {
  rotation: number;
  speed: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  throttle: number;
  brakePressure: number;
  /** Source field_A8_hand_brake_force, normalized to 0..1. */
  handbrakeForce: number;
  health?: number | undefined;
  /** Car_BC's raw 0..32001 damage accumulator, when available. */
  damage?: number | undefined;
}

export interface VehicleControl {
  /** Forward is positive, reverse is negative. */
  throttle: number;
  steer: number;
  /** Foot brake. At low/negative speed the same input is reverse gas. */
  brake?: boolean | undefined;
  handbrake?: boolean | undefined;
  /** AI follows a desired heading without the player speed steering reduction. */
  ai?: boolean | undefined;
  slippery?: boolean | undefined;
}

/**
 * CarInfo_808::ConvertMass_454680 applies the source's 1.1 conversion before
 * the physics object is created. Keep that conversion at one boundary so the
 * drivetrain, collision resolver, and native physics body all agree on weight.
 */
export function vehicleMass(physics?: CarPhysics): number {
  return Math.max(.25, (physics?.mass ?? 12) * 1.1);
}

/** ComputeCarMassAndInertia_454410's centre-of-mass offset. */
export function vehicleCenterOfMassOffset(height: number, physics?: CarPhysics): number {
  const mass = vehicleMass(physics);
  const bias = Math.max(0, Math.min(1, physics?.frontMassBias ?? .5));
  const frontMass = mass * bias, rearMass = mass * (1 - bias);
  const axle = Math.max(1, Math.abs(height)) * .25;
  return (axle * frontMass - axle * rearMass) / mass;
}

/**
 * ComputeCarMassAndInertia_454410, expressed in runtime pixel units. CARI
 * dimensions are divided by 64 in the executable; applying the same formula
 * to pixel dimensions keeps the moment in the pixel force unit used here.
 */
export function vehicleMomentOfInertia(width: number, height: number, physics?: CarPhysics): number {
  const mass = vehicleMass(physics);
  const bias = Math.max(0, Math.min(1, physics?.frontMassBias ?? .5));
  const safeWidth = Math.max(1, Math.abs(width)), safeHeight = Math.max(1, Math.abs(height));
  const inertiaBase = ((safeHeight * safeHeight) * .25 + safeWidth * safeWidth) / 12;
  const frontMass = mass * bias, rearMass = mass * (1 - bias);
  const axle = safeHeight * .25;
  const center = (axle * frontMass - axle * rearMass) / mass;
  return Math.max(.25,
    frontMass * inertiaBase + frontMass * (center - axle) ** 2
    + rearMass * inertiaBase + rearMass * (center + axle) ** 2,
  );
}

/**
 * ComputeThrustWithTurbo_5618F0 produces 1.5x normal thrust and 2x thrust for
 * turbo models (half thrust plus the source's fifth-thrust term).
 */
export function vehicleThrust(physics?: CarPhysics): number {
  const thrust = Math.max(0, physics?.thrust ?? .18);
  let multiplier = 1.5;
  if (physics?.turbo) multiplier = 2;
  return thrust * multiplier;
}

export interface VehicleGeometry {
  frontWheelOffset?: number | undefined;
  rearWheelOffset?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/** Ground state collected from the same map block that supplies a vehicle's z. */
export interface VehicleGroundContact {
  grounded?: boolean | undefined;
  /** 0 is flat, 1..4 are source cardinal slopes, and 6 is air. */
  surfaceType?: number | undefined;
  slopeDirection?: Vector2 | undefined;
  slopeLength?: number | undefined;
}

/** Options for the shared source drivetrain step.
 *
 * The authoritative map body owns chassis translation and rotation.  Keeping
 * pose advancement optional lets the same force/stabilisation code be used by
 * both the direct motion helpers and the world runtime's native physics body without
 * integrating an occupied car once before the physics sweep and once during
 * it.
 */
export interface VehicleIntegrationOptions {
  /** Apply the resulting velocity/angular velocity to the state pose. */
  advancePose?: boolean | undefined;
  /** Apply throttle/wheel forces. Neutral parked chassis only stabilize. */
  applyDrivetrainForces?: boolean | undefined;
}

const DEFAULT_VEHICLE_GROUND: VehicleGroundContact = { grounded: true, surfaceType: 0, slopeLength: 0 };

/**
 * Apply the source's `StabilizeVelocityAtSpeed_562910` step without applying
 * engine input or advancing the chassis pose. This is used for an unoccupied
 * car after a collision impulse: the native solver supplies the impulse, then the car's
 * normal grounded/airborne damping brings that velocity back to rest.
 */
export function stabilizeVehicleVelocity(state: VehicleDynamicsState, dt: number, ground: VehicleGroundContact = DEFAULT_VEHICLE_GROUND, applySlope = true) {
  if (!(dt > 0)) return state;
  const forward = directionFromRotation(state.rotation);
  const right = { x: Math.cos(state.rotation), y: Math.sin(state.rotation) };
  const grounded = ground.grounded !== false && ground.surfaceType !== 6;
  const sourceFrames = Math.max(0, dt * WORLD.tickRate);
  let lateralDampingBase = WORLD.vehicle.source.airLateralDamping;
  let longitudinalDampingBase = WORLD.vehicle.source.airLongitudinalDamping;
  let angularDampingBase = WORLD.vehicle.source.airAngularDamping;
  if (grounded) {
    lateralDampingBase = WORLD.vehicle.source.groundLateralDamping;
    longitudinalDampingBase = WORLD.vehicle.source.groundLongitudinalDamping;
    angularDampingBase = WORLD.vehicle.source.groundAngularDamping;
  }
  const lateralDamping = Math.pow(lateralDampingBase, sourceFrames);
  const longitudinalDamping = Math.pow(longitudinalDampingBase, sourceFrames);
  const angularDamping = Math.pow(angularDampingBase, sourceFrames);
  const zeroVelocity = sourceFixedPerTickToWorld(WORLD.vehicle.source.velocityZeroThreshold);
  let vx = state.vx;
  let vy = state.vy;
  let longitudinal = vx * forward.x + vy * forward.y;
  let lateral = vx * right.x + vy * right.y;

  // HandleGravityOnSlope_55AA00 runs before stabilization. The force is an
  // acceleration in world units, so it is independent of the chassis mass.
  let slope: Vector2 | undefined;
  if (grounded && ground.surfaceType !== undefined && ground.surfaceType >= 1 && ground.surfaceType <= 4
    && (ground.slopeLength ?? 1) === 1) {
    slope = ground.slopeDirection;
  }
  if (slope && applySlope) { vx += slope.x * WORLD.vehicle.source.slopeGravityAcceleration * dt; vy += slope.y * WORLD.vehicle.source.slopeGravityAcceleration * dt; }

  longitudinal = vx * forward.x + vy * forward.y;
  lateral = vx * right.x + vy * right.y;
  if (Math.abs(lateral) <= zeroVelocity && Math.abs(longitudinal) <= zeroVelocity) {
    vx *= lateralDamping;
    vy *= lateralDamping;
  } else {
    lateral *= lateralDamping;
    longitudinal *= longitudinalDamping;
    vx = right.x * lateral + forward.x * longitudinal;
    vy = right.y * lateral + forward.y * longitudinal;
  }

  let angularVelocity = state.angularVelocity * angularDamping;
  // Fix16 truncation in the executable eventually reaches an exact zero. A
  // browser float otherwise leaves a visually moving car forever at a tiny
  // residual velocity.
  const fixedPointEpsilon = sourceFixedPerTickToWorld(1 / SOURCE_FIX16_ONE);
  if (Math.abs(vx) < fixedPointEpsilon) vx = 0;
  if (Math.abs(vy) < fixedPointEpsilon) vy = 0;
  if (Math.abs(angularVelocity) < .0001) angularVelocity = 0;
  state.vx = vx; state.vy = vy; state.speed = vx * forward.x + vy * forward.y; state.angularVelocity = angularVelocity;
  return state;
}

/** Point velocity used by CarPhysics_B0::ComputePointVelocity_561380. */
export function computePointVelocity(linear: Vector2, angularVelocity: number, point: Vector2, center = { x: 0, y: 0 }): Vector2 {
  const rx = point.x - center.x, ry = point.y - center.y;
  return { x: linear.x - angularVelocity * ry, y: linear.y + angularVelocity * rx };
}

/**
 * Source-shaped engine torque. `throttle` is the normalized control input,
 * while CarPhysics_B0 internally accumulates a 0..5 gas-pedal value. The
 * source adds half thrust immediately, adds one fifth per pedal unit, and
 * only applies the turbo multiplier after the pedal reaches three.
 */
export function computeEngineTorque(linearSpeed: number, throttle: number, physics?: CarPhysics) {
  if (Math.abs(throttle) < 1e-4) return 0;
  const gear = vehicleGear(linearSpeed, physics);
  let direction = 1;
  if (throttle < 0) direction = -1;
  const pedal = Math.max(0, Math.min(WORLD.vehicle.gasPedalMax, Math.abs(throttle) * WORLD.vehicle.gasPedalMax));
  const sourceThrust = Math.max(0, physics?.thrust ?? .18);
  const halfThrust = sourceThrust * .5;
  const fifthThrust = sourceThrust / 5;
  const turbo = Boolean(physics?.turbo) && pedal >= WORLD.vehicle.turboRevThreshold;
  let turboMultiplier = 1;
  if (turbo) turboMultiplier = 2;
  const torque = halfThrust + fifthThrust * pedal * turboMultiplier;
  return direction * torque * gear * WORLD.vehicle.gciAccelerationScale;
}
export { applyForceAtPoint, applyVehicleImpulse } from './vehicle-kinematics-impulse';

