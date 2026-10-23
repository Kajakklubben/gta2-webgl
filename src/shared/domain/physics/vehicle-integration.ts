import { WORLD, sourceFixedPerTickToWorld, tilesPerSecondToWorld } from '../world/world';
import type { CarPhysics } from '../../engine/loader/gci';
import { directionFromRotation, normalizeRotation, type Vector2 } from './motion-vector';
import { SOURCE_OIL_GRIP_SCALE, SOURCE_OIL_STEER_ANGLE } from './vehicle-skid';
import { computeEngineTorque, computePointVelocity, applyForceAtPoint, stabilizeVehicleVelocity, vehicleCenterOfMassOffset, vehicleDamageSpeedFactor, vehicleForwardSpeed, vehicleMass, vehicleMomentOfInertia, vehicleSteeringScale, type VehicleControl, type VehicleDynamicsState, type VehicleGeometry, type VehicleGroundContact, type VehicleIntegrationOptions } from './vehicle-kinematics';

type SourceVehicleControl = VehicleControl & { sourceOilSpinDirection?: -1 | 1 };

const approach = (current: number, target: number, amount: number) => current + Math.max(-amount, Math.min(amount, target - current));
const DEFAULT_VEHICLE_GROUND: VehicleGroundContact = { grounded: true, surfaceType: 0, slopeLength: 0 };
/**
 * Source-shaped car integration. CarPhysics_B0 first ramps throttle, computes
 * gear torque and wheel grip, integrates acceleration/angular acceleration,
 * then clamps velocity to the authored model limits. This is the browser
 * equivalent in world-pixel units, kept deterministic for server/client use.
 */
/**
 * One source-sized movement slice.  The executable does not move a chassis in
 * one large integration: StepMovementAndCollisions consumes the remaining
 * time in eighth-frame slices and runs a sweep/binary-search collision pass
 * after each slice.  The map sweep itself is owned by the world runtime, but the
 * drivetrain must use the same slices so steering, braking and gear changes
 * cannot jump over a wall between collision checks.
 */
