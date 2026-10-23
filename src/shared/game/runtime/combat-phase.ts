import type { WorldPhaseContext } from '../../engine/world-runtime';
import { directionFromRotation, rotationFromDirection } from '../../domain/physics/motion-vector';
import {
  GTA2_PLAYER_FIRE_POINT_FORWARD,
  GTA2_PLAYER_FIRE_POINT_RIGHT,
  projectileTravelTicks,
  sourceThrowableVelocity,
  sourceWeaponAngleToRadians,
  WeaponId,
  WEAPONS,
} from '../../domain/combat/weapons';
import type { WeaponRay, WeaponRayActor } from '../../domain/combat/weapon-raycaster';
import { WORLD } from '../../domain/world/world';
import { HitscanImpactObject, type ProjectileObject, type ProjectileStateInput } from '../effects/projectile';
import { createHazardObject } from '../effects/hazard';
import type { NpcState } from '../../protocol/types';
import type { NpcObject } from '../gameobjects/npc';
import type { PlayerCombatContext } from '../gameobjects/player';
import type { GameObjectCombatContext } from '../gameobjects/gameobject';
import type { WorldTickState } from './types';
import type { GameWorld } from '../game-world';
import { canNpcUseVehicleWeapon, selectNpcWeapon, type NpcWeaponSelection } from './npc-weapon-runtime';

const NPC_THROW_STRENGTH = 30;
const NPC_THROW_PRE_RELEASE_TICKS = 4;
const NPC_THROW_RELOAD_TICKS = 50;
const NPC_THROW_SELF_DAMAGE = false;

interface NpcTriggerState {
  cooldown: number;
  throwPending: boolean;
  activeWeapon?: number;
  footWeapon?: number;
  ammoByWeapon: Map<number, number>;
}

/** Runtime-only trigger state keeps source secondary/car weapon selection
 * separate from the compact replicated NPC slot. Weak keys also make despawn
 * and respawn deterministic without a second global entity registry. */
const npcTriggerState = new WeakMap<NpcObject, NpcTriggerState>();
const npcCombatPhaseTick = new WeakMap<GameWorld, number>();

function triggerState(npc: NpcObject): NpcTriggerState {
  let state = npcTriggerState.get(npc);
  if (!state) {
    state = { cooldown: 0, throwPending: false, ammoByWeapon: new Map() };
    npcTriggerState.set(npc, state);
  }
  return state;
}

function npcWeaponOrigin(state: NpcState, weaponId: number) {
  const direction = directionFromRotation(state.rotation), right = { x: Math.cos(state.rotation), y: Math.sin(state.rotation) };
  let forward = GTA2_PLAYER_FIRE_POINT_FORWARD, lateral = GTA2_PLAYER_FIRE_POINT_RIGHT;
  if (weaponId === WeaponId.MachineGun || weaponId === WeaponId.SilencedGun) {
    forward = (0x666 + 0x147) / 0x4000 * WORLD.tileSize;
    lateral = -0x1EB / 0x4000 * WORLD.tileSize;
  } else if (weaponId === WeaponId.Shotgun || weaponId === WeaponId.RocketLauncher || weaponId === WeaponId.ElectroShock || weaponId === WeaponId.StunGun || weaponId === WeaponId.Molotov || weaponId === WeaponId.Grenade) {
    forward = 0;
    lateral = 0;
  }
  return {
    x: state.x + direction.x * forward + right.x * lateral,
    y: state.y + direction.y * forward + right.y * lateral,
    angle: state.rotation,
    vx: state.vx,
    vy: state.vy,
  };
}

function selectNpcTarget(world: GameWorld, npc: NpcState) {
  const gangHostile = npc.kind === 'civilian' && (npc.faction ?? 0) > 0 && npc.state === 'attack';
  if (npc.kind !== 'police' && !gangHostile) return undefined;
  return [...world.gameState.playerStates.values()]
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
}

function selectionForNpc(npcObject: NpcObject, vehicle: ReturnType<GameWorld['gameObjects']['findVehicle']>) {
  const npc = npcObject.mutableNpcState;
  const state = triggerState(npcObject);
  if (npc.vehicleId === undefined) {
    if (state.footWeapon === undefined && npc.weapon !== undefined && !WEAPONS[npc.weapon]?.vehicleOnly) state.footWeapon = npc.weapon;
    return selectNpcWeapon({ ...npc, weapon: state.footWeapon }, undefined);
  }
  return vehicle ? selectNpcWeapon(npc, vehicle.state) : undefined;
}

