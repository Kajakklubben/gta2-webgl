import type { GameObjectCombatContext } from '../gameobject';
import type { PlayerObject } from './player';
import { WORLD } from '../../../domain/world/world';
import { GTA2_WATER_SPLASH_VISUAL_TICKS } from '../../../domain/world/gta2-sprites';

export function tickPlayerStatus(player: PlayerObject, context: Pick<GameObjectCombatContext, 'authoritative' | 'isWaterAt' | 'damagePlayer' | 'spawnEffect'>) {
  const state = player.mutablePlayerState, combat = state.combat;
  if (combat.shockCounter > 0) {
    combat.shockCounter = Math.max(0, combat.shockCounter - 1);
    if (combat.shockCounter === 0) combat.electrocuted = false;
  }
  if (!context.authoritative || combat.health <= 0) return;
  if (state.drowningTimer !== undefined) {
    state.drowningTimer = Math.max(0, state.drowningTimer - 1);
    if (state.drowningTimer === 0) { state.drowningTimer = undefined; context.damagePlayer(player, combat.health + state.armor + 1, undefined, 'water'); }
    return;
  }
  if (context.isWaterAt({ x: state.x, y: state.y, z: state.z })) {
    state.drowningTimer = WORLD.player.waterDeathTicks;
    player.putOutFire(); combat.attacking = false; combat.throwing = false; combat.throwCharge = 0; combat.throwAnimation = 0; combat.fireAnimation = 0;
    state.vx = 0; state.vy = 0; state.jump = undefined; state.verticalVelocity = 0;
    if (state.movement) { state.movement.speed = 0; state.movement.turnSpeed = 0; state.movement.moveDirection = 0; }
    context.spawnEffect({ x: state.x, y: state.y, z: state.z, kind: 'water', life: GTA2_WATER_SPLASH_VISUAL_TICKS, owner: `player:${player.id}`, rotation: state.rotation, scale: .9 });
    return;
  }
  if (!combat.onFire) return;
  if (state.vehicleId !== undefined || context.isWaterAt({ x: state.x, y: state.y, z: state.z })) { player.putOutFire(); return; }
  combat.fireTimer += 1; context.damagePlayer(player, 1, player.id, 'fire');
  if (combat.health <= 0) player.putOutFire();
}
