import type { NpcState, PlayerState, TrafficState } from '../../protocol/types';
import { directionFromRotation, rotationFromDirection } from '../physics/motion-vector';
import { WORLD } from '../world/world';
import { GTA2_SHOCKER_CHAIN_RADIUS, GTA2_SHOCKER_HALF_ANGLE, GTA2_SHOCKER_INITIAL_RADIUS } from './weapons';
import type { WeaponSystem } from './weapon-system';
import { LagCompensation, type HistoryTick } from './lag-compensation';

export type WeaponRayTarget =
  | { readonly kind: 'player'; readonly state: PlayerState }
  | { readonly kind: 'npc'; readonly state: NpcState }
  | { readonly kind: 'vehicle'; readonly state: TrafficState };

export interface WeaponRay {
  readonly startX: number;
  readonly startY: number;
  readonly direction: { x: number; y: number };
  readonly distance: number;
  readonly targets: readonly WeaponRayTarget[];
  readonly rotation: number;
  readonly endX: number;
  readonly endY: number;
}

/** Minimal shooter pose shared by player and NPC weapon dispatch.  NPCs do
 * not need a fake CombatState just to use the same source ray rules. */
export interface WeaponRayActor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly rotation: number;
  readonly vehicleId?: number | undefined;
  readonly team?: number | undefined;
}

export interface WeaponRaycasterContext {
  readonly weaponSystem: Pick<WeaponSystem, 'get'>;
  readonly players: () => Iterable<PlayerState>;
  readonly npcs: () => Iterable<NpcState>;
  readonly vehicles: () => Iterable<TrafficState>;
  readonly history: LagCompensation;
  readonly mapFixtureMatches: (fixture: unknown, layer: number, mode: 'movement' | 'bullet') => boolean;
  readonly rayCast: (start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean) => number;
}

/** Resolves an authored weapon ray against map geometry and historical entity
 * positions. It owns query math; callers still decide what impact object to
 * create from the result. */
export class WeaponRaycaster {
  constructor(readonly context: WeaponRaycasterContext) {}

