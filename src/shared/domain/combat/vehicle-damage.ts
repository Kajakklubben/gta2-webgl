import type { TrafficState, VehicleDamagePhase } from '../../protocol/types';
export { sourceDamageForFire, sourceDamageForImpact, sourceDamageForObjectModel, sourceDamageForWeapon } from './vehicle-damage-source';

/**
 * Damage constants recovered from Car_BC::AccumulateDamage_43DA90 and the
 * wreck helpers in the decompiled PC build.  Car_BC stores damage separately
 * from the visual damage bits, on a 0..32000 scale.  32001 is the post
 * explosion sentinel used by TurnToWreck/IsMaxDamage.
 */
export const GTA2_VEHICLE_DAMAGE = {
  smallFire: 16_000,
  largeFire: 25_000,
  prepareExplosion: 31_500,
  maxDamage: 32_000,
  destroyed: 32_001,
  wreckCountdownTicks: 50,
  wreckFireTicks: 300,
  healthScale: 320,
  /** CarPhysics_B0::ApplyImpactDamage multiplies the returned Fix16 impulse
   * by 200 before handing it to Car_BC::AccumulateDamage. */
  impactDamageMultiplier: 200,
} as const;

export interface VehicleDamageTransition {
  readonly applied: number;
  readonly previousDamage: number;
  readonly damage: number;
  readonly previousPhase: VehicleDamagePhase;
  readonly phase: VehicleDamagePhase;
  readonly damageLevel: number;
  readonly startedSmallFire: boolean;
  readonly startedLargeFire: boolean;
  readonly startedExplosion: boolean;
  readonly turnedToWreck: boolean;
  readonly fireExpired: boolean;
}

const clampDamage = (damage: number) => Math.max(0, Math.min(GTA2_VEHICLE_DAMAGE.destroyed, Math.round(damage)));

export function damageLevelFor(sourceDamage: number) {
  if (sourceDamage >= GTA2_VEHICLE_DAMAGE.maxDamage) return 4;
  if (sourceDamage >= GTA2_VEHICLE_DAMAGE.largeFire) return 4;
  if (sourceDamage >= GTA2_VEHICLE_DAMAGE.smallFire) return 3;
  if (sourceDamage > 0) return 1;
  return 0;
}

export function healthForVehicleDamage(sourceDamage: number) {
  const damage = Math.min(GTA2_VEHICLE_DAMAGE.maxDamage, clampDamage(sourceDamage));
  return Math.max(0, Math.ceil((GTA2_VEHICLE_DAMAGE.maxDamage - damage) / GTA2_VEHICLE_DAMAGE.healthScale));
}

export function vehicleDamageForHealth(health: number) {
  return clampDamage((100 - Math.max(0, Math.min(100, health))) * GTA2_VEHICLE_DAMAGE.healthScale);
}

export function phaseForVehicleDamage(sourceDamage: number, wrecked = false, wreckTimer?: number): VehicleDamagePhase {
  if (wrecked) return 'burned-out';
  if (sourceDamage >= GTA2_VEHICLE_DAMAGE.maxDamage || (sourceDamage >= GTA2_VEHICLE_DAMAGE.destroyed && wreckTimer !== undefined)) return 'exploding';
  if (sourceDamage >= GTA2_VEHICLE_DAMAGE.smallFire) return 'burning';
  if (sourceDamage > 0) return 'dented';
  return 'new';
}

/**
 * Fill the new fields when a client receives an older snapshot.  This keeps
 * the network migration additive while making the source damage machine
 * authoritative as soon as the object is touched by the server.
 */
