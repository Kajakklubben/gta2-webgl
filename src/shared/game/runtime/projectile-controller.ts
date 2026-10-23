import type { PlayerState } from '../../protocol/types';
import { createProjectileObject, projectileTypeForWeapon, type ProjectileObject, type ProjectileStateInput } from '../effects/projectile';
import type { CollisionBody, CollisionQuery } from '../physics/collision-world';
import { mapFixtureMatches } from '../physics/map-fixtures';
import type { MapWallFixtureData } from '../physics/map-fixtures';
import { segmentPointDistanceSquared } from './helpers';
import { directionFromRotation } from '../../domain/physics/motion-vector';
import { tilesPerSecondToWorld, WORLD } from '../../domain/world/world';
import type { WeaponSystem } from '../../domain/combat/weapon-system';
import type { WeaponRayActor } from '../../domain/combat/weapon-raycaster';
import { GTA2_SOURCE_OBJECT_MODELS, GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../domain/world/gta2-sprites';
import type { HazardState } from '../../protocol/types';
import type { SurfaceResult } from '../../domain/physics/map-surface';
import { projectileCollisionGeometry } from '../../domain/combat/projectile-geometry';

export interface ProjectileWallHit {
  readonly fraction: number;
  readonly fixture?: unknown;
}

/** Object_5C::GetExplosionTypeForWallSide_528E00. */
export function explosionTypeForWallSide(wallSide: number) {
  switch (wallSide) {
    case 0: return 18;
    case 1: return 23;
    case 2: return 22;
    case 4: return 25;
    default: return 24;
  }
}

/** Object_5C::GetExplosionSideFromDiagonalWall_528D80. */
export function explosionTypeForDiagonalWall(slopeType: number) {
  return slopeType === 46 || slopeType === 48 ? 22 : 23;
}

function projectileWallImpact(rotation: number, fixture: unknown) {
  const candidate = fixture as { getUserData?: () => unknown } | undefined;
  const data = candidate?.getUserData?.() as MapWallFixtureData | undefined;
  if (!data || data.kind !== 'map-wall') return undefined;
  if (data.diagonalExplosionType !== undefined) return { explosionType: data.diagonalExplosionType };
  if (data.orientation === undefined) return undefined;
  const angle = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const wallSide = data.orientation === 'horizontal'
    ? (angle >= Math.PI * 1.5 || angle <= Math.PI * .5 ? 3 : 4)
    : (angle >= Math.PI ? 2 : 1);
  return { wallSide, explosionType: explosionTypeForWallSide(wallSide) };
}

export type ProjectileSpawnResult = ProjectileObject;

export interface ProjectileControllerContext {
  readonly weaponSystem: WeaponSystem;
  readonly projectiles: () => readonly ProjectileObject[];
  readonly physicsWorld: {
    rayCast: (start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean) => number;
    rayCastHit?: (start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean) => ProjectileWallHit | undefined;
    queryCircle: (query: CollisionQuery) => CollisionBody[];
  };
  readonly tick: () => number;
  readonly register: (object: ProjectileObject) => void;
  /** Source Car_BC ignores an object hitting the same driver's chassis. */
  readonly ownerVehicleId?: (actor: string) => number | undefined;
  readonly isWaterAt?: (point: { x: number; y: number; z: number }) => boolean;
  readonly spawnEffect?: (effect: Omit<HazardState, 'id'>) => void;
  readonly surfaceAt?: (point: { x: number; y: number; z: number }) => SurfaceResult;
}

/** Owns creation and swept movement collision for source Object_2C projectiles.
 * Damage and explosion consequences stay in GameWorld because they query
 * every gameplay entity and emit authoritative world events. */
export class ProjectileController {
  constructor(readonly context: ProjectileControllerContext) {}

  spawnVisual(actor: WeaponRayActor | PlayerState, weaponId: number, originX: number, originY: number, z: number, angle: number, distance: number, explosive = false, collision = true, sourceModelOverride?: number): ProjectileSpawnResult {
    const weapon = this.context.weaponSystem.get(weaponId);
    if (!Number.isFinite(distance) || distance <= 0.5) throw new RangeError(`Projectile distance must be greater than 0.5, received ${distance}`);
    let speed = tilesPerSecondToWorld(WORLD.projectile.bulletSpeed);
    if (weapon.kind === 'shock') speed = tilesPerSecondToWorld(WORLD.projectile.electroSpeed);
    else if (weapon.sourceModel === GTA2_SOURCE_OBJECT_MODELS.shotgunBullet || weapon.kind === 'rocket') speed = tilesPerSecondToWorld(WORLD.projectile.rocketSpeed);
    else if (weapon.kind === 'explosive') speed = tilesPerSecondToWorld(WORLD.projectile.thrownSpeed);
    else if (weapon.kind === 'flame') speed = tilesPerSecondToWorld(WORLD.projectile.flameSpeed);
    const direction = directionFromRotation(angle);
    const sourceModel = sourceModelOverride ?? weapon.sourceModel;
    const life = Math.max(WORLD.projectile.minimumTravelTicks, Math.ceil(distance / Math.max(1, speed) * WORLD.tickRate));
    const projectileType = projectileTypeForWeapon(weaponId);
    const pending: ProjectileStateInput = {
      actor: actor.id, weapon: weaponId, x: originX, y: originY,
      endX: originX + direction.x * distance, endY: originY + direction.y * distance,
      z, life, rotation: angle, vx: direction.x * speed + actor.vx, vy: direction.y * speed + actor.vy,
      // The override is used by mounted/source-specific dispatch. Collision
      // must follow the concrete object model actually launched, not the
      // weapon slot's default model.
      explosive, collision: collision && typeof sourceModel === 'number', projectileType,
      waterDeath: weapon.waterDeath ?? false,
    };
    if (typeof sourceModel === 'number') pending.sourceModel = sourceModel;
    const object = createProjectileObject(`${actor.id}:${this.context.tick()}:${this.context.projectiles().length}`, pending);
    this.context.register(object);
    return object;
  }

  resolveCollisions() {
    for (const object of this.context.projectiles()) {
      const projectile = object.state;
      if (projectile.destroyedByWater || projectile.impact) continue;
      if (!projectile.collision) continue;
      const previousX = projectile.prevX, previousY = projectile.prevY;
      const dx = projectile.x - previousX, dy = projectile.y - previousY;
      // Object_2C::CheckWaterDeath runs after movement, including for a
      // projectile whose planar movement is effectively zero this tick.
      if (projectile.waterDeath && this.context.isWaterAt?.({ x: projectile.x, y: projectile.y, z: projectile.z })) {
        object.markWaterDeath();
        this.context.spawnEffect?.({
          x: projectile.x, y: projectile.y, z: projectile.z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS,
          owner: projectile.actor, rotation: projectile.rotation, scale: .8,
        });
        continue;
      }
      if (Math.hypot(dx, dy) < 1e-6) continue;
      const wallHit = this.context.physicsWorld.rayCastHit?.(
        { x: previousX, y: previousY },
        { x: projectile.x, y: projectile.y },
        fixture => mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(projectile.z))), 'bullet'),
      );
      const wallFraction = wallHit?.fraction ?? this.context.physicsWorld.rayCast(
        { x: previousX, y: previousY },
        { x: projectile.x, y: projectile.y },
        fixture => mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(projectile.z))), 'bullet'),
      );
      // A wall later in the sweep must not hide a ped/car hit earlier in the
      // same fixed step. Resolve the first authored object in front of the
      // moving object, then the wall only if no entity was reached before it.
      const sweepFraction = Math.max(0, Math.min(1, wallFraction));
      const sweepEndX = previousX + dx * sweepFraction;
      const sweepEndY = previousY + dy * sweepFraction;
      // Thrown objects use the source's separate vertical integrator.  A
      // molotov therefore ends when it reaches the supporting surface instead
      // of surviving until its planar range timer expires below the map.
      if (wallFraction >= 1 && (projectile.projectileType === 'molotov' || projectile.projectileType === 'grenade') && this.context.surfaceAt) {
        const surface = this.context.surfaceAt({ x: projectile.x, y: projectile.y, z: projectile.z });
        const support = surface[0];
        if (support && projectile.z <= support.height + .08) {
          this.markImpact(object, projectile.x, projectile.y, support.height, 'surface');
          continue;
        }
      }
      // Sweep the whole segment so fast rockets and thrown objects cannot pass
      // through an entity between fixed ticks.
      const sweepLength = Math.hypot(sweepEndX - previousX, sweepEndY - previousY);
      const geometry = projectileCollisionGeometry(projectile.sourceModel);
      const sweepRadius = Math.max(geometry.radius, sweepLength * .5 + geometry.radius * 2);
      const midpoint = { x: (previousX + sweepEndX) * .5, y: (previousY + sweepEndY) * .5 };
      const nearby = this.context.physicsWorld.queryCircle({ x: midpoint.x, y: midpoint.y, z: projectile.z, radius: sweepRadius, floorTolerance: geometry.halfHeight, kinds: ['player', 'vehicle', 'npc'] });
      let closest: { t: number; x: number; y: number } | undefined;
      for (const body of nearby) {
        const candidate = body.object.state as { id?: string | number };
        if (candidate.id === undefined || String(candidate.id) === projectile.actor || `${body.kind}:${candidate.id}` === projectile.actor) continue;
        if (body.kind === 'vehicle' && this.context.ownerVehicleId?.(projectile.actor) === Number(candidate.id)) continue;
        const hit = segmentPointDistanceSquared(previousX, previousY, sweepEndX, sweepEndY, body.x, body.y);
        if (Math.abs(body.z - projectile.z) > geometry.halfHeight + body.radius) continue;
        const radius = body.radius + geometry.radius;
        if (hit.distanceSquared > radius * radius) continue;
        if (!closest || hit.t < closest.t) {
          closest = { t: hit.t, x: previousX + (sweepEndX - previousX) * hit.t, y: previousY + (sweepEndY - previousY) * hit.t };
          object.setImpactTarget({ kind: body.kind as 'player' | 'vehicle' | 'npc', id: candidate.id });
        }
      }
      if (closest) this.markImpact(object, closest.x, closest.y, projectile.z, 'entity');
      else if (wallFraction < 1) {
        const wallImpact = projectileWallImpact(projectile.rotation, wallHit?.fixture);
        this.markImpact(object, sweepEndX, sweepEndY, projectile.z, 'wall', wallImpact);
      }
    }
  }

  private markImpact(object: ProjectileObject, x: number, y: number, z = object.state.z, cause: 'entity' | 'surface' | 'wall' = 'wall', wallImpact?: { wallSide?: number; explosionType?: number }) {
    object.impactAt(x, y, z, cause, wallImpact);
  }
}
