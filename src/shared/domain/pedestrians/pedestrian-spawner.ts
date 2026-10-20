import type { NpcState } from '../../protocol/types';
import { INTEREST_RADIUS } from '../../protocol/constants';
import { rotationFromDirection } from '../physics/motion-vector';
import { PedestrianNavigation, type PedestrianNavNode } from './pedestrian-navigation';
import { CIVILIAN_PED_REMAPS } from './pedestrian-appearance';
import { WeaponId } from '../combat/weapons';

/** Char_Pool::PedManager initializes field_0_max_dummy_chars to 50. */
export const PEDESTRIAN_POPULATION_LIMIT = 50;
/** The source pool is global; one active player should be able to fill it. */
export const PEDESTRIAN_PER_PLAYER = PEDESTRIAN_POPULATION_LIMIT;
export const PEDESTRIAN_SPAWN_MIN_DISTANCE = 320;
export const PEDESTRIAN_SPAWN_MAX_DISTANCE = Math.min(INTEREST_RADIUS - 100, 1400);
export const PEDESTRIAN_DESPAWN_DISTANCE = INTEREST_RADIUS + 320;

function hash(seed: number) {
  let value = seed | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}

function rotationBetween(from: { x: number; y: number }, to: PedestrianNavNode) {
  return rotationFromDirection(to.x - from.x, to.y - from.y);
}

export interface PedestrianSpawnOccupant {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Deterministic source-style population manager for server-owned pedestrians. */
export class PedestrianSpawner {
  constructor(readonly navigation: PedestrianNavigation) {}

  private candidates(player: { x: number; y: number; z: number }, seed: number) {
    const nearby = this.navigation.nodes
      .filter(node => node.isPavement)
      .filter(node => {
        const distance = Math.hypot(node.worldX - player.x, node.worldY - player.y);
        return distance >= PEDESTRIAN_SPAWN_MIN_DISTANCE && distance <= PEDESTRIAN_SPAWN_MAX_DISTANCE && Math.abs(node.height - player.z) <= 1.05;
      });
    return nearby.sort((a, b) => hash(seed + a.id * 31) - hash(seed + b.id * 31));
  }

  spawnAround(
    player: { x: number; y: number; z: number },
    id: number,
    occupied: readonly PedestrianSpawnOccupant[],
    tick: number,
  ): NpcState[] {
    for (const node of this.candidates(player, id + tick * 97)) {
      if (occupied.some(other => other.z === node.height && Math.hypot(other.x - node.worldX, other.y - node.worldY) < 96)) continue;
      const random = hash(id * 17 + node.id * 7 + tick);
      const neighbor = this.navigation.neighborsOf(node.id)[random % Math.max(1, this.navigation.neighborsOf(node.id).length)];
      let kind: NpcState['kind'] = 'civilian';
      if (random % 5 === 0) kind = 'police';
      let rotation = 0;
      if (neighbor) rotation = rotationBetween({ x: node.x, y: node.y }, neighbor);
      let remap: number | undefined;
      if (kind === 'civilian') remap = CIVILIAN_PED_REMAPS[random % CIVILIAN_PED_REMAPS.length];
      const gang = this.navigation.level.zones.find(zone => zone.typeName === 'gang' && node.x >= zone.x && node.x < zone.x + zone.w && node.y >= zone.y && node.y < zone.y + zone.h);
      const npc: NpcState = {
        id,
        x: node.worldX,
        y: node.worldY,
        z: node.height,
        rotation,
        vx: 0,
        vy: 0,
        health: 100,
        kind,
        remap,
        faction: gang ? 1 + ((gang.x * 17 + gang.y * 31 + random) % 3) : 0,
        collisionLayer: node.collisionLayer,
        grounded: true,
        state: 'idle',
        animation: 'idle',
        shockCounter: 0,
        electrocuted: false,
        shots: [],
        onFire: false,
        fireTimer: 0,
      };
      if (kind === 'police') {
        npc.weapon = WeaponId.SilencedGun;
        npc.weaponAmmo = 100;
        npc.weaponCooldown = random % 20;
      }
      return [npc];
    }
    return [];
  }
}