export function ensureVehicleDamageState(vehicle: TrafficState) {
  // RepairDamage_43D400 resets the source accumulator.  Older snapshots and
  // the garage/debug tools represented that operation by writing health back
  // to 100, so accept that explicit positive-health reset even if the object
  // still carries the burned-out compatibility flag.
  if (vehicle.health > 0 && vehicle.damage !== undefined && vehicle.damage >= GTA2_VEHICLE_DAMAGE.maxDamage && vehicle.damagePhase !== 'new') {
    vehicle.wrecked = false;
    vehicle.damage = vehicleDamageForHealth(vehicle.health);
    vehicle.damagePhase = phaseForVehicleDamage(vehicle.damage);
    vehicle.damageLevel = damageLevelFor(vehicle.damage);
    vehicle.wreckTimer = undefined;
    vehicle.fireTicks = 0;
    if (vehicle.damagePhase === 'new') vehicle.aiState = undefined;
  }
  if (vehicle.damage === undefined || !Number.isFinite(vehicle.damage)) {
    if (vehicle.wrecked) vehicle.damage = GTA2_VEHICLE_DAMAGE.destroyed;
    else vehicle.damage = vehicleDamageForHealth(vehicle.health);
  }
  vehicle.damage = clampDamage(vehicle.damage);
  if (vehicle.wrecked) vehicle.damage = GTA2_VEHICLE_DAMAGE.destroyed;
  if (vehicle.damageLevel === undefined) vehicle.damageLevel = damageLevelFor(vehicle.damage);
  if (vehicle.damagePhase === undefined) vehicle.damagePhase = phaseForVehicleDamage(vehicle.damage, vehicle.wrecked, vehicle.wreckTimer);
  if (vehicle.damagePhase === 'exploding' && vehicle.wreckTimer === undefined) vehicle.wreckTimer = GTA2_VEHICLE_DAMAGE.wreckCountdownTicks;
  if (vehicle.damage >= GTA2_VEHICLE_DAMAGE.maxDamage) vehicle.health = 0;
  else vehicle.health = healthForVehicleDamage(vehicle.damage);
  return vehicle;
}

function transition(vehicle: TrafficState, previousDamage: number, previousPhase: VehicleDamagePhase, applied: number, flags: Partial<VehicleDamageTransition> = {}): VehicleDamageTransition {
  return {
    applied,
    previousDamage,
    damage: vehicle.damage ?? 0,
    previousPhase,
    phase: vehicle.damagePhase ?? 'new',
    damageLevel: vehicle.damageLevel ?? 0,
    startedSmallFire: flags.startedSmallFire ?? false,
    startedLargeFire: flags.startedLargeFire ?? false,
    startedExplosion: flags.startedExplosion ?? false,
    turnedToWreck: flags.turnedToWreck ?? false,
    fireExpired: flags.fireExpired ?? false,
  };
}

/**
 * Apply one source-scale damage packet and advance threshold transitions.
 *
 * `Car_BC::AccumulateDamage_43DA90` multiplies the object packet by the
 * model's fixed-point anti-strength before adding it to field_74_damage. A
 * zero anti-strength really is immunity: the original leaves the packet at
 * zero instead of forcing the minimum one-point fallback used for non-zero
 * strengths.
 */
