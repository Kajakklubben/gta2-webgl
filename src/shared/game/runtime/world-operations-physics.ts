import { PlayerObject } from '../gameobjects/player';
import { worldToPhysics } from '../../domain/world/world';
import type { PlayerState } from '../../protocol/types';

/** Synchronize the map physics backend after shared GameObject blocking. */
export function syncBlockedBodies(host: any) {
  for (const object of host.gameObjects.players) {
    const body = object.physicsBody;
    if (!body) continue;
    const pose = object.placement, velocity = object.readPhysicsVelocity();
    body.setPosition({ x: worldToPhysics(pose.x), y: -worldToPhysics(pose.y) });
    body.setLinearVelocity({ x: worldToPhysics(velocity.vx ?? 0), y: -worldToPhysics(velocity.vy ?? 0) });
  }
  for (const object of host.gameObjects.vehicles) {
    const vehicle = object.state, body = object.physicsBody;
    if (!body) continue;
    body.setPosition({ x: worldToPhysics(vehicle.x), y: -worldToPhysics(vehicle.y) });
    body.setLinearVelocity({ x: worldToPhysics(vehicle.vx), y: -worldToPhysics(vehicle.vy) });
    body.setAngle(-vehicle.rotation); body.setAngularVelocity(-vehicle.angularVelocity);
  }
  host.syncNpcBodies();
}

export function raiseWanted(host: any, player: PlayerState, amount = 1) {
  const object = host.gameObjects.findPlayer(player.id);
  if (!(object instanceof PlayerObject)) return false;
  object.raiseWanted(amount);
  host.wantedDecay.set(player.id, 900);
  return true;
}
