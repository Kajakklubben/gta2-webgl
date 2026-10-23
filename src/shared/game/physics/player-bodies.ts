import type { PlayerState } from '../../protocol/types';
import { worldToPhysics } from '../../domain/world/world';
import type { PhysicsRuntime } from '../../engine/physics-world';

/** Native player body construction stays behind the game physics adapter. */
export function createPlayerPhysicsBody(runtime: PhysicsRuntime, player: PlayerState, collisionLayer: number) {
  const body = runtime.createBody({
    type: 'dynamic',
    position: { x: worldToPhysics(player.x), y: -worldToPhysics(player.y) },
    allowSleep: false,
    fixedRotation: true,
  });
  body.createFixture({
    shape: { type: 'circle', radius: 1 },
    density: 1.3,
    friction: 0,
    restitution: 0,
    filterCategoryBits: 1 << 15,
    filterMaskBits: 1 << collisionLayer,
  });
  // Char_B4 movement is swept against map edges; keep the same continuous
  // collision behavior for a fast ped crossing a thin wall.
  body.setBullet(true);
  body.setUserData({ kind: 'player', id: player.id });
  return body;
}
