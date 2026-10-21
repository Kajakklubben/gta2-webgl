import type { NpcState } from '../../protocol/types';
import { worldToPhysics } from '../../domain/world/world';
import type { PhysicsBody, PhysicsRuntime } from '../../engine/physics-world';

/** Native NPC body construction stays behind the game physics adapter. */
export function createNpcPhysicsBody(runtime: PhysicsRuntime, npc: NpcState, collisionLayer: number) {
  const body = runtime.createBody({
    type: 'dynamic',
    position: { x: worldToPhysics(npc.x), y: -worldToPhysics(npc.y) },
    allowSleep: false,
    fixedRotation: true,
  });
  body.createFixture({
    shape: { type: 'circle', radius: worldToPhysics(12) },
    density: 1.3,
    friction: .15,
    restitution: 0,
    filterCategoryBits: 1 << 15,
    filterMaskBits: 1 << collisionLayer,
  });
  body.setBullet(true);
  body.setUserData({ kind: 'npc', id: npc.id });
  return body;
}

export function updateNpcPhysicsBodyLayer(body: PhysicsBody | undefined, collisionLayer: number) {
  const fixture = body?.getFixtureList();
  if (!fixture) return;
  fixture.setFilterData({ categoryBits: fixture.getFilterCategoryBits(), maskBits: 1 << collisionLayer, groupIndex: fixture.getFilterGroupIndex() });
}