function integrateVehicleSlice(state: VehicleDynamicsState, control: SourceVehicleControl, physics: CarPhysics | undefined, dt: number, wheelBase?: number, geometry: VehicleGeometry = {}, ground: VehicleGroundContact = DEFAULT_VEHICLE_GROUND, options: VehicleIntegrationOptions = {}) {
  const advancePose = options.advancePose !== false;
  const applyDrivetrainForces = options.applyDrivetrainForces !== false;
  const previousRotation = state.rotation;
  const forward = directionFromRotation(state.rotation);
  let vx = state.vx;
  let vy = state.vy;
  const throttleTarget = Math.max(-1, Math.min(1, control.throttle));
  const sourceFrames = Math.max(0, dt * WORLD.tickRate);
  // ApplyThrottleInput_562480 changes the source pedal by 0.25 per frame in
  // either direction. State stores the normalized equivalent for snapshots.
  const throttleRate = (WORLD.vehicle.gasPedalStep / WORLD.vehicle.gasPedalMax) * sourceFrames;
  const throttle = approach(state.throttle, throttleTarget, throttleRate);
  const longitudinal = vx * forward.x + vy * forward.y;
  const absSpeed = Math.hypot(vx, vy);
  const turnIn = Math.max(0, Math.min(.95, physics?.turnIn ?? .2));
  const rearStability = Math.max(.1, physics?.rearEndStability ?? 1);
  const mass = vehicleMass(physics);
  const grounded = ground.grounded !== false && ground.surfaceType !== 6;
  const gciSpeedToWorld = (value: number) => sourceFixedPerTickToWorld(value);
  let damageSpeedFactor = 1;
  if (state.damage !== undefined) damageSpeedFactor = vehicleDamageSpeedFactor(state.damage);
  else if (state.health !== undefined) damageSpeedFactor = .45 + .55 * Math.max(0, Math.min(1, state.health / 100));
  const maxForward = vehicleForwardSpeed(physics) * damageSpeedFactor;
  const maxReverse = maxForward * WORLD.vehicle.reverseRatio;
  let brakeTarget = 0;
  if (control.brake || control.handbrake) brakeTarget = 1;
  const brakePressure = approach(state.brakePressure, brakeTarget, WORLD.vehicle.brakePressureResponse * sourceFrames);

  // Wheel positions are the same source data used by CARI. The fallback is
  // deliberately conservative for synthetic test styles and old snapshots.
  let fallbackWheelOffset = 24;
  if (wheelBase) fallbackWheelOffset = wheelBase / 2;
  const frontOffset = geometry.frontWheelOffset ?? fallbackWheelOffset;
  const rearOffset = geometry.rearWheelOffset ?? -fallbackWheelOffset;
  const centerOffset = vehicleCenterOfMassOffset(geometry.height ?? 66, physics);
  const center = { x: forward.x * centerOffset, y: forward.y * centerOffset };
  const angular = state.angularVelocity;
  let totalForce = { x: 0, y: 0 }, totalTorque = 0;
  const addForce = (force: Vector2, point: Vector2) => {
    totalForce = { x: totalForce.x + force.x, y: totalForce.y + force.y };
    totalTorque += applyForceAtPoint(force, point, center).torque;
  };
  const rotate = (v: Vector2, angle: number): Vector2 => ({ x: v.x * Math.cos(angle) - v.y * Math.sin(angle), y: v.x * Math.sin(angle) + v.y * Math.cos(angle) });
  // UpdateSteeringAngle_562560 stores the source ratio directly as the wheel
  // pointing angle. Reverse driving mirrors the steering direction so the
  // player's left/right controls remain car-relative while backing up.
  let steerSign = 1;
  if (longitudinal < -1) steerSign = -1;
  const oilSpinDirection = control.sourceOilSpinDirection;
  const oilSpinning = oilSpinDirection === -1 || oilSpinDirection === 1;
  const steerInput = oilSpinning ? oilSpinDirection : control.steer;
  const steerAngle = oilSpinning
    ? oilSpinDirection * SOURCE_OIL_STEER_ANGLE
    : control.steer * vehicleSteeringScale(absSpeed, physics, Boolean(control.ai)) * steerSign;
  // CalculateRearWheelForce_5620D0 points the rear force in the opposite
  // direction, scaled by (0.6 - |velocity|) / (3.8 * 0.6). This small
  // counter-steer is what keeps the source car from pivoting around its front
  // axle at speed.
  const sourceSpeed = absSpeed / (WORLD.tileSize * WORLD.tickRate);
  const rearSteerFactor = (WORLD.vehicle.source.steeringSpeedSquared - sourceSpeed) /
    WORLD.vehicle.source.rearSteeringDenominator;
  let handbrakeGrip = 1;
  if (control.handbrake) handbrakeGrip = Math.max(.05, physics?.handbrakeSlideValue ?? .18);
  let handbrakeTarget = 0;
  if (control.handbrake) handbrakeTarget = 1;
  const handbrakeForce = approach(state.handbrakeForce, handbrakeTarget, WORLD.vehicle.source.handbrakePressureStep * sourceFrames);
  const driveFront = Math.max(0, Math.min(1, physics?.frontDriveBias ?? .5));
  // The source stops applying engine torque as soon as the gas input is
  // released, even while its pedal accumulator is returning to zero.
  // ComputeEngineTorque_561970 selects gears from GetLength(), including
  // lateral velocity while cornering, rather than only the forward component.
  let engineThrottle = throttle;
  if (throttleTarget === 0) engineThrottle = 0;
  const engineForce = computeEngineTorque(absSpeed, engineThrottle, physics);
  const wheel = (longitudinalOffset: number, front: boolean) => {
    // CarPhysics_B0 applies one centre-line contact at each axle. The sprite
    // has four visual wheel/skid positions, but they do not create four
    // independent force points in the source physics.
    const point = { x: forward.x * longitudinalOffset, y: forward.y * longitudinalOffset };
    const velocity = computePointVelocity({ x: vx, y: vy }, angular, point, center);
    let wheelForward = rotate(forward, -steerAngle * rearSteerFactor);
    if (front) wheelForward = rotate(forward, steerAngle);
    const wheelRight = { x: wheelForward.y, y: -wheelForward.x };
    const wheelLongitudinal = velocity.x * wheelForward.x + velocity.y * wheelForward.y;
    const wheelLateral = velocity.x * wheelRight.x + velocity.y * wheelRight.y;
    let axleGrip = 1;
    if (steerInput) axleGrip = 1 + turnIn;
    if (!front) {
      axleGrip = 1;
      if (steerInput) axleGrip = 1 - turnIn;
      axleGrip *= rearStability * handbrakeGrip;
    }
    if (control.slippery) axleGrip *= SOURCE_OIL_GRIP_SCALE;
    // ApplyDriveForce friction.y is the authored rolling coefficient plus
    // axle-specific brake friction. Brakes therefore scale contact slip,
    // instead of adding a second pixel-space force with a different unit.
    let brakeShare = WORLD.vehicle.source.rearBrakeShare;
    if (front) brakeShare = WORLD.vehicle.source.frontBrakeShare;
    let handbrakeCoefficient = 0;
    if (!front) handbrakeCoefficient = handbrakeForce * Math.max(.1, physics?.brakeFriction ?? 1);
    const brakeCoefficient = brakePressure * Math.max(.1, physics?.brakeFriction ?? 1) * brakeShare + handbrakeCoefficient;
    let rollingStability = rearStability;
    if (front) rollingStability = 1;
    const rollingForce = -wheelLongitudinal * WORLD.tickRate * (WORLD.vehicle.source.wheelLongitudinalFriction + brakeCoefficient) * rollingStability;
    const lateralForce = -wheelLateral * WORLD.tickRate * axleGrip;
    if (grounded) addForce({
      x: wheelRight.x * lateralForce + wheelForward.x * rollingForce,
      y: wheelRight.y * lateralForce + wheelForward.y * rollingForce,
    }, point);
    let driveShare = 1 - driveFront;
    if (front) driveShare = driveFront;
    if (grounded && Math.abs(engineForce) > 0) addForce({ x: wheelForward.x * engineForce * driveShare, y: wheelForward.y * engineForce * driveShare }, point);
  };
  if (applyDrivetrainForces) {
    wheel(frontOffset, true); wheel(rearOffset, false);
  }
  // CarPhysics_B0 does not add a separate world-space rolling drag force here.
  // Longitudinal resistance comes from the authored wheel contact force and
  // the grounded stabilizer below.  Keeping a pixel-space drag term in this
  // layer makes the result depend on the browser unit scale and applies an
  // extra decay that the executable never performs.
  const yawDamping = WORLD.vehicle.angularDamping * rearStability;
  if (applyDrivetrainForces) totalTorque -= angular * yawDamping * vehicleMomentOfInertia(geometry.width ?? 36, geometry.height ?? 66, physics);
  const moment = vehicleMomentOfInertia(geometry.width ?? 36, geometry.height ?? 66, physics);
  vx += totalForce.x / mass * dt; vy += totalForce.y / mass * dt;
  let nextAngular = angular + totalTorque / moment * dt;
  if (Math.abs(longitudinal) < 2 && Math.hypot(vx, vy) < 3) nextAngular = 0;
  state.angularVelocity = nextAngular;
  const nextRotation = normalizeRotation(state.rotation + nextAngular * dt);
  // StabilizeVelocityAtSpeed_562910 evaluates the wheels in the post-turn
  // frame.  Preserve that source ordering even when the native body will own
  // the actual pose integration below.
  state.rotation = nextRotation;

  // StabilizeVelocityAtSpeed_562910 runs after the force integration. The
  // same helper is also used by unoccupied cars after a collision impulse.
  state.vx = vx; state.vy = vy; state.angularVelocity = nextAngular;
  stabilizeVehicleVelocity(state, dt, ground, !control.handbrake && !control.brake);
  vx = state.vx; vy = state.vy; nextAngular = state.angularVelocity;
  const turnedForward = directionFromRotation(nextRotation);
  const turnedRight = { x: Math.cos(nextRotation), y: Math.sin(nextRotation) };
  const nextLongitudinal = vx * turnedForward.x + vy * turnedForward.y;
  const nextLateral = vx * turnedRight.x + vy * turnedRight.y;
  if (advancePose) {
    state.x += vx * dt;
    state.y += vy * dt;
  }
  state.vx = vx;
  state.vy = vy;
  state.speed = vx * turnedForward.x + vy * turnedForward.y;
  state.throttle = throttle;
  state.brakePressure = brakePressure;
  state.handbrakeForce = handbrakeForce;

  // EnforceGearSensitiveMaxSpeed_562D00: sideways motion uses the gear-2 cap.
  const aligned = Math.abs(nextLateral) <= Math.max(2, Math.abs(nextLongitudinal) * .35);
  let cap = gciSpeedToWorld(physics?.gear2Speed ?? .107);
  if (aligned) {
    cap = maxForward;
    if (nextLongitudinal < 0) cap = maxReverse;
  }
  const actual = Math.hypot(vx, vy);
  if (actual > cap && actual > 1e-8) {
    const scale = cap / actual;
    state.vx = vx *= scale;
    state.vy = vy *= scale;
    state.speed = state.vx * turnedForward.x + state.vy * turnedForward.y;
  }
  if (!advancePose) state.rotation = previousRotation;
  return state;
}

