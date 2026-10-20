import type { PlayerState } from '../../protocol/types';
import { createProjectileObject, projectileTypeForWeapon, type ProjectileObject, type ProjectileStateInput } from '../effects/projectile';
import type { CollisionBody, CollisionQuery } from '../../domain/physics/collision';
import { mapFixtureMatches } from '../../domain/physics/map-fixtures';
import { segmentPointDistanceSquared } from './helpers';
import { directionFromRotation } from '../../domain/physics/motion-vector';
import { tilesPerSecondToWorld, WORLD } from '../../domain/world/world';
import type { WeaponSystem } from '../../domain/combat/weapon-system';
import type { WeaponRayActor } from '../../domain/combat/weapon-raycaster';
import { GTA2_SOURCE_OBJECT_MODELS, GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../domain/world/gta2-sprites';
import type { HazardState } from '../../protocol/types';
import type { SurfaceResult } from '../../domain/physics/map-surface';

export type ProjectileSpawnResult = ProjectileObject;

export interface ProjectileControllerContext {
  readonly weaponSystem: WeaponSystem;
  readonly projectiles: () => readonly ProjectileObject[];
  readonly physicsWorld: {
    rayCast: (start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean) => number;
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

  spawnVisual(actor: WeaponRayActor | PlayerState, weaponId: number, originX: number, originY: number, z: number, angle: number, distance: number, explosive = false, collision = true): ProjectileSpawnResult {
    const weapon = this.context.weaponSystem.get(weaponId);
    if (!Number.isFinite(distance) || distance <= 0.5) throw new RangeError(`Projectile distance must be greater than 0.5, received ${distance}`);
    let speed = tilesPerSecondToWorld(WORLD.projectile.bulletSpeed);
    if (weapon.sourceModel === GTA2_SOURCE_OBJECT_MODELS.shotgunBullet || weapon.kind === 'rocket') speed = tilesPerSecondToWorld(WORLD.projectile.rocketSpeed);
    else if (weapon.kind === 'explosive') speed = tilesPerSecondToWorld(WORLD.projectile.thrownSpeed);
    else if (weapon.kind === 'flame') speed = tilesPerSecondToWorld(WORLD.projectile.flameSpeed);
    const direction = directionFromRotation(angle);
    const life = Math.max(WORLD.projectile.minimumTravelTicks, Math.ceil(distance / Math.max(1, speed) * WORLD.tickRate));
    const projectileType = projectileTypeForWeapon(weaponId);
    const pending: ProjectileStateInput = {
      actor: actor.id, weapon: weaponId, x: originX, y: originY,
      endX: originX + direction.x * distance, endY: originY + direction.y * distance,
      z, life, rotation: angle, vx: direction.x * speed + actor.vx, vy: direction.y * speed + actor.vy,
      explosive, collision: collision && typeof weapon.sourceModel === 'number', projectileType,
      waterDeath: weapon.waterDeath ?? false,
    };
    if (typeof weapon.sourceModel === 'number') pending.sourceModel = weapon.sourceModel;
    const object = createProjectileObject(`${actor.id}:${this.context.tick()}:${this.context.projectiles().length}`, pending);
    this.context.register(object);
    return object;
  }

  resolveCollisions() {
    for (const object of this.context.projectiles()) {
      const projectile = object.state;
      if (!projectile.collision) continue;
      const previousX = projectile.prevX, previousY = projectile.prevY;
      const dx = projectile.x - previousX, dy = projectile.y - previousY;
      if (Math.hypot(dx, dy) < 1e-6) continue;
      const fraction = this.context.physicsWorld.rayCast(
        { x: previousX, y: previousY },
        { x: projectile.x, y: projectile.y },
        fixture => mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(projectile.z))), 'bullet'),
      );
      if (fraction < 1) {
        this.markImpact(object, previousX + dx * fraction, previousY + dy * fraction);
        continue;
      }
      // Thrown objects use the source's separate vertical integrator.  A
      // molotov therefore ends when it reaches the supporting surface instead
      // of surviving until its planar range timer expires below the map.
      if ((projectile.projectileType === 'molotov' || projectile.projectileType === 'grenade') && this.context.surfaceAt) {
        const surface = this.context.surfaceAt({ x: projectile.x, y: projectile.y, z: projectile.z });
        const support = surface[0];
        if (support && projectile.z <= support.height + .08) {
          this.markImpact(object, projectile.x, projectile.y, support.height);
          continue;
        }
      }
      // Sweep the whole segment so fast rockets and thrown objects cannot pass
      // through an entity between fixed ticks.
      const sweepRadius = Math.max(6, Math.hypot(dx, dy) * .5 + 14);
      const midpoint = { x: (previousX + projectile.x) * .5, y: (previousY + projectile.y) * .5 };
      if (projectile.waterDeath && this.context.isWaterAt?.({ x: projectile.x, y: projectile.y, z: projectile.z })) {
        object.markWaterDeath();
        this.context.spawnEffect?.({
          x: projectile.x, y: projectile.y, z: projectile.z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS,
          owner: projectile.actor, rotation: projectile.rotation, scale: .8,
        });
        continue;
      }
      const nearby = this.context.physicsWorld.queryCircle({ x: midpoint.x, y: midpoint.y, z: projectile.z, radius: sweepRadius, kinds: ['player', 'vehicle', 'npc'] });
      let closest: { t: number; x: number; y: number } | undefined;
      for (const body of nearby) {
        const candidate = body.object.state as { id?: string | number };
        if (candidate.id === undefined || String(candidate.id) === projectile.actor || `${body.kind}:${candidate.id}` === projectile.actor) continue;
        if (body.kind === 'vehicle' && this.context.ownerVehicleId?.(projectile.actor) === Number(candidate.id)) continue;
        const hit = segmentPointDistanceSquared(previousX, previousY, projectile.x, projectile.y, body.x, body.y);
        const radius = body.radius + 6;
        if (hit.distanceSquared > radius * radius) continue;
        if (!closest || hit.t < closest.t) {
          closest = { t: hit.t, x: previousX + dx * hit.t, y: previousY + dy * hit.t };
          object.setImpactTarget({ kind: body.kind as 'player' | 'vehicle' | 'npc', id: candidate.id });
        }
      }
      if (closest) this.markImpact(object, closest.x, closest.y);
    }
  }

  private markImpact(object: ProjectileObject, x: number, y: number, z = object.state.z) {
    object.impactAt(x, y, z);
  }
}
