import type { NpcState } from '../../protocol/types';
import { NpcObject } from '../gameobjects/npc';
import { physicsToWorld, worldToPhysics, WORLD } from '../../domain/world/world';
import { updateNpcPhysicsBodyLayer } from '../physics/npc-bodies';
import { initializeNpcWeaponState } from './npc-weapon-runtime';

export function createNpcObject(npc: NpcState) {
  initializeNpcWeaponState(npc);
  return new NpcObject(npc);
}

export function createNpcBody(host: any, npc: NpcState) {
  const object = host.gameObjects.findNpc(npc.id);
  if (host.localId || !object) return object?.physicsBody;
  if (object.physicsBody) return object.physicsBody;
  const body = host.createNpcPhysicsBody(npc);
  object.attachPhysicsBody(body);
  return body;
}

export function destroyNpcBody(host: any, id: number) {
  const object = host.gameObjects.findNpc(id);
  const body = object?.detachPhysicsBody();
  if (body) host.destroyPhysicsBody(body);
}

export function updateNpcBodyLayer(host: any, npc: NpcState, body = host.gameObjects.findNpc(npc.id)?.physicsBody) {
  updateNpcPhysicsBodyLayer(body, host.collisionLayer(npc));
}

export function prepareNpcBodies(host: any, starts: ReadonlyMap<string, { x: number; y: number }>, dt = 1 / WORLD.tickRate) {
  for (const npc of host.gameState.npcStates) {
    const body = createNpcBody(host, npc);
    if (!body) continue;
    const object = host.gameObjects.findNpc(npc.id);
    if (!(object instanceof NpcObject)) continue;
    const start = starts.get(`npc:${npc.id}`) ?? { x: npc.x, y: npc.y };
    object.preparePhysics(body, start, dt, worldToPhysics, () => updateNpcBodyLayer(host, npc, body), () => {
      host.applySurface(npc, host.surfaceFor(npc), dt, true);
    });
  }
}

export function readNpcBodies(host: any) {
  for (const npc of host.gameState.npcStates) {
    const body = host.gameObjects.findNpc(npc.id)?.physicsBody;
    const object = host.gameObjects.findNpc(npc.id);
    if (!body || !(object instanceof NpcObject)) continue;
    object.readPhysics(body, physicsToWorld, { afterRead: () => host.applySurface(npc, host.surfaceFor(npc)) });
  }
}

export function syncNpcBodies(host: any) {
  for (const object of host.gameObjects.npcs) {
    const body = object.physicsBody;
    if (!body) continue;
    const pose = object.placement;
    body.setPosition({ x: worldToPhysics(pose.x), y: -worldToPhysics(pose.y) });
    body.setLinearVelocity({ x: worldToPhysics(object.state.vx), y: -worldToPhysics(object.state.vy) });
  }
}
