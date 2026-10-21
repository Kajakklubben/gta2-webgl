import { createProjectileObject, projectileStateFromShot } from '../../effects/projectile';
import type { PlayerObject } from './player';

export function syncPlayerShots(player: PlayerObject) {
  const desired = new Set<string>();
  for (const shot of player.mutablePlayerState.combat.shots) {
    if (!shot.projectile || (shot.impact && !shot.beam)) continue;
    const identity = shot.sequence === undefined ? `${shot.weapon}:${shot.x}:${shot.y}:${shot.endX}:${shot.endY}` : `${shot.sequence}`;
    const key = `${player.id}:shot:${identity}`;
    desired.add(key);
    const existing = player.replicatedShotState.get(key);
    if (existing) existing.syncReplicatedShot(shot);
    else player.replicatedShotState.set(key, player.spawn(createProjectileObject(key, projectileStateFromShot(player.id, shot))));
  }
  for (const [key, projectile] of player.replicatedShotState) {
    if (desired.has(key)) continue;
    projectile.despawn(); player.replicatedShotState.delete(key);
  }
}
