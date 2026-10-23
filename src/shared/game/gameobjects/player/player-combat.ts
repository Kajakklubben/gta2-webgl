import type { GameObjectCombatContext } from '../gameobject';
import type { PlayerObject, PlayerCombatContext } from './player';
import { directionFromRotation } from '../../../domain/physics/motion-vector';
import { GTA2_PLAYER_FIRE_POINT_FORWARD, GTA2_PLAYER_FIRE_POINT_RIGHT, projectileTravelTicks, sourceThrowableSpeed, sourceThrowableVelocity, sourceWeaponAngleToRadians, WeaponId } from '../../../domain/combat/weapons';
import type { WeaponRay } from '../../../domain/combat/weapon-raycaster';
import { GrenadeObject, HitscanImpactObject, resolveWaterCannonPlayerHit, type ProjectileObject, type ProjectileStateInput } from '../../effects/projectile';
import { WORLD } from '../../../domain/world/world';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../../domain/world/gta2-sprites';

function directPlayerImpactModel(sourceModel: number | undefined, impactModel: number | undefined) {
  if (impactModel !== undefined) return impactModel;
  if (sourceModel === GTA2_SOURCE_OBJECT_MODELS.pistolBullet || sourceModel === GTA2_SOURCE_OBJECT_MODELS.machineGunBullet) return undefined;
  return sourceModel;
}

/** Resolve the source's immediate player bullet branch at the authority. The
 * numeric armor field is the existing wire-compatible representation of the
 * source Armor_3 power-up: one protected direct hit consumes one charge and
 * absorbs the hit. Other damage paths still go through damagePlayer, whose
 * normal authoritative armor reduction remains unchanged. */
function resolveDirectPlayerHit(player: PlayerObject, weaponId: number, ray: WeaponRay, combat: GameObjectCombatContext, sourceModel?: number) {
  const weapon = combat.weaponSystem.get(weaponId), target = ray.targets[0];
  if (!combat.authoritative || target?.kind !== 'player') return false;
  const victim = combat.findPlayer(String(target.state.id));
  if (!victim || victim.id === player.id || victim.combatState.respawn > 0 || (player.state.team && player.state.team === victim.state.team)) return true;

  if (weapon.waterCannon) {
    resolveWaterCannonPlayerHit(victim, player.id, weaponId, combat);
    return true;
  }

  combat.spawnEffect({ x: ray.endX, y: ray.endY, z: player.state.z, kind: 'impact', life: 7, owner: player.id, rotation: ray.rotation, sourceModel: directPlayerImpactModel(sourceModel, weapon.impactModel) });
  if (victim.state.armor > 0) {
    victim.mutablePlayerState.armor = Math.max(0, Math.floor(victim.state.armor) - 1);
    combat.emit({ type: 'hit', actor: player.id, target: victim.id, weapon: weaponId, damage: 0, lethal: false, x: victim.state.x, y: victim.state.y, z: victim.state.z });
    return true;
  }

  const damage = Math.max(1, Math.round(weapon.playerDamage ?? weapon.damage)), currentHealth = victim.combatState.health;
  combat.damagePlayer(victim, damage, player.id, 'weapon');
  combat.emit({ type: 'hit', actor: player.id, target: victim.id, weapon: weaponId, damage, lethal: currentHealth <= damage, x: victim.state.x, y: victim.state.y, z: victim.state.z });
  return true;
}

function rayDamage(player: PlayerObject, weaponId: number, ray: WeaponRay, combat: GameObjectCombatContext, sourceModel?: number) {
  const weapon = combat.weaponSystem.get(weaponId), target = ray.targets[0];
  if (!combat.authoritative || !target) return;
  if (weapon.kind === 'bullet' && target.kind === 'player' && resolveDirectPlayerHit(player, weaponId, ray, combat, sourceModel)) return;
  const state: ProjectileStateInput = { actor: player.id, weapon: weaponId, x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: player.state.z, life: 1, rotation: ray.rotation, impact: true, impactTarget: { kind: target.kind, id: target.state.id }, projectileType: 'shock', beam: weapon.kind === 'stun' };
  const resolvedSourceModel = sourceModel ?? weapon.sourceModel;
  if (typeof resolvedSourceModel === 'number') state.sourceModel = resolvedSourceModel;
  const impact = new HitscanImpactObject(`${player.id}:hitscan:${combat.nextEventId()}`, state);
  player.spawn(impact); impact.resolveHitscan(combat); impact.deferDespawn();
}

