import { describe, expect, it } from 'vitest';
import type { TrafficState } from '../../shared/protocol/types';
import { GTA2_VEHICLE_DAMAGE, applyVehicleSourceDamage, ensureVehicleDamageState, sourceDamageForImpact, sourceDamageForObjectModel, sourceDamageForWeapon, tickVehicleDamage } from '../../shared/domain/combat/vehicle-damage';
import { vehicleDamageSpeedFactor } from '../../shared/domain/physics/vehicle-kinematics';
import { GTA2_CAR_FIRE_SPRITES, resolveWreckModel } from '../../shared/domain/world/gta2-sprites';
import { VehicleDamageState } from '../../shared/game/gameobjects/vehicle/vehicle-damage';

function vehicle(overrides: Partial<TrafficState> = {}): TrafficState {
  return {
    id: 1, x: 0, y: 0, z: 0, rotation: 0, speed: 0, color: 0xffffff,
    passengers: [], occupants: [], doorStates: [], health: 100, model: 0,
    ...overrides,
    vx: overrides.vx ?? 0, vy: overrides.vy ?? 0, angularVelocity: overrides.angularVelocity ?? 0,
    throttle: overrides.throttle ?? 0, brakePressure: overrides.brakePressure ?? 1, handbrakeForce: overrides.handbrakeForce ?? 0,
  };
}

