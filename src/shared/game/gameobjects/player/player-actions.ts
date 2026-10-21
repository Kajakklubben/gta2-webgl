import type { GameObjectCombatContext, PlayerDamageContext } from '../gameobject';
import { WORLD } from '../../../domain/world/world';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../../domain/world/gta2-sprites';
import { sourcePedestrianImpact } from '../../../domain/physics/pedestrian-impact';
import { createHazardObject } from '../../effects/hazard';
import type { PlayerObject } from './player';

export function receiveVehicleImpact(player: PlayerObject, impact: number, driverId: string | undefined, combat: PlayerDamageContext, options: { lethal: boolean; rotation?: number }) {
  const state = player.mutablePlayerState, playerCombat = state.combat;
  if (state.vehicleId !== undefined || playerCombat.respawn > 0 || playerCombat.health <= 0 || impact < WORLD.vehicle.pedestrianImpact.contactTrigger) return false;
  const sourceImpact = sourcePedestrianImpact(impact), lethal = options.lethal;
  const damage = lethal ? Math.max(100, playerCombat.health + state.armor) : Math.max(1, Math.round((sourceImpact - WORLD.vehicle.pedestrianImpact.minimum) * .2));
  combat.damagePlayer(player, damage, driverId, 'run-over');
  combat.spawnEffect({ x: state.x, y: state.y, z: state.z, life: lethal ? 20 : 12, kind: lethal ? 'blood' : 'impact', owner: driverId, rotation: options.rotation, scale: lethal ? 1.1 : .8, variant: lethal ? 1 : 0 });
  combat.emit({ type: 'hit', actor: driverId, target: player.id, damage, lethal, x: state.x, y: state.y, z: state.z });
  return true;
}

export function collectPickup(player: PlayerObject, weapon: number, ammo: number) {
  const combat = player.mutablePlayerState.combat, currentAmmo = combat.ammo[weapon];
  if (!Number.isFinite(weapon) || weapon < 0 || weapon >= combat.ammo.length || currentAmmo === undefined) return false;
  combat.ammo[weapon] = currentAmmo + Math.max(0, Math.floor(ammo)); combat.weapon = weapon; return true;
}

export function takeDamage(player: PlayerObject, damage: number, killer?: string, cause: PlayerObject['state']['deathCause'] = 'weapon') {
  const state = player.mutablePlayerState, combat = state.combat, armor = Math.min(state.armor, Math.ceil(damage * .5));
  state.armor = Math.max(0, state.armor - armor); combat.health = Math.max(0, combat.health - damage + armor);
  if (combat.health <= 0) { state.killer = killer; state.deathCause = cause; }
  return combat.health <= 0;
}

export function setOnFire(player: PlayerObject, context?: Pick<GameObjectCombatContext, 'authoritative' | 'nextHazardId'>) {
  const state = player.mutablePlayerState, combat = state.combat;
  if (combat.health <= 0 || combat.onFire) return false;
  combat.onFire = true; combat.fireTimer = 0;
  if (context?.authoritative) player.spawn(createHazardObject({ id: context.nextHazardId(), x: state.x, y: state.y, z: state.z, kind: 'fire', life: 2, owner: `player:${player.id}`, effect: 'fire', sourceModel: GTA2_SOURCE_OBJECT_MODELS.pedFire }));
  return true;
}

export function putOutFire(player: PlayerObject) { const combat = player.mutablePlayerState.combat; combat.onFire = false; combat.fireTimer = 0; }

export function kill(player: PlayerObject) {
  const state = player.mutablePlayerState, combat = state.combat;
  if (combat.respawn > 0) return false;
  state.drowningTimer = undefined; combat.health = 0; combat.respawn = WORLD.player.deathCountdown;
  state.vx = 0; state.vy = 0; state.jump = undefined;
  if (state.movement) { state.movement.speed = 0; state.movement.turnSpeed = 0; state.movement.moveDirection = 0; }
  state.deaths += 1; return true;
}

export function beginAttack(player: PlayerObject) { player.mutablePlayerState.combat.attacking = true; }
export function endAttack(player: PlayerObject) { player.mutablePlayerState.combat.attacking = false; }
export function startWeaponCooldown(player: PlayerObject, ticks: number) { player.mutablePlayerState.combat.cooldown = Math.max(0, Math.floor(ticks)); }
export function rememberCombatInput(player: PlayerObject, keys: number) { player.mutablePlayerState.combat.previousKeys = keys; }
export function beginThrow(player: PlayerObject) {
  const combat = player.mutablePlayerState.combat;
  if (combat.respawn > 0 || combat.cooldown > 0 || player.ammoFor() <= 0) return false;
  if (!combat.throwing) { combat.throwing = true; combat.throwAnimation = 0; combat.throwCharge = 0; }
  return true;
}
export function chargeThrow(player: PlayerObject, maximum = 96) { const combat = player.mutablePlayerState.combat; combat.throwCharge = Math.min(maximum, combat.throwCharge + 1); return combat.throwCharge; }
export function finishThrow(player: PlayerObject, cooldown: number, animation = 25) { const combat = player.mutablePlayerState.combat; combat.throwing = false; combat.throwCharge = 0; combat.throwAnimation = animation; combat.cooldown = Math.max(0, Math.floor(cooldown)); }
export function cancelThrow(player: PlayerObject, animation = 25) { const combat = player.mutablePlayerState.combat; combat.throwing = false; combat.throwCharge = 0; combat.throwAnimation = animation; }
export function resetCombatInput(player: PlayerObject, keys: number) { const combat = player.mutablePlayerState.combat; combat.throwing = false; combat.throwCharge = 0; combat.throwAnimation = 0; combat.attacking = false; combat.previousKeys = keys; }
