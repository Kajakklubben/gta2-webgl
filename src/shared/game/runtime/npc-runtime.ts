import * as planck from 'planck';
import type { NpcState } from '../../protocol/types';
import { NpcObject } from '../gameobjects/npc';
import { physicsToWorld, worldToPhysics, WORLD } from '../../domain/world/world';

export function createNpcObject(npc: NpcState) {
  return new NpcObject(npc);
}

export function createNpcBody(host: any, npc: NpcState) {
  if (host.localId || host.npcBodies.has(npc.id)) return host.npcBodies.get(npc.id);
  const body = host.physicsRuntime.createBody({
    type: 'dynamic',
    position: { x: worldToPhysics(npc.x), y: -worldToPhysics(npc.y) },
    allowSleep: false,
    fixedRotation: true,
  });
  body.createFixture({
    shape: new planck.CircleShape(worldToPhysics(12)),
    density: 1.3,
    friction: .15,
    restitution: 0,
    filterCategoryBits: 1 << 15,
    filterMaskBits: 1 << host.collisionLayer(npc),
  });
  body.setBullet(true);
  body.setUserData({ kind: 'npc', id: npc.id });
  host.npcBodies.set(npc.id, body);
  return body;
}

export function destroyNpcBody(host: any, id: number) {
  const body = host.npcBodies.get(id);
  if (body) host.physicsRuntime.destroyBody(body);
  host.npcBodies.delete(id);
}

export function updateNpcBodyLayer(host: any, npc: NpcState, body = host.npcBodies.get(npc.id)) {
  const fixture = body?.getFixtureList();
  if (!fixture) return;
  fixture.setFilterData({ categoryBits: fixture.getFilterCategoryBits(), maskBits: 1 << host.collisionLayer(npc), groupIndex: fixture.getFilterGroupIndex() });
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
    const body = host.npcBodies.get(npc.id);
    const object = host.gameObjects.findNpc(npc.id);
    if (!body || !(object instanceof NpcObject)) continue;
    object.readPhysics(body, physicsToWorld, { afterRead: () => host.applySurface(npc, host.surfaceFor(npc)) });
  }
}

export function syncNpcBodies(host: any) {
  for (const object of host.gameObjects.npcs) {
    const body = host.npcBodies.get(object.id);
    if (!body) continue;
    const pose = object.placement;
    body.setPosition({ x: worldToPhysics(pose.x), y: -worldToPhysics(pose.y) });
    body.setLinearVelocity({ x: worldToPhysics(object.state.vx), y: -worldToPhysics(object.state.vy) });
  }
}