describe('source vehicle damage lifecycle', () => {
  it('keeps a new car pristine and turns a source packet into a dent', () => {
    const state = vehicle();
    ensureVehicleDamageState(state);
    expect(state.damage).toBe(0);
    expect(state.damagePhase).toBe('new');

    const result = applyVehicleSourceDamage(state, 1_600);
    expect(result.applied).toBe(1_600);
    expect(state.damage).toBe(1_600);
    expect(state.health).toBe(95);
    expect(state.damagePhase).toBe('dented');
    expect(result.startedSmallFire).toBe(false);
  });

  it('uses the decompiled fire thresholds before explosion', () => {
    const state = vehicle();
    const small = applyVehicleSourceDamage(state, GTA2_VEHICLE_DAMAGE.smallFire);
    expect(small.startedSmallFire).toBe(true);
    expect(state.damagePhase).toBe('burning');
    expect(state.health).toBe(50);

    const large = applyVehicleSourceDamage(state, GTA2_VEHICLE_DAMAGE.largeFire - GTA2_VEHICLE_DAMAGE.smallFire);
    expect(large.startedLargeFire).toBe(true);
    expect(state.damageLevel).toBe(4);
    expect(state.damagePhase).toBe('burning');
  });

  it('matches the source speed limiter and prepares the car before exploding', () => {
    expect(vehicleDamageSpeedFactor(15_999)).toBe(1);
    expect(vehicleDamageSpeedFactor(16_000)).toBeCloseTo(16_001 / 16_000);
    expect(vehicleDamageSpeedFactor(25_000)).toBeCloseTo(7_001 / 16_000);
    expect(vehicleDamageSpeedFactor(32_001)).toBe(0);

    const state = vehicle({ headlights: true, emergencyLights: true, brakeLights: true });
    applyVehicleSourceDamage(state, GTA2_VEHICLE_DAMAGE.prepareExplosion);
    expect(state.headlights).toBe(false);
    expect(state.emergencyLights).toBe(false);
    expect(state.brakeLights).toBe(false);
  });

  it('converts wall impulse speed to a source-sized damage packet', () => {
    expect(sourceDamageForImpact(0, 11)).toBe(0);
    expect(sourceDamageForImpact(64 * 30, 11)).toBe(2_200);
  });

  it('starts the 50-tick explosion countdown and then swaps to the wreck', () => {
    const state = vehicle();
    const explosion = applyVehicleSourceDamage(state, GTA2_VEHICLE_DAMAGE.maxDamage);
    expect(explosion.startedExplosion).toBe(true);
    expect(state.damage).toBe(GTA2_VEHICLE_DAMAGE.destroyed);
    expect(state.damagePhase).toBe('exploding');
    expect(state.wreckTimer).toBe(GTA2_VEHICLE_DAMAGE.wreckCountdownTicks);
    expect(state.wrecked).toBeUndefined();

    for (let tick = 0; tick < GTA2_VEHICLE_DAMAGE.wreckCountdownTicks - 1; tick++) {
      expect(tickVehicleDamage(state).turnedToWreck).toBe(false);
    }
    const wreck = tickVehicleDamage(state);
    expect(wreck.turnedToWreck).toBe(true);
    expect(state.wrecked).toBe(true);
    expect(state.damagePhase).toBe('burned-out');
    expect(state.fireTicks).toBe(GTA2_VEHICLE_DAMAGE.wreckFireTicks);

    for (let tick = 0; tick < GTA2_VEHICLE_DAMAGE.wreckFireTicks - 1; tick++) tickVehicleDamage(state);
    expect(tickVehicleDamage(state).fireExpired).toBe(true);
    expect(state.damagePhase).toBe('burned-out');
  });

  it('maps authored object models to the source damage packets', () => {
    expect(sourceDamageForWeapon({ sourceModel: 265, kind: 'bullet', damage: 25, pellets: 1 })).toBe(1_600);
    expect(sourceDamageForWeapon({ sourceModel: 254, kind: 'bullet', damage: 10, pellets: 1 })).toBe(800);
    expect(sourceDamageForWeapon({ sourceModel: 128, kind: 'rocket', damage: 100, pellets: 1 })).toBe(32_000);
    expect(sourceDamageForWeapon({ sourceModel: 10, kind: 'mine', damage: 90, pellets: 1 })).toBe(32_000);
    expect(sourceDamageForObjectModel(183)).toBe(800);
    expect(sourceDamageForWeapon({ sourceModel: 154, kind: 'flame', damage: 7, pellets: 1 })).toBe(0);
    expect(sourceDamageForObjectModel(194)).toBe(100);
    expect(sourceDamageForObjectModel(192)).toBe(800);
    // Five shotgun objects are five separate source packets, not one packet
    // multiplied by the weapon's pellet count.
    expect(sourceDamageForWeapon({ sourceModel: 192, kind: 'bullet', damage: 16, pellets: 5 })).toBe(800);
    expect(sourceDamageForWeapon({ sourceModel: 8, kind: 'slick', damage: 0, pellets: 1 })).toBe(0);
  });

  it('marks the quadrant at the actual bullet impact point', () => {
    const state = vehicle();
    const damage = new VehicleDamageState(state);

    damage.receive(1_600, -32, -32);
    expect(state.damageMask).toBe(1 << 1);

    const otherState = vehicle();
    new VehicleDamageState(otherState).receive(1_600, 32, 32);
    expect(otherState.damageMask).toBe(1 << 3);
  });

  it('applies the authored anti-strength before reaching thresholds', () => {
    const resistant = vehicle();
    const result = applyVehicleSourceDamage(resistant, GTA2_VEHICLE_DAMAGE.smallFire, .5);
    expect(result.applied).toBe(GTA2_VEHICLE_DAMAGE.smallFire / 2);
    expect(resistant.damagePhase).toBe('dented');

    const immune = vehicle();
    expect(applyVehicleSourceDamage(immune, GTA2_VEHICLE_DAMAGE.maxDamage, 0).applied).toBe(0);
    expect(immune.damage).toBe(0);
    expect(immune.damagePhase).toBe('new');
  });

  it('resolves the source fire and wreck code-object models', () => {
    expect(GTA2_CAR_FIRE_SPRITES.small.start).toBe(12);
    expect(GTA2_CAR_FIRE_SPRITES.large.start).toBe(13);
    expect(GTA2_CAR_FIRE_SPRITES.wreck.start).toBe(4);
    expect(resolveWreckModel(0)).toBe(72);
    expect(resolveWreckModel(8)).toBe(80);
    expect(resolveWreckModel(80)).toBe(80);
  });
});