  trace(actor: WeaponRayActor, weaponId: number, originX: number, originY: number, angle: number, clientTick: HistoryTick = 'latest'): WeaponRay {
    const weapon = this.context.weaponSystem.get(weaponId);
    const direction = directionFromRotation(angle);
    let distance = weapon.range;
    const wallFraction = this.context.rayCast(
      { x: originX, y: originY },
      { x: originX + direction.x * distance, y: originY + direction.y * distance },
      fixture => this.context.mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(actor.z))), 'bullet'),
    );
    distance = Math.min(distance, weapon.range * wallFraction);
    const targets: WeaponRayTarget[] = [];
    const pickTarget = (ox: number, oy: number, radius: number, target: { x: number; y: number }) => {
      const dx = target.x - ox, dy = target.y - oy;
      const along = dx * direction.x + dy * direction.y;
      const across = dx * direction.y - dy * direction.x;
      if (along < 0 || Math.abs(across) > radius) return Number.POSITIVE_INFINITY;
      return Math.max(0, along - Math.sqrt(Math.max(0, radius * radius - across * across)));
    };
    for (const other of this.context.players()) {
      if (other.id === actor.id || other.combat.respawn || Math.abs(other.z - actor.z) > WORLD.interaction.sameFloor || (actor.team && other.team === actor.team)) continue;
      const historical = this.context.history.player(other.id, clientTick, other);
      const hit = pickTarget(originX, originY, 10, { x: historical.x, y: historical.y });
      if (hit < distance) { distance = hit; targets.splice(0, targets.length, { kind: 'player', state: other }); }
    }
    for (const other of this.context.npcs()) {
      if (other.id === Number(actor.id.replace(/^npc:/, '')) || other.health <= 0 || other.vehicleId !== undefined || Math.abs(other.z - actor.z) > WORLD.interaction.sameFloor) continue;
      const hit = pickTarget(originX, originY, 12, { x: other.x, y: other.y });
      if (hit < distance) { distance = hit; targets.splice(0, targets.length, { kind: 'npc', state: other }); }
    }
    for (const vehicle of this.context.vehicles()) {
      if (vehicle.health <= 0 || vehicle.id === actor.vehicleId || Math.abs(vehicle.z - actor.z) > WORLD.interaction.sameFloor) continue;
      const historical = this.context.history.vehicle(vehicle.id, clientTick, vehicle);
      const hit = pickTarget(originX, originY, 28, { x: historical.x, y: historical.y });
      if (hit < distance) { distance = hit; targets.splice(0, targets.length, { kind: 'vehicle', state: vehicle }); }
    }
    return {
      startX: originX, startY: originY, direction, distance, rotation: angle, endX: originX + direction.x * distance, endY: originY + direction.y * distance,
      targets,
    };
  }

  /** Source shocker_5E06B0 is a short cone/prism query, not a single ray.
   * Every accepted ped can recurse once, using that ped as the centre and
   * orienting the next prism toward the hit. Cars terminate the chain. */
  traceShocker(actor: WeaponRayActor, originX: number, originY: number, angle: number, clientTick: HistoryTick = 'latest'): WeaponRay[] {
    const rays: WeaponRay[] = [];
    const visited = new Set<string>([actor.id]);
    const search = (startX: number, startY: number, startZ: number, heading: number, radius: number, depth: number) => {
      const direction = directionFromRotation(heading);
      const candidates: Array<{
        key: string; kind: 'player' | 'npc' | 'vehicle'; id: string | number;
        x: number; y: number; z: number; state: PlayerState | NpcState | TrafficState;
      }> = [];
      const add = (candidate: typeof candidates[number]) => {
        if (visited.has(candidate.key) || Math.abs(candidate.z - startZ) > WORLD.interaction.sameFloor) return;
        const dx = candidate.x - startX, dy = candidate.y - startY, distance = Math.hypot(dx, dy);
        // CollectRectCollisions_477F30 uses the source's axis-aligned
        // collision prism (±2 units initially, ±1 on the recursive pass),
        // so retain the square corners instead of reducing it to a circle.
        if (distance < 1e-6 || Math.abs(dx) > radius || Math.abs(dy) > radius) return;
        const dot = dx * direction.x + dy * direction.y;
        const cross = dx * direction.y - dy * direction.x;
        if (Math.abs(Math.atan2(cross, dot)) > GTA2_SHOCKER_HALF_ANGLE) return;
        candidates.push(candidate);
      };

      for (const other of this.context.players()) {
        if (other.id === actor.id || other.combat.respawn || (actor.team && other.team === actor.team)) continue;
        const historical = this.context.history.player(other.id, clientTick, other);
        add({ key: `player:${other.id}`, kind: 'player', id: other.id, x: historical.x, y: historical.y, z: historical.z, state: other });
      }
      for (const other of this.context.npcs()) {
        if (other.health <= 0 || other.vehicleId !== undefined) continue;
        add({ key: `npc:${other.id}`, kind: 'npc', id: other.id, x: other.x, y: other.y, z: other.z, state: other });
      }
      for (const other of this.context.vehicles()) {
        if (other.health <= 0 || other.id === actor.vehicleId) continue;
        const historical = this.context.history.vehicle(other.id, clientTick, other);
        add({ key: `vehicle:${other.id}`, kind: 'vehicle', id: other.id, x: historical.x, y: historical.y, z: historical.z, state: other });
      }

      candidates.sort((a, b) => Math.hypot(a.x - startX, a.y - startY) - Math.hypot(b.x - startX, b.y - startY));
      for (const candidate of candidates) {
        const wallFraction = this.context.rayCast(
          { x: startX, y: startY }, { x: candidate.x, y: candidate.y },
          fixture => this.context.mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(startZ))), 'bullet'),
        );
        if (wallFraction < 0.999) continue;
        visited.add(candidate.key);
        const dx = candidate.x - startX, dy = candidate.y - startY;
        const distance = Math.hypot(dx, dy), targetAngle = rotationFromDirection(dx, dy, heading);
        let rayDirection = direction;
        if (distance > 1e-6) rayDirection = { x: dx / distance, y: dy / distance };
        let target: WeaponRayTarget;
        if (candidate.kind === 'player') target = { kind: 'player', state: candidate.state as PlayerState };
        else if (candidate.kind === 'npc') target = { kind: 'npc', state: candidate.state as NpcState };
        else target = { kind: 'vehicle', state: candidate.state as TrafficState };
        rays.push({
          startX, startY, direction: rayDirection,
          distance, rotation: targetAngle, endX: candidate.x, endY: candidate.y,
          targets: [target],
        });
        if (candidate.kind !== 'vehicle' && depth < 1) search(candidate.x, candidate.y, candidate.z, targetAngle, GTA2_SHOCKER_CHAIN_RADIUS, depth + 1);
      }
    };
    search(originX, originY, actor.z, angle, GTA2_SHOCKER_INITIAL_RADIUS, 0);
    return rays;
  }
}
