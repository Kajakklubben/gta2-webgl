import type { WeaponDefinition } from './weapons';
import { GTA2_SOURCE_OBJECT_MODELS } from '../world/gta2-sprites';
import { WORLD } from '../world/world';
import { GTA2_VEHICLE_DAMAGE } from './vehicle-damage';

export function sourceDamageForObjectModel(model: number | undefined) {
  switch (model) {
    case GTA2_SOURCE_OBJECT_MODELS.rocketBullet: // rocket_bullet
    case GTA2_SOURCE_OBJECT_MODELS.movingMolotov: // moving_molotov
    case GTA2_SOURCE_OBJECT_MODELS.movingCarBomb: // moving_collect_36_132
    case GTA2_SOURCE_OBJECT_MODELS.carMine: // mine_10
      return GTA2_VEHICLE_DAMAGE.maxDamage;
    case GTA2_SOURCE_OBJECT_MODELS.grenade: // grenade; Car_BC falls through to the default packet
      return 800;
    case GTA2_SOURCE_OBJECT_MODELS.fireHitting: // fire_hitting (the source keeps this impact model separate)
      return 100;
    case GTA2_SOURCE_OBJECT_MODELS.pistolBullet: // pistol_bullet
      return 1_600;
    case GTA2_SOURCE_OBJECT_MODELS.machineGunBullet: // machine_gun_bullet and silenced gun
    case GTA2_SOURCE_OBJECT_MODELS.shotgunBullet: // shotgun_bullet; one packet per pellet
      return 800;
    case GTA2_SOURCE_OBJECT_MODELS.oilSlick: // oil_stain is a grip hazard, not a direct damage packet
    case GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire: // flamethrower_fire stream segment
    case GTA2_SOURCE_OBJECT_MODELS.explosiveImpact: // explosive impact child
    case GTA2_SOURCE_OBJECT_MODELS.tankTopImpact: // tanktop/shotgun impact child
    case GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact: // flamethrower impact child
    case GTA2_SOURCE_OBJECT_MODELS.bulletOnFire: // maybe_bullet_on_fire; cleans attachments only
    case GTA2_SOURCE_OBJECT_MODELS.impactChild: // source impact child
    case GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet: // electrobaton_bullet is not a car damage packet
      return 0;
    default:
      // The source default branch is an 800-unit packet.  Unknown custom
      // definitions should therefore remain deterministic and source-shaped.
      return 800;
  }
}

/** Source object model used by a weapon's direct car-hit path. */
export function sourceDamageForWeapon(weapon: Pick<WeaponDefinition, 'sourceModel' | 'kind' | 'damage' | 'pellets'>) {
  // Weapon_30::shocker_5E06B0 handles cars in its recursive beam path and
  // calls AccumulateDamage(300) directly. Its visual model is 154, which is
  // deliberately non-damaging in Car_BC's ordinary object switch, so this
  // weapon-specific packet must be resolved before that switch.
  if (weapon.kind === 'stun') return 300;
  return sourceDamageForObjectModel(weapon.sourceModel);
}

/**
 * Convert a runtime collision speed to the source damage scale.
 *
 * The decompiled path does not use a health-style `(speed - threshold)`
 * curve. `ComputeLineLineIntersection_55F3B0` returns an impulse in map
 * units, `ApplyImpactDamage_43D5D0` multiplies it by 200, and mass is part of
 * the impulse. Runtime speed is pixels/second, so one source unit/tick is
 * `WORLD.tileSize * WORLD.tickRate` pixels/second.
 */
export function sourceDamageForImpact(closingSpeed: number, mass = 1) {
  if (!Number.isFinite(closingSpeed) || closingSpeed <= 0 || !Number.isFinite(mass) || mass <= 0) return 0;
  const sourceSpeed = closingSpeed / (WORLD.tileSize * WORLD.tickRate);
  const impulse = sourceSpeed * mass;
  return Math.max(0, Math.floor(impulse * GTA2_VEHICLE_DAMAGE.impactDamageMultiplier));
}

export function sourceDamageForFire(multiplier = 1) {
  return Math.max(1, Math.round(100 * Math.max(0, multiplier)));
}