function activeAmmo(npc: NpcState, state: NpcTriggerState, weaponId: number, definition: typeof WEAPONS[number]) {
  if (!state.ammoByWeapon.has(weaponId)) {
    const initial = npc.weapon === weaponId && npc.weaponAmmo !== undefined
      ? npc.weaponAmmo
      : definition.sourceDefaultAmmo ?? definition.ammo;
    state.ammoByWeapon.set(weaponId, initial);
  }
  const ammo = state.ammoByWeapon.get(weaponId) ?? 0;
  npc.weapon = weaponId;
  npc.weaponAmmo = ammo;
  return ammo;
}

function consumeAmmo(npc: NpcState, state: NpcTriggerState, weaponId: number, definition: typeof WEAPONS[number]) {
  if (definition.consumesAmmo !== false) {
    const ammo = Math.max(0, (state.ammoByWeapon.get(weaponId) ?? 0) - 1);
    state.ammoByWeapon.set(weaponId, ammo);
    npc.weaponAmmo = ammo;
  }
}

function npcActor(npc: NpcState, vehicle: ReturnType<GameWorld['gameObjects']['findVehicle']>, mounted: boolean): WeaponRayActor {
  if (mounted && vehicle) {
    return {
      id: `npc:${npc.id}`, x: vehicle.state.x, y: vehicle.state.y, z: vehicle.state.z,
      vx: vehicle.state.vx, vy: vehicle.state.vy, rotation: vehicle.state.rotation, vehicleId: vehicle.id,
    };
  }
  return {
    id: `npc:${npc.id}`, x: npc.x, y: npc.y, z: npc.z, vx: npc.vx, vy: npc.vy, rotation: npc.rotation,
  };
}

function recordProjectile(npcObject: NpcObject, projectile: ProjectileObject) {
  const value = projectile.state;
  const sequence = npcObject.recordProjectileShot({
    x: value.x, y: value.y, endX: value.endX, endY: value.endY, z: value.z,
    life: projectile.lifeRemaining, vx: value.vx, vy: value.vy, weapon: value.weapon, projectile: true,
  });
  projectile.setShotSequence(sequence);
}

function fireNpcHitscan(world: GameWorld, npcObject: NpcObject, actor: WeaponRayActor, weaponId: number, ray: WeaponRay, combat: GameObjectCombatContext) {
  const target = ray.targets[0];
  if (!target) return false;
  const impactState: ProjectileStateInput = {
    actor: actor.id, weapon: weaponId, x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY,
    z: actor.z, life: 1, rotation: ray.rotation, impact: true, beam: true,
    impactTarget: { kind: target.kind, id: target.state.id }, projectileType: 'shock',
  };
  const sourceModel = world.weaponSystem.get(weaponId).sourceModel;
  if (typeof sourceModel === 'number') impactState.sourceModel = sourceModel;
  const impact = new HitscanImpactObject(`${actor.id}:hitscan:${combat.nextEventId()}`, impactState);
  world.registerObject(impact);
  impact.resolveHitscan(combat);
  world.unregisterObject(impact);
  npcObject.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: actor.z, life: 4, weapon: weaponId, projectile: true, impact: true, beam: true });
  return true;
}

function spawnNpcProjectile(world: GameWorld, actor: WeaponRayActor, weaponId: number, definition: typeof WEAPONS[number], ray: WeaponRay, hitSourceModel: number | undefined) {
  let distance = ray.distance;
  if (definition.throwable) {
    const velocity = sourceThrowableVelocity(weaponId, NPC_THROW_STRENGTH, directionFromRotation(ray.rotation), { x: actor.vx, y: actor.vy });
    distance = Math.max(.51, Math.hypot(velocity.x, velocity.y) * projectileTravelTicks(weaponId) / WORLD.tickRate);
  }
  if (distance <= .5) return undefined;
  const projectile = world.projectileController.spawnVisual(
    actor, weaponId, ray.startX, ray.startY, actor.z + (definition.throwable ? .5 : 0), ray.rotation, distance,
    definition.kind === 'rocket' || definition.kind === 'explosive', true, hitSourceModel,
  );
  if (definition.throwable) {
    const velocity = sourceThrowableVelocity(weaponId, NPC_THROW_STRENGTH, directionFromRotation(ray.rotation), { x: actor.vx, y: actor.vy });
    projectile.configureLaunch({
      vx: velocity.x, vy: velocity.y, life: projectileTravelTicks(weaponId), selfDamage: NPC_THROW_SELF_DAMAGE,
      vz: WORLD.projectile.sourceThrow.verticalSpeed, gravity: WORLD.projectile.sourceThrow.gravity,
    });
  }
  return projectile;
}

