import { describe, expect, it } from 'vitest';
import { directionFromRotation, moveAlongHeading, moveTowardTarget, rotationFromDirection } from '../../shared/domain/physics/motion-vector';
import { applyForceAtPoint, applyVehicleImpulse, computeEngineTorque, computePointVelocity, vehicleCenterOfMassOffset, vehicleForwardSpeed, vehicleMass, vehicleMomentOfInertia, vehicleSteeringScale, vehicleThrust, vehicleTurnRate } from '../../shared/domain/physics/vehicle-kinematics';
import { integrateVehicle } from '../../shared/domain/physics/vehicle-integration';
import { trafficCruiseSpeedFor, trafficSpeedFor } from '../../shared/domain/physics/vehicle-integration';
import { projectileTravelTicks, WEAPONS } from '../../shared/domain/combat/weapons';
import { WORLD } from '../../shared/domain/world/world';

describe('shared world motion', () => {
  it('uses one heading convention for movement and rotation', () => {
    const direction = directionFromRotation(Math.PI / 2);
    expect(direction.x).toBeCloseTo(-1);
    expect(direction.y).toBeCloseTo(0);
    expect(rotationFromDirection(direction.x, direction.y)).toBeCloseTo(Math.PI / 2);
    expect(moveAlongHeading({ x: 10, y: 20 }, Math.PI / 2, 30, 1 / WORLD.tickRate)).toMatchObject({ x: 9, y: 20, vx: -30 });
  });

  it('derives route heading from the displacement actually made', () => {
    const movement = moveTowardTarget({ x: 0, y: 0 }, { x: 100, y: 0 }, 30, 1 / WORLD.tickRate);
    expect(movement.dx).toBeCloseTo(1);
    expect(movement.dy).toBeCloseTo(0);
    expect(rotationFromDirection(movement.dx, movement.dy)).toBeCloseTo(Math.PI * 1.5);
  });

  it('keeps turn curvature tied to vehicle speed', () => {
    expect(vehicleTurnRate(0)).toBe(WORLD.vehicle.lowSpeedTurnRate);
    expect(vehicleTurnRate(260)).toBeCloseTo(260 / WORLD.vehicle.turnRadius);
    expect(vehicleTurnRate(1000)).toBe(WORLD.vehicle.maxTurnRate);
  });

  it('uses foot braking before selecting reverse', () => {
    const state = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    for (let tick = 0; tick < 45; tick++) integrateVehicle(state, { throttle: 1, steer: 0 }, undefined, 1 / WORLD.tickRate);
    const forwardSpeed = state.speed;
    expect(forwardSpeed).toBeGreaterThan(0);
    for (let tick = 0; tick < 12; tick++) integrateVehicle(state, { throttle: 0, steer: 0, brake: true }, undefined, 1 / WORLD.tickRate);
    expect(state.speed).toBeGreaterThanOrEqual(0);
    expect(state.speed).toBeLessThan(forwardSpeed);
    for (let tick = 0; tick < 35; tick++) integrateVehicle(state, { throttle: -1, steer: 0 }, undefined, 1 / WORLD.tickRate);
    expect(state.speed).toBeLessThan(0);
  });

  it('does not spin a stationary car and keeps turning velocity aligned', () => {
    const parked = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    for (let tick = 0; tick < 30; tick++) integrateVehicle(parked, { throttle: 0, steer: 1 }, undefined, 1 / WORLD.tickRate);
    expect(parked.rotation).toBeCloseTo(0, 5);

    const moving = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    for (let tick = 0; tick < 45; tick++) integrateVehicle(moving, { throttle: 1, steer: 0 }, undefined, 1 / WORLD.tickRate);
    for (let tick = 0; tick < 20; tick++) integrateVehicle(moving, { throttle: 1, steer: 1 }, undefined, 1 / WORLD.tickRate);
    const forward = directionFromRotation(moving.rotation), speed = Math.hypot(moving.vx!, moving.vy!);
    expect((moving.vx! * forward.x + moving.vy! * forward.y) / speed).toBeGreaterThan(.9);
  });

  it('derives projectile travel time from range and world speed', () => {
    expect(projectileTravelTicks(0)).toBe(Math.ceil(WEAPONS[0]!.range / (WORLD.projectile.bulletSpeed * WORLD.tileSize) * WORLD.tickRate));
    expect(projectileTravelTicks(8)).toBeGreaterThan(36);
  });

  it('keeps AI traffic inside the decompiled GCI speed band', () => {
    const speed = trafficSpeedFor(0, { model: 0, name: 'Romero', maxSpeed: 0.245 });
    expect(speed).toBeGreaterThanOrEqual(WORLD.traffic.gciSpeedBands.medium[0] * WORLD.vehicle.gciSpeedScale * WORLD.tileSize);
    expect(speed).toBeLessThanOrEqual(WORLD.traffic.gciSpeedBands.medium[1] * WORLD.vehicle.gciSpeedScale * WORLD.tileSize);
    expect(speed).toBeGreaterThan(WORLD.player.walkSpeed * WORLD.tileSize);
  });

  it('applies the source AI cruise cap after the random traffic band', () => {
    const speed = trafficCruiseSpeedFor(0, { model: 0, name: 'Romero', maxSpeed: 0.245 });
    expect(speed).toBeCloseTo(WORLD.traffic.source.defaultTargetSpeed * WORLD.tileSize * WORLD.tickRate);
    const slow = trafficCruiseSpeedFor(0, { model: 0, name: 'slow', maxSpeed: 0.03 });
    expect(slow).toBeLessThanOrEqual(speed);
  });

  it('uses the source mass conversion and turbo thrust flag', () => {
    expect(vehicleMass({ model: 0, name: 'light', mass: 10 })).toBeCloseTo(11);
    expect(vehicleThrust({ model: 0, name: 'normal', thrust: .2, turbo: 0 })).toBeCloseTo(.3);
    expect(vehicleThrust({ model: 0, name: 'turbo', thrust: .2, turbo: 1 })).toBeCloseTo(.4);
  });

  it('uses the source front/rear mass distribution for centre of mass and inertia', () => {
    const physics = { model: 0, name: 'front-heavy', mass: 10, frontMassBias: .75 };
    expect(vehicleCenterOfMassOffset(64, physics)).toBeCloseTo(8);
    // This is ComputeCarMassAndInertia_454410 with pixel dimensions. The
    // source's /64 conversion cancels because runtime forces and points are
    // converted back to pixels before the angular acceleration is applied.
    expect(vehicleMomentOfInertia(32, 64, physics)).toBeCloseTo(3989.333333, 3);
  });

  it('removes wheel drive while airborne and applies source slope gravity', () => {
    const airborne = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    integrateVehicle(airborne, { throttle: 1, steer: 0 }, undefined, 1 / WORLD.tickRate, undefined, {}, { grounded: false, surfaceType: 6 });
    expect(airborne.speed).toBeCloseTo(0);
    const downhill = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    integrateVehicle(downhill, { throttle: 0, steer: 0 }, undefined, 1 / WORLD.tickRate, undefined, {}, { grounded: true, surfaceType: 1, slopeLength: 1, slopeDirection: { x: 0, y: 1 } });
    expect(downhill.speed).toBeGreaterThan(0);
  });

  it('uses the source gas-pedal ramp and gear torque curve', () => {
    const physics = { model: 0, name: 'source car', mass: 10, thrust: .2, maxSpeed: .5, gear1Multiplier: 1, turbo: 0 };
    const state = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    for (let tick = 0; tick < 4; tick++) integrateVehicle(state, { throttle: 1, steer: 0 }, physics, 1 / WORLD.tickRate);
    expect(state.throttle).toBeCloseTo(.2);
    for (let tick = 4; tick < 20; tick++) integrateVehicle(state, { throttle: 1, steer: 0 }, physics, 1 / WORLD.tickRate);
    expect(state.throttle).toBeCloseTo(1);
    // A normalized pedal value of .2 is one source pedal unit: half thrust
    // plus one fifth thrust, before the gear multiplier is applied.
    expect(computeEngineTorque(0, .2, physics) / WORLD.vehicle.gciAccelerationScale).toBeCloseTo(.14);
  });

  it('uses the source steering ratio and player speed falloff', () => {
    const physics = { model: 0, name: 'source car', turnRatio: .45 };
    const angleScale = WORLD.vehicle.source.steeringAngleScale;
    const topOfPlayerCurve = .45 * WORLD.vehicle.source.steeringMinimumFactor /
      (WORLD.vehicle.source.steeringSpeedSquared * WORLD.vehicle.source.steeringReferenceScale) * angleScale;
    expect(vehicleSteeringScale(0, physics)).toBeCloseTo(.45 / WORLD.vehicle.source.steeringReferenceScale * angleScale);
    expect(vehicleSteeringScale(0, physics, true)).toBeCloseTo(.45 * angleScale);
    expect(vehicleSteeringScale(100000, physics)).toBeCloseTo(topOfPlayerCurve);
  });

  it('converts GCI fixed-tick speed into runtime pixels per second', () => {
    expect(vehicleForwardSpeed({ model: 0, name: 'Romero', maxSpeed: .245 }))
      .toBeCloseTo(.245 * WORLD.tickRate * WORLD.tileSize);
  });

  it('matches the source car acceleration at one physics frame per tick', () => {
    const physics = {
      model: 0, name: 'Romero', mass: 16.5, thrust: .152, maxSpeed: .245,
      frontDriveBias: 1, frontMassBias: .5, turnIn: .145, turnRatio: .45,
      rearEndStability: 1.25, brakeFriction: 1.75, antiStrength: 1,
      gear1Multiplier: .55, gear2Multiplier: .68, gear3Multiplier: 1,
      gear2Speed: .107, gear3Speed: .165, turbo: 0,
    };
    const state = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    for (let tick = 0; tick < 40; tick++) integrateVehicle(state, { throttle: 1, steer: 0, ai: true }, physics, 1 / WORLD.tickRate);
    // Both authored axle contacts apply the source rolling coefficient, and
    // the first few ticks use the source near-zero .9 stabilizer branch.
    // Romero is therefore about .118 map units/frame after 40 source ticks.
    expect(state.speed / (WORLD.tileSize * WORLD.tickRate)).toBeCloseTo(.1177, 3);
    for (let tick = 40; tick < 150; tick++) integrateVehicle(state, { throttle: 1, steer: 0, ai: true }, physics, 1 / WORLD.tickRate);
    expect(state.speed).toBeCloseTo(vehicleForwardSpeed(physics), 5);
  });

  it('makes heavier cars accelerate more slowly with the same authored thrust', () => {
    const light = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    const heavy = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    const base = { model: 0, name: 'car', thrust: .2, maxSpeed: .4 };
    integrateVehicle(light, { throttle: 1, steer: 0 }, { ...base, mass: 8 }, 1 / WORLD.tickRate);
    integrateVehicle(heavy, { throttle: 1, steer: 0 }, { ...base, mass: 24 }, 1 / WORLD.tickRate);
    expect(light.speed).toBeGreaterThan(heavy.speed);
  });

  it('uses point velocity and force torque at the wheel contact', () => {
    expect(computePointVelocity({ x: 10, y: 0 }, 2, { x: 0, y: 5 })).toEqual({ x: 0, y: 0 });
    expect(applyForceAtPoint({ x: 0, y: 10 }, { x: 4, y: 0 }).torque).toBeCloseTo(40);
  });

  it('applies a mass-weighted contact impulse and yaw response', () => {
    const state = { x: 0, y: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 0, handbrakeForce: 0 };
    applyVehicleImpulse(state, { x: 110, y: 0 }, { x: 0, y: 20 }, { width: 32, height: 64 }, { model: 0, name: 'test', mass: 10 });
    expect(state.vx).toBeCloseTo(10);
    expect(state.angularVelocity).toBeLessThan(0);
  });
});