/**
 * Integrate one source physics frame.  CarPhysics_B0 calculates wheel forces,
 * updates velocity, stabilizes and clamps it once per 33 ms frame.  Its eight
 * movement slices belong to the map collision sweep after this update; the
 * the world runtime's native physics body performs that sweep, so repeating drivetrain forces
 * here would accelerate the car multiple times per source frame.
 */
export function integrateVehicle(state: VehicleDynamicsState, control: SourceVehicleControl, physics: CarPhysics | undefined, dt: number, wheelBase?: number, geometry: VehicleGeometry = {}, ground: VehicleGroundContact = DEFAULT_VEHICLE_GROUND, options: VehicleIntegrationOptions = {}) {
  if (!(dt > 0)) return state;
  integrateVehicleSlice(state, control, physics, dt, wheelBase, geometry, ground, options);
  return state;
}

/**
 * GTA2's traffic spawner chooses a deterministic-looking upper bound from one
 * of three ranges based on `max_speed`. CarAI applies its separate cruise cap
 * in `trafficCruiseSpeedFor`; keep both source steps in one unit boundary so
 * traffic and vehicle exit share the same units.
 */
export function trafficSpeedFor(id: number, physics?: CarPhysics): number {
  if (!physics?.maxSpeed || physics.maxSpeed <= 0) {
    return tilesPerSecondToWorld(WORLD.traffic.baseSpeed + (Math.abs(id) % 3) * WORLD.traffic.speedStep);
  }
  const max = physics.maxSpeed;
  const [slow, medium, fast] = [WORLD.traffic.gciSpeedBands.slow, WORLD.traffic.gciSpeedBands.medium, WORLD.traffic.gciSpeedBands.fast];
  // Car_BC compares the raw Fix16 value with the lower edge of each band:
  // <0xCCC is slow, 0xCCC..0x1333 is medium, and >=0x1333 is fast.
  let band = slow;
  if (max >= medium[0]) band = medium;
  if (max >= fast[0]) band = fast;
  const [low, high] = band;
  // The game uses a random sample. A stable sample avoids network divergence
  // while retaining per-car variation in a deterministic world update.
  const sample = ((Math.abs(id * 37 + 17) % 101) / 100);
  return sourceFixedPerTickToWorld(low + (high - low) * sample);
}

/**
 * CarAI_78 stores the random spawner result as an upper bound, then cruises
 * at `min(0x3D7, field_74_max_speed)` in UpdateDrivingAI_452DF0. Keeping that
 * second source step separate prevents traffic from running at the GCI cap.
 */
export function trafficCruiseSpeedFor(id: number, physics?: CarPhysics): number {
  const authoredMaximum = trafficSpeedFor(id, physics);
  const defaultTarget = sourceFixedPerTickToWorld(WORLD.traffic.source.defaultTargetSpeed);
  return Math.min(defaultTarget, authoredMaximum);
}