function deployNpcHazard(npc: NpcState, vehicle: NonNullable<ReturnType<GameWorld['gameObjects']['findVehicle']>>, weaponId: number, combat: GameObjectCombatContext) {
  const weapon = combat.weaponSystem.get(weaponId), point = vehicle.rearHazardPoint(weapon.sourceType, npc.weaponAmmo ?? 0);
  if (!point || !combat.canPlaceHazard(point.x, point.y, vehicle.state.z)) return false;
  const support = combat.surfaceAt(point.x, point.y, vehicle.state.z)[0];
  const hazard = {
    id: combat.nextHazardId(), x: point.x, y: point.y, z: support?.height ?? point.z,
    kind: weapon.kind === 'mine' ? 'mine' as const : 'slick' as const,
    life: Number.MAX_SAFE_INTEGER, owner: `npc:${npc.id}`, sourceModel: weapon.sourceModel,
    rotation: vehicle.state.rotation, collisionLayer: support?.collisionLayer,
  };
  vehicle.spawn(createHazardObject(hazard));
  return true;
}

function fireNpcWeapon(world: GameWorld, npcObject: NpcObject, selection: NpcWeaponSelection, vehicle: ReturnType<GameWorld['gameObjects']['findVehicle']>, target: NonNullable<ReturnType<typeof selectNpcTarget>>, combat: GameObjectCombatContext) {
  const npc = npcObject.mutableNpcState, weaponId = selection.weaponId, definition = world.weaponSystem.get(weaponId);
  if (selection.vehicleOnly && !selection.mounted) return false;
  const occupantId = `npc:${npc.id}`;
  if (selection.mounted) {
    if (!vehicle || !vehicle.alive || vehicle.driver !== occupantId || !canNpcUseVehicleWeapon(weaponId, vehicle.state)) return false;
    // Mines and slicks are dropped from the rear and do not have a muzzle,
    // but every other mounted dispatch still goes through the vehicle's
    // authored source-type and occupancy gate.
    if (definition.kind !== 'mine' && definition.kind !== 'slick' && !vehicle.canFireWeapon(selection.sourceType, occupantId)) return false;
  }

  if (definition.kind === 'mine' || definition.kind === 'slick') {
    if (!vehicle || !deployNpcHazard(npc, vehicle, weaponId, combat)) return false;
    return true;
  }

  const actor = npcActor(npc, vehicle, selection.mounted);
  const origins = selection.mounted && vehicle
    ? vehicle.weaponOrigins(selection.sourceType, actor.id)
    : [npcWeaponOrigin(npc, weaponId)];
  if (!origins.length) return false;
  let fired = false;
  const projectiles: ReturnType<GameWorld['projectileController']['spawnVisual']>[] = [];
  const rays: WeaponRay[] = [];
  for (const originValue of origins) {
    const origin = originValue as { x: number; y: number; angle: number; vx?: number; vy?: number };
    for (const spread of definition.spread.length ? definition.spread : [0]) {
      const angle = origin.angle + sourceWeaponAngleToRadians(spread);
      const traceActor = { ...actor, vx: origin.vx ?? actor.vx, vy: origin.vy ?? actor.vy };
      const traced = definition.kind === 'stun'
        ? world.weaponRaycaster.traceShocker(traceActor, origin.x, origin.y, angle)
        : [world.weaponRaycaster.trace(traceActor, weaponId, origin.x, origin.y, angle)];
      for (const ray of traced) {
        if (ray.distance <= .5 && ray.targets.length === 0) continue;
        rays.push(ray);
        if (definition.kind === 'stun') {
          if (fireNpcHitscan(world, npcObject, traceActor, weaponId, ray, combat)) fired = true;
          continue;
        }
        const hitSourceModel = ray.targets.length > 0 ? definition.hitSourceModel : definition.missSourceModel;
        const projectile = spawnNpcProjectile(world, traceActor, weaponId, definition, ray, hitSourceModel);
        if (!projectile) continue;
        projectiles.push(projectile);
        fired = true;
      }
    }
  }
  if (!fired) return false;
  if (projectiles.length) for (const projectile of projectiles) recordProjectile(npcObject, projectile);
  else if (definition.kind === 'stun') for (const ray of rays) npcObject.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: actor.z, life: 4, weapon: weaponId, projectile: true, impact: true, beam: true });
  else {
    const first = origins[0], ray = rays[0];
    npcObject.recordShot({ x: first?.x ?? npc.x, y: first?.y ?? npc.y, endX: ray?.endX ?? npc.x, endY: ray?.endY ?? npc.y, z: actor.z, life: Math.max(1, projectileTravelTicks(weaponId)), weapon: weaponId, projectile: true });
  }
  void target;
  return true;
}

