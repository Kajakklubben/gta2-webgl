import type { WorldPhaseContext } from '../../engine/world-runtime';
import { directionFromRotation, rotationFromDirection } from '../../domain/physics/motion-vector';
import { WORLD } from '../../domain/world/world';
import { projectileTravelTicks, sourceThrowableSpeed, WeaponId } from '../../domain/combat/weapons';
import type { PlayerCombatContext } from '../gameobjects/player';
import { HitscanImpactObject, type ProjectileStateInput } from '../effects/projectile';
import type { WorldTickState } from './types';
import type { GameWorld } from '../game-world';

export function runCombatPhase(world: GameWorld, context: WorldPhaseContext<WorldTickState>) {
  if (context.state.playerOnly) return;
  for (const [id] of world.bodies) {
    const player = world.gameObjects.findPlayer(id);
    if (!player) continue;
    const combat: PlayerCombatContext = {
      input: world.input(context.state.inputs.get(id)),
      weaponSystem: world.weaponSystem,
      traceWeaponRay: (actor, weaponId, originX, originY, angle, clientTick) => world.weaponRaycaster.trace(actor, weaponId, originX, originY, angle, clientTick),
      traceShockerWeapon: (actor, originX, originY, angle, clientTick) => world.weaponRaycaster.traceShocker(actor, originX, originY, angle, clientTick),
      spawnWeaponVisual: (actor, weaponId, originX, originY, z, angle, distance, explosive, collision, sourceModelOverride) => world.projectileController.spawnVisual(actor, weaponId, originX, originY, z, angle, distance, explosive, collision, sourceModelOverride),
      combat: world.gameObjectCombatContext(),
      emit: event => world.emit(event),
    };
    player.updateCombat(combat);
  }
  runNpcCombatPhase(world);
}

function runNpcCombatPhase(world: GameWorld) {
  if (!world.policeAttackPlayer) return;
  const players = [...world.gameState.playerStates.values()];
  const combat = world.gameObjectCombatContext();
  for (const npc of world.gameState.npcStates) {
    const gangHostile = npc.kind === 'civilian' && (npc.faction ?? 0) > 0 && npc.state === 'attack';
    if ((npc.kind !== 'police' && !gangHostile) || npc.health <= 0 || npc.vehicleId !== undefined) continue;
    const weaponId = npc.weapon ??= npc.kind === 'police' ? WeaponId.SilencedGun : WeaponId.Pistol;
    npc.weaponAmmo ??= world.weaponSystem.sourceDefaultAmmo(weaponId);
    npc.weaponCooldown ??= 0;
    npc.weaponCooldown = Math.max(0, npc.weaponCooldown - 1);
    const target = players
      .filter(player => player.combat.health > 0 && player.combat.respawn <= 0 && Math.abs(player.z - npc.z) <= WORLD.interaction.sameFloor)
      .filter(player => {
        const threatened = npc.threatenedBy === player.id && (npc.threatTimer ?? 0) > 0;
        return gangHostile
          ? threatened || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact)
          : threatened || player.wanted > 0 || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact);
      })
      .map(player => ({ player, distance: Math.hypot(player.x - npc.x, player.y - npc.y) }))
      .filter(item => item.distance <= WORLD.traffic.policeAttackRadius)
      .sort((a, b) => a.distance - b.distance)[0]?.player;
    if (!target) {
      if (npc.state === 'attack') { npc.state = 'walk'; npc.animation = 'walking'; }
      npc.target = undefined;
      continue;
    }
    npc.target = target.id;
    npc.rotation = rotationFromDirection(target.x - npc.x, target.y - npc.y, npc.rotation);
    npc.state = 'attack'; npc.animation = 'armed';
    if (npc.weaponCooldown > 0 || npc.weaponAmmo <= 0) continue;
    const weapon = world.weaponSystem.get(weaponId);
    if (weapon.vehicleOnly) continue;
    const direction = directionFromRotation(npc.rotation);
    const originX = npc.x + direction.x * 8, originY = npc.y + direction.y * 8;
    const actor = { id: `npc:${npc.id}`, x: npc.x, y: npc.y, z: npc.z, vx: npc.vx, vy: npc.vy, rotation: npc.rotation };
    let rays = world.weaponRaycaster.traceShocker(actor, originX, originY, npc.rotation);
    if (weapon.kind !== 'stun') rays = [world.weaponRaycaster.trace(actor, npc.weapon, originX, originY, npc.rotation)];
    let fired = false;
    if (weapon.kind === 'stun') {
      for (const ray of rays) {
        const target = ray.targets[0];
        if (!target) continue;
        const targetState: NonNullable<ProjectileStateInput['impactTarget']> = { kind: target.kind, id: target.state.id };
        const impactState: ProjectileStateInput = {
          actor: actor.id, weapon: npc.weapon, x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY,
          z: npc.z, life: 1, rotation: ray.rotation, impact: true, beam: true, impactTarget: targetState,
          projectileType: 'shock',
        };
        if (typeof weapon.sourceModel === 'number') impactState.sourceModel = weapon.sourceModel;
        const impact = new HitscanImpactObject(`npc:${npc.id}:hitscan:${world.eventId}`, impactState);
        world.registerObject(impact); impact.resolveHitscan(combat); world.unregisterObject(impact);
        world.gameObjects.findNpc(npc.id)?.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: npc.z, life: 4, weapon: npc.weapon, projectile: true, impact: true, beam: true });
        fired = true;
      }
    } else {
      const ray = rays[0]!;
      if (ray.distance <= .5) continue;
      const sourceModel = ray.targets.length > 0 ? weapon.hitSourceModel : weapon.missSourceModel;
      const projectile = world.projectileController.spawnVisual(actor, npc.weapon, ray.startX, ray.startY, npc.z, ray.rotation, ray.distance, weapon.kind === 'rocket' || weapon.kind === 'explosive', true, sourceModel);
      if (weapon.kind === 'explosive') {
        const speed = sourceThrowableSpeed(npc.weapon, 60), velocity = directionFromRotation(ray.rotation);
        projectile.configureLaunch({
          vx: velocity.x * speed + actor.vx, vy: velocity.y * speed + actor.vy,
          life: projectileTravelTicks(npc.weapon), selfDamage: false,
          vz: WORLD.projectile.sourceThrow.verticalSpeed, gravity: WORLD.projectile.sourceThrow.gravity,
        });
      }
      const npcObject = world.gameObjects.findNpc(npc.id);
      if (npcObject) {
        const sequence = npcObject.recordProjectileShot({ x: projectile.state.x, y: projectile.state.y, endX: projectile.state.endX, endY: projectile.state.endY, z: projectile.state.z, life: projectile.lifeRemaining, vx: projectile.state.vx, vy: projectile.state.vy, weapon: npc.weapon, projectile: true });
        projectile.setShotSequence(sequence);
      }
      fired = true;
    }
    if (!fired) continue;
    npc.weaponAmmo = Math.max(0, npc.weaponAmmo - 1);
    npc.weaponCooldown = weapon.interval;
    world.emit({ type: 'shot', actor: actor.id, weapon: npc.weapon, x: originX, y: originY, z: npc.z });
  }
}
