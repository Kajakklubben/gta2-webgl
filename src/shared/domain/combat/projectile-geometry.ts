import { GTA2_SOURCE_OBJECT_MODELS } from '../world/gta2-sprites';

/**
 * The source allocates a collision shape from the launched Object_2C
 * definition, rather than using one radius for every projectile.  The
 * browser simulation keeps the same distinction in world-pixel units.  The
 * source objects are all effectively round for the gameplay probe, so a
 * swept circle is the stable equivalent of their authored box footprint.
 */
export interface ProjectileCollisionGeometry {
  readonly radius: number;
  /** Vertical half extent used when selecting a target on another floor. */
  readonly halfHeight: number;
}

const SMALL_BULLET: ProjectileCollisionGeometry = { radius: 2, halfHeight: 1 };
const SHOTGUN: ProjectileCollisionGeometry = { radius: 4, halfHeight: 2 };
const GRENADE: ProjectileCollisionGeometry = { radius: 5, halfHeight: 2 };
const MOLOTOV: ProjectileCollisionGeometry = { radius: 6, halfHeight: 2 };
const ROCKET: ProjectileCollisionGeometry = { radius: 7, halfHeight: 2 };
const FLAME: ProjectileCollisionGeometry = { radius: 8, halfHeight: 2 };

/** Authored projectile footprints keyed by the concrete source object model. */
export const GTA2_PROJECTILE_COLLISION_GEOMETRY: Readonly<Record<number, ProjectileCollisionGeometry>> = {
  [GTA2_SOURCE_OBJECT_MODELS.rocketBullet]: ROCKET,
  [GTA2_SOURCE_OBJECT_MODELS.movingMolotov]: MOLOTOV,
  [GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire]: FLAME,
  [GTA2_SOURCE_OBJECT_MODELS.explosiveImpact]: GRENADE,
  [GTA2_SOURCE_OBJECT_MODELS.grenade]: GRENADE,
  [GTA2_SOURCE_OBJECT_MODELS.shotgunBullet]: SHOTGUN,
  [GTA2_SOURCE_OBJECT_MODELS.fireHitting]: FLAME,
  [GTA2_SOURCE_OBJECT_MODELS.tankTopImpact]: ROCKET,
  [GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact]: FLAME,
  [GTA2_SOURCE_OBJECT_MODELS.pedFire]: FLAME,
  [GTA2_SOURCE_OBJECT_MODELS.bulletOnFire]: SMALL_BULLET,
  [GTA2_SOURCE_OBJECT_MODELS.impactChild]: SMALL_BULLET,
  [GTA2_SOURCE_OBJECT_MODELS.machineGunBullet]: SMALL_BULLET,
  [GTA2_SOURCE_OBJECT_MODELS.pistolBullet]: SMALL_BULLET,
  [GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet]: SHOTGUN,
  [GTA2_SOURCE_OBJECT_MODELS.movingCarBomb]: GRENADE,
};

const DEFAULT_PROJECTILE_GEOMETRY: ProjectileCollisionGeometry = { radius: 4, halfHeight: 2 };

export function projectileCollisionGeometry(sourceModel: number | undefined): ProjectileCollisionGeometry {
  return (sourceModel === undefined ? undefined : GTA2_PROJECTILE_COLLISION_GEOMETRY[sourceModel]) ?? DEFAULT_PROJECTILE_GEOMETRY;
}