function playerWeaponOrigin(player: PlayerObject, weaponId: number) {
  const state = player.state;
  const direction = directionFromRotation(state.rotation), right = { x: Math.cos(state.rotation), y: Math.sin(state.rotation) };
  let forward = GTA2_PLAYER_FIRE_POINT_FORWARD, lateral = GTA2_PLAYER_FIRE_POINT_RIGHT;
  // SMG_5DDD20 fires from the source's left-hand point relative to the camera;
  // rockets, shotgun, shocker, and thrown objects launch from the camera.
  if (weaponId === WeaponId.MachineGun || weaponId === WeaponId.SilencedGun) {
    forward = (0x666 + 0x147) / 0x4000 * 64;
    lateral = -0x1EB / 0x4000 * 64;
  } else if (weaponId === WeaponId.Shotgun || weaponId === WeaponId.RocketLauncher || weaponId === WeaponId.ElectroShock || weaponId === WeaponId.StunGun || weaponId === WeaponId.Molotov || weaponId === WeaponId.Grenade) {
    forward = 0;
    lateral = 0;
  } else if (weaponId === WeaponId.Flamethrower) {
    forward = GTA2_PLAYER_FIRE_POINT_FORWARD;
    lateral = 0;
  }
  return {
    x: state.x + direction.x * forward + right.x * lateral,
    y: state.y + direction.y * forward + right.y * lateral,
    angle: state.rotation,
  };
}

function reportWeaponEmission(player: PlayerObject, weaponId: number, origin: { x: number; y: number; angle: number }, combat: GameObjectCombatContext) {
  const weapon = combat.weaponSystem.get(weaponId);
  if (weapon.kind === 'slick' || weapon.kind === 'mine') return;
  combat.spawnEffect({ x: origin.x, y: origin.y, z: player.state.z, kind: 'impact', life: 4, owner: player.id, rotation: origin.angle, sourceModel: weapon.sourceModel, variant: 2, scale: .6 });
  if (!combat.authoritative || weapon.silent || weapon.reportsCrime === false) return;
  combat.raiseWanted(player);
  for (const body of combat.queryCircle({ x: player.state.x, y: player.state.y, z: player.state.z, radius: 900, kinds: ['npc'] })) {
    combat.findNpc(Number(body.objectId))?.addThreat(player.id);
  }
}

function detonate(player: PlayerObject, x: number, y: number, z: number, weaponId: number, combat: GameObjectCombatContext) {
  const grenade = new GrenadeObject(`${player.id}:grenade:${combat.nextEventId()}`, { actor: player.id, weapon: weaponId, x, y, endX: x, endY: y, z, life: 0, impact: true, explosive: true, selfDamage: true, projectileType: 'grenade' });
  player.spawn(grenade); grenade.detonate(combat); grenade.deferDespawn();
}