export function runNpcCombatPhase(world: GameWorld) {
  const combat = world.gameObjectCombatContext();
  // NPC combat is authoritative. Client worlds only consume replicated shots.
  if (!combat.authoritative || !world.policeAttackPlayer) return;
  // Lifecycle dispatch runs before projectile advancement so a newly spawned
  // projectile participates in this fixed step. Keep the public combat-phase
  // entry point compatible for focused callers without firing twice in a full
  // runtime pass.
  if (npcCombatPhaseTick.get(world) === world.tick) return;
  npcCombatPhaseTick.set(world, world.tick);
  for (const npcObject of world.gameObjects.npcs) {
    const npc = npcObject.mutableNpcState;
    if (npc.health <= 0) continue;
    const vehicle = npc.vehicleId === undefined ? undefined : world.gameObjects.findVehicle(npc.vehicleId);
    const selection = selectionForNpc(npcObject, vehicle);
    if (!selection) continue;
    const target = selectNpcTarget(world, npc);
    if (!target) {
      if (npc.state === 'attack') { npc.state = 'walk'; npc.animation = 'walking'; }
      npc.target = undefined;
      continue;
    }
    npc.target = target.id;
    npc.rotation = rotationFromDirection(target.x - (vehicle?.state.x ?? npc.x), target.y - (vehicle?.state.y ?? npc.y), npc.rotation);
    if (selection.mounted && vehicle) vehicle.mutableVehicleState.turretRotation = npc.rotation;
    npc.state = 'attack';
    npc.animation = selection.mounted ? 'armed' : 'armed';
    const state = triggerState(npcObject);
    if (state.activeWeapon !== selection.weaponId) {
      state.activeWeapon = selection.weaponId;
      state.cooldown = 0;
      state.throwPending = false;
    }
    const weapon = WEAPONS[selection.weaponId];
    if (!weapon) continue;
    const ammo = activeAmmo(npc, state, selection.weaponId, weapon);
    if (state.cooldown > 0) {
      state.cooldown--;
      npc.weaponCooldown = state.cooldown;
      npc.animation = weapon.throwable ? 'throwingIdle' : 'armed';
      continue;
    }
    if (weapon.consumesAmmo !== false && ammo <= 0) continue;
    if (weapon.throwable && !state.throwPending) {
      state.throwPending = true;
      state.cooldown = NPC_THROW_PRE_RELEASE_TICKS;
      npc.weaponCooldown = state.cooldown;
      npc.animation = 'throwing';
      continue;
    }
    if (!fireNpcWeapon(world, npcObject, selection, vehicle, target, combat)) continue;
    consumeAmmo(npc, state, selection.weaponId, weapon);
    state.throwPending = false;
    state.cooldown = weapon.throwable ? NPC_THROW_RELOAD_TICKS : Math.max(1, weapon.interval);
    npc.weaponCooldown = state.cooldown;
    npc.animation = weapon.throwable ? 'throwing' : 'firing';
    combat.emit({ type: 'shot', actor: `npc:${npc.id}`, weapon: selection.weaponId, x: vehicle?.state.x ?? npc.x, y: vehicle?.state.y ?? npc.y, z: vehicle?.state.z ?? npc.z });
  }
}

export function runCombatPhase(world: GameWorld, context: WorldPhaseContext<WorldTickState>) {
  if (context.state.playerOnly) return;
  for (const player of world.gameObjects.players) {
    const id = player.id;
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