export function applyVehicleSourceDamage(vehicle: TrafficState, sourceDamage: number, antiStrength = 1): VehicleDamageTransition {
  ensureVehicleDamageState(vehicle);
  const previousDamage = vehicle.damage ?? 0;
  const previousPhase = vehicle.damagePhase ?? phaseForVehicleDamage(previousDamage, vehicle.wrecked, vehicle.wreckTimer);
  if (!Number.isFinite(sourceDamage) || sourceDamage <= 0 || vehicle.wrecked || previousDamage >= GTA2_VEHICLE_DAMAGE.destroyed) {
    return transition(vehicle, previousDamage, previousPhase, 0);
  }
  let strength = 1;
  if (Number.isFinite(antiStrength)) strength = Math.max(0, antiStrength);
  const scaled = Math.floor(sourceDamage * strength);
  let applied = 0;
  if (scaled > 0) applied = scaled;
  else if (strength > 0) applied = 1;
  if (applied === 0) return transition(vehicle, previousDamage, previousPhase, 0);
  const nextDamage = Math.min(GTA2_VEHICLE_DAMAGE.maxDamage, previousDamage + applied);
  vehicle.damage = nextDamage;
  vehicle.health = healthForVehicleDamage(nextDamage);
  vehicle.damageLevel = damageLevelFor(nextDamage);
  const startedSmallFire = previousDamage < GTA2_VEHICLE_DAMAGE.smallFire && nextDamage >= GTA2_VEHICLE_DAMAGE.smallFire;
  const startedLargeFire = previousDamage < GTA2_VEHICLE_DAMAGE.largeFire && nextDamage >= GTA2_VEHICLE_DAMAGE.largeFire;
  const startedExplosion = previousDamage < GTA2_VEHICLE_DAMAGE.maxDamage && nextDamage >= GTA2_VEHICLE_DAMAGE.maxDamage;
  // PrepareForExplosion_43C1C0 is called from every packet at/above 31500,
  // before the eventual HandleCarExplosion call. In particular, brake lights
  // must not be left on by the runtime's generic stop helper.
  if (nextDamage >= GTA2_VEHICLE_DAMAGE.prepareExplosion) {
    vehicle.headlights = false;
    vehicle.emergencyLights = false;
    vehicle.brakeLights = false;
  }
  if (startedExplosion) {
    // HandleCarExplosion sets field_74_damage to 32001 after emitting the
    // explosion, while the 50-tick countdown still renders the live chassis.
    vehicle.damage = GTA2_VEHICLE_DAMAGE.destroyed;
    vehicle.health = 0;
    vehicle.damagePhase = 'exploding';
    vehicle.wreckTimer = vehicle.wreckTimer ?? GTA2_VEHICLE_DAMAGE.wreckCountdownTicks;
    vehicle.aiState = 'stuck';
  } else {
    vehicle.damagePhase = phaseForVehicleDamage(nextDamage, false, vehicle.wreckTimer);
  }
  return transition(vehicle, previousDamage, previousPhase, applied, { startedSmallFire, startedLargeFire, startedExplosion });
}

/** Advance the source 50-tick wreck countdown and the finite wreck fire. */
export function tickVehicleDamage(vehicle: TrafficState): VehicleDamageTransition {
  ensureVehicleDamageState(vehicle);
  const previousDamage = vehicle.damage ?? 0;
  const previousPhase = vehicle.damagePhase ?? 'new';
  if (vehicle.damagePhase === 'exploding') {
    vehicle.wreckTimer = Math.max(0, (vehicle.wreckTimer ?? GTA2_VEHICLE_DAMAGE.wreckCountdownTicks) - 1);
    if (vehicle.wreckTimer === 0) {
      vehicle.wrecked = true;
      vehicle.damage = GTA2_VEHICLE_DAMAGE.destroyed;
      vehicle.health = 0;
      vehicle.damageLevel = 4;
      vehicle.damagePhase = 'burned-out';
      vehicle.aiState = 'wrecked';
      vehicle.vx = 0;
      vehicle.vy = 0;
      vehicle.speed = 0;
      vehicle.angularVelocity = 0;
      vehicle.fireTicks = vehicle.fireTicks ?? GTA2_VEHICLE_DAMAGE.wreckFireTicks;
      return transition(vehicle, previousDamage, previousPhase, 0, { turnedToWreck: true });
    }
    return transition(vehicle, previousDamage, previousPhase, 0);
  }
  if (vehicle.damagePhase === 'burned-out' && vehicle.fireTicks !== undefined && vehicle.fireTicks > 0) {
    vehicle.fireTicks--;
    return transition(vehicle, previousDamage, previousPhase, 0, { fireExpired: vehicle.fireTicks === 0 });
  }
  return transition(vehicle, previousDamage, previousPhase, 0);
}

/**
 * Source object packets accepted by Car_BC::HandleCarHitByObject_43F130.
 *
 * The caller emits one packet per source object.  In particular, a shotgun
 * fires five model-192 objects, so this function must return the per-pellet
 * packet instead of multiplying it by the weapon's pellet count.
 */