export function updatePlayerCombat(player: PlayerObject, context: PlayerCombatContext) {
  const state = player.mutablePlayerState, weaponId = state.combat.weapon, combat = state.combat, input = context.input, explicit = input.controls !== undefined;
  const shootStart = input.controls?.includes('shootStart') === true, shootEnd = input.controls?.includes('shootEnd') === true;
  if (explicit) { if (shootStart) player.beginAttack(); if (shootEnd) player.endAttack(); } else player.endAttack();
  let fireDown = Boolean(input.keys & 16); if (explicit) fireDown = Boolean(combat.attacking);
  if (combat.respawn) { player.resetCombatInput(input.keys); return; }
  if (weaponId === WeaponId.None) { player.endAttack(); if (combat.throwing) player.cancelThrow(0); player.rememberCombatInput(input.keys); return; }
  const weapon = context.weaponSystem.get(weaponId), ammo = () => player.ammoFor(weaponId);
  if (weapon.throwable) {
    if (fireDown && ammo() > 0) {
      if (!player.beginThrow()) { player.rememberCombatInput(input.keys); return; }
      const charge = player.chargeThrow(); player.recordShot({ x: state.x, y: state.y, endX: state.x, endY: state.y, z: state.z, life: 2, weapon: weaponId, projectile: false });
      if (weaponId === WeaponId.Grenade && charge >= 96 && !combat.cooldown) { player.fireWeapon(weaponId, weapon.interval, weapon.consumesAmmo !== false); player.finishThrow(weapon.interval); detonate(player, state.x, state.y, state.z, weaponId, context.combat); reportWeaponEmission(player, weaponId, { x: state.x, y: state.y, angle: state.rotation }, context.combat); context.emit({ type: 'shot', actor: player.id, weapon: weaponId, x: state.x, y: state.y, z: state.z }); }
    } else if (!fireDown && combat.throwing && !combat.cooldown && ammo() > 0) {
      const charge = Math.max(1, combat.throwCharge), strength = Math.max(1, Math.min(60, charge)), ratio = strength / 60, direction = directionFromRotation(state.rotation), requestedDistance = weapon.range * (.35 + ratio * .65), speed = Math.max(1, sourceThrowableSpeed(weaponId, strength));
      const life = Math.max(WORLD.projectile.minimumTravelTicks, Math.ceil(requestedDistance / speed * WORLD.tickRate)), projectileLife = weaponId === WeaponId.Grenade ? Math.max(1, Math.floor((96 - charge) / 8)) : life;
      const velocity = sourceThrowableVelocity(weaponId, strength, direction, { x: state.vx, y: state.vy });
      const launchDistance = Math.hypot(velocity.x, velocity.y) * projectileLife / WORLD.tickRate;
      if (launchDistance <= .5) player.cancelThrow(); else {
        const pending = context.spawnWeaponVisual(player.state, weaponId, state.x, state.y, state.z + .5, state.rotation, launchDistance, true);
        pending.configureLaunch({ vx: velocity.x, vy: velocity.y, life: projectileLife, selfDamage: true, vz: WORLD.projectile.sourceThrow.verticalSpeed, gravity: WORLD.projectile.sourceThrow.gravity });
        player.fireWeapon(weaponId, weapon.interval, weapon.consumesAmmo !== false); player.finishThrow(weapon.interval);
        reportWeaponEmission(player, weaponId, { x: state.x, y: state.y, angle: state.rotation }, context.combat);
        const value = pending.state, sequence = player.recordProjectileShot({ x: value.x, y: value.y, endX: value.endX, endY: value.endY, z: value.z, life: pending.lifeRemaining, vx: value.vx, vy: value.vy, weapon: weaponId, projectile: true }); pending.setShotSequence(sequence);
        context.emit({ type: 'shot', actor: player.id, weapon: weaponId, x: state.x, y: state.y, z: state.z });
      }
    } else if (!fireDown && combat.throwing) player.cancelThrow();
    player.rememberCombatInput(input.keys); return;
  }
  const availableAmmo = weapon.consumesAmmo === false ? 1 : ammo();
  if (fireDown && availableAmmo > 0) player.beginAttack(); else player.endAttack();
  if (!fireDown || combat.respawn || combat.cooldown || !availableAmmo) { player.rememberCombatInput(input.keys); return; }
  if (weapon.vehicleOnly && state.vehicleId === undefined) { player.endAttack(); player.rememberCombatInput(input.keys); return; }
  if (weapon.kind === 'slick' || weapon.kind === 'mine') {
    player.endAttack(); const vehicle = state.vehicleId === undefined ? undefined : player.worldState.findVehicle(state.vehicleId);
    if (vehicle?.deployHazard(player, weaponId, context.combat)) { player.fireWeapon(weaponId, weapon.interval); player.recordShot({ x: state.x, y: state.y, endX: state.x, endY: state.y, z: state.z, life: 4, weapon: weaponId, projectile: false }); context.emit({ type: 'shot', actor: player.id, weapon: weaponId, x: state.x, y: state.y, z: state.z }); }
    player.rememberCombatInput(input.keys); return;
  }
  if (weapon.sourceType === 15 || weapon.sourceType === 23) {
    const vehicle = state.vehicleId === undefined ? undefined : player.worldState.findVehicle(state.vehicleId), fired = vehicle ? vehicle.fireCarBomb(player, weapon.sourceType === 23, context.combat) : false;
    if (fired) { player.fireWeapon(weaponId, weapon.interval, weapon.consumesAmmo !== false); reportWeaponEmission(player, weaponId, { x: state.x, y: state.y, angle: state.rotation }, context.combat); player.recordShot({ x: state.x, y: state.y, endX: state.x, endY: state.y, z: state.z, life: 4, weapon: weaponId, projectile: true, impact: true }); context.emit({ type: 'shot', actor: player.id, weapon: weaponId, x: state.x, y: state.y, z: state.z }); }
    player.rememberCombatInput(input.keys); return;
  }
  const origins: { x: number; y: number; angle: number; vx?: number; vy?: number }[] = [];
  if (weapon.vehicleOnly && state.vehicleId !== undefined) { const vehicle = player.worldState.findVehicle(state.vehicleId); if (vehicle && vehicle.canFireWeapon(weapon.sourceType, player.id)) origins.push(...vehicle.weaponOrigins(weapon.sourceType, player.id)); }
  if (weapon.vehicleOnly && !origins.length) { player.endAttack(); player.rememberCombatInput(input.keys); return; }
  if (!origins.length && !weapon.vehicleOnly) origins.push(playerWeaponOrigin(player, weaponId));
  const rays: WeaponRay[] = [], projectiles: ProjectileObject[] = [];
  const spawned = origins.reduce((count, origin) => count + weapon.spread.reduce((inner, spread) => {
    const muzzleActor = origin.vx === undefined ? state : { ...state, vx: origin.vx, vy: origin.vy ?? state.vy };
    const angle = origin.angle + sourceWeaponAngleToRadians(spread), traced = weapon.kind === 'stun' ? context.traceShockerWeapon(muzzleActor, origin.x, origin.y, angle, input.clientTick ?? 'latest') : [context.traceWeaponRay(muzzleActor, weaponId, origin.x, origin.y, angle, input.clientTick ?? 'latest')];
    let made = 0;
    for (const ray of traced) {
      if (ray.distance <= .5 && ray.targets.length === 0) continue;
      rays.push(ray);
      const hitSourceModel = ray.targets.length > 0 ? weapon.hitSourceModel : weapon.missSourceModel;
      if (weapon.kind === 'stun') { rayDamage(player, weaponId, ray, context.combat, hitSourceModel); continue; }
      const immediate = weapon.kind === 'bullet' && ray.targets.length > 0;
      if (immediate) rayDamage(player, weaponId, ray, context.combat, hitSourceModel);
      if (weapon.sourceType === 23) continue;
      projectiles.push(context.spawnWeaponVisual(muzzleActor, weaponId, ray.startX, ray.startY, state.z, ray.rotation, ray.distance, weapon.kind === 'rocket' || weapon.sourceType === 15, !immediate, hitSourceModel));
      made++;
    }
    return inner + made;
  }, 0), 0);
  const first = rays[0], firstOrigin = origins[0]; if (weapon.sourceType === 23 && firstOrigin) detonate(player, firstOrigin.x, firstOrigin.y, state.z, weaponId, context.combat);
  const fired = weapon.sourceType === 23 ? origins.length > 0 : weapon.sourceType === 3 ? rays.length > 0 : spawned > 0;
  if (fired) player.fireWeapon(weaponId, weapon.interval, weapon.consumesAmmo !== false);
  if (fired) {
    const firstOrigin = origins[0];
    if (firstOrigin) reportWeaponEmission(player, weaponId, firstOrigin, context.combat);
    let shotLife = Math.max(1, projectiles[0]?.lifeRemaining ?? projectileTravelTicks(weaponId)); if (weapon.sourceType === 3) shotLife = 4;
    if (weapon.kind === 'stun') for (const ray of rays) player.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: state.z, life: 4, weapon: weaponId, projectile: true, impact: true, beam: true });
    else if (projectiles.length) for (const projectile of projectiles) { const value = projectile.state; const sequence = player.recordProjectileShot({ x: value.x, y: value.y, endX: value.endX, endY: value.endY, z: value.z, life: projectile.lifeRemaining, vx: value.vx, vy: value.vy, weapon: weaponId, projectile: true }); projectile.setShotSequence(sequence); }
    else player.recordShot({ x: firstOrigin?.x ?? state.x, y: firstOrigin?.y ?? state.y, endX: first?.endX ?? state.x, endY: first?.endY ?? state.y, z: state.z, life: shotLife, weapon: weaponId, projectile: true });
    context.emit({ type: 'shot', actor: player.id, weapon: weaponId, x: firstOrigin?.x ?? state.x, y: firstOrigin?.y ?? state.y, z: state.z });
  }
  player.rememberCombatInput(input.keys);
}
