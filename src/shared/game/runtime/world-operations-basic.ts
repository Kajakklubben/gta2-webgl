import type { Input, WorldEventInput } from '../../protocol/types';
import { tileToWorld } from '../../domain/world/world';

export function spawnPoint(host: any, arrest = false) {
  const zone = host.level.zones.find((item: { type: number; x: number; y: number; w: number; h: number }) => item.type === (arrest ? 20 : 16)) ?? host.level.zones.find((item: { type: number; x: number; y: number; w: number; h: number }) => item.type === 16);
  let point = { x: tileToWorld(85), y: -tileToWorld(190) };
  if (zone) point = { x: tileToWorld(zone.x + zone.w / 2), y: -tileToWorld(zone.y + zone.h / 2) };
  const support = host.surfaces.resolve(point)[0];
  let result: { x: number; y: number; z: number; collisionLayer?: number } = { x: point.x, y: point.y, z: support?.height ?? 0 };
  if (support) result = { ...result, collisionLayer: support.collisionLayer };
  return result;
}

export function floor(host: any, player: { x: number; y: number; z: number }) { return host.surfaceController.floor(player); }

export function input(_host: any, value: number | Input | undefined): Input {
  if (typeof value === 'number') return { seq: 0, keys: value };
  return value ?? { seq: 0, keys: 0 };
}

export function emit(host: any, event: WorldEventInput) {
  host.events.push({ ...event, id: host.eventId++, tick: host.tick });
}

export function updateNpcJumps(host: any, dt: number) {
  if (host.localId) return;
  for (const npc of host.gameState.npcStates) host.gameObjects.findNpc(npc.id)?.updateJump(dt);
}
