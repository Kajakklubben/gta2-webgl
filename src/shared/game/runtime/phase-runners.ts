import type { PlayerState, TrafficState } from '../../protocol/types';
import type { PlayerObject } from '../gameobjects/player';
import type { VehicleObject } from '../gameobjects/vehicle';
import type { GameObjectCombatContext, GameObjectPlacement } from '../gameobjects/gameobject';
import type { PhysicsBody } from '../../engine/physics-world';
import type { WorldPhaseContext } from '../../engine/world-runtime';
import type { CollisionContact, CollisionStart } from '../physics/collision-world';
import type { WorldTickState } from './types';
import type { SurfaceResult } from '../../domain/physics/map-surface';
import { physicsToWorld } from '../../domain/world/world';
import { directionFromRotation } from '../../domain/physics/motion-vector';
import type { HazardState, WorldEvent } from '../../protocol/types';
import type { PendingProjectile } from './types';

export type PhysicsPhaseHost = {
  readonly playerObjects: readonly PlayerObject[];
  readonly preparePlayerBodies: () => void;
  prepareVehicleBodies: (starts: ReadonlyMap<number, { x: number; y: number; rotation: number }>, dt: number) => void;
  readVehicleBodies: (dt: number) => void;
  prepareNpcBodies: (starts: ReadonlyMap<string, { x: number; y: number }>, dt: number) => void;
  readNpcBodies: () => void;
  physicsStep: (dt: number) => void;
  applySurface: (state: PlayerState, surface: SurfaceResult, dt: number, allowFall: boolean) => void;
  surfaceFor: (state: PlayerState) => SurfaceResult;
  collisionLayer: (state: PlayerState) => number;
  setPlayerCollisionLayer: (player: PlayerState, body: PhysicsBody) => void;
};

export function runPhysicsPhase(host: PhysicsPhaseHost, context: WorldPhaseContext<WorldTickState>) {
  host.preparePlayerBodies();
  host.prepareVehicleBodies(context.state.vehicleStarts, context.dt);
  host.prepareNpcBodies(context.state.entityStarts, context.dt);
  host.physicsStep(context.dt);
  host.readVehicleBodies(context.dt);
  host.readNpcBodies();
  for (const playerObject of host.playerObjects) {
    const body = playerObject.physicsBody;
    const player = playerObject.state;
    if (!body) continue;
    const position = body.getPosition();
    // Entry motion is an authored ped transition toward a door. The source
    // state machine owns that pose until it reaches the outside marker; do
    // not let engine physics integration overwrite it mid-step.
    if ((player.vehicleId !== undefined && player.animation === undefined) || player.animation?.kind === 'entering' || player.animation?.kind === 'exiting') continue;
    const linear = body.getLinearVelocity();
    const pose: GameObjectPlacement = { x: physicsToWorld(position.x), y: -physicsToWorld(position.y), z: player.z, rotation: player.rotation };
    if (player.collisionLayer !== undefined) pose.layer = player.collisionLayer;
    playerObject.applyPhysicsResult(pose, { vx: physicsToWorld(linear.x), vy: -physicsToWorld(linear.y) });
    if (!player.jump && player.vehicleId === undefined) {
      host.applySurface(player, host.surfaceFor(player), context.dt, true);
      host.setPlayerCollisionLayer(player, body);
    }
    if (player.movement && !player.jump) {
      const forward = directionFromRotation(player.rotation);
      player.movement.speed = Math.max(0, Math.abs(player.vx * forward.x + player.vy * forward.y));
    }
  }
}

export type CollisionPhaseHost = {
  syncCollisionWorld: () => void;
  resolveBlocking: (dt: number, starts: ReadonlyMap<string, CollisionStart>) => readonly CollisionContact[];
  applyVehicleImpacts: (contacts: readonly CollisionContact[]) => void;
  applyPedestrianImpacts: (contacts: readonly CollisionContact[]) => void;
  syncBlockedBodies: () => void;
  drainMapContacts: () => readonly { bodyId: string; impact: number; pointX?: number; pointY?: number }[];
  traffic: readonly TrafficState[];
  vehicleObjectFor: (id: number) => VehicleObject | undefined;
  combatContext: () => GameObjectCombatContext;
};

export function runCollisionPhase(host: CollisionPhaseHost, context: WorldPhaseContext<WorldTickState>) {
  if (context.state.playerOnly) return;
  host.syncCollisionWorld();
  const contacts = host.resolveBlocking(context.dt, context.state.entityStarts);
  context.state.contacts = contacts;
  host.applyVehicleImpacts(contacts);
  host.applyPedestrianImpacts(contacts);
  host.syncBlockedBodies();
  for (const mapContact of host.drainMapContacts()) {
    if (!mapContact.bodyId.startsWith('vehicle:')) continue;
    const vehicle = host.traffic.find(item => item.id === Number(mapContact.bodyId.slice('vehicle:'.length)));
    const vehicleObject = vehicle && host.vehicleObjectFor(vehicle.id);
    if (!vehicle || !vehicleObject || (vehicle.health <= 0 && !(vehicle.damagePhase === 'exploding' && vehicle.aiState === 'stuck' && !vehicle.wrecked)) || !vehicleObject.canReceiveCollisionImpact()) continue;
    vehicleObject.markCollisionCooldown();
    vehicleObject.receiveMapImpact(mapContact.impact, host.combatContext(), mapContact.pointX ?? vehicle.x, mapContact.pointY ?? vehicle.y);
    if (mapContact.impact >= 40) host.combatContext().spawnEffect({ x: mapContact.pointX ?? vehicle.x, y: mapContact.pointY ?? vehicle.y, z: vehicle.z + .1, kind: 'impact', life: 8, owner: `vehicle:${vehicle.id}`, rotation: vehicle.rotation, scale: .7 });
  }
}

export type ReplicationPhaseHost = {
  readonly tick: number;
  readonly players: Iterable<PlayerState>;
  readonly traffic: Iterable<TrafficState>;
  readonly history: Map<string, { tick: number; x: number; y: number; z: number }[]>;
  readonly vehicleHistory: Map<number, { tick: number; x: number; y: number; z: number; rotation: number }[]>;
};

export function runReplicationPhase(host: ReplicationPhaseHost, context?: WorldPhaseContext<WorldTickState>) {
  if (context?.state.playerOnly) return;
  for (const player of host.players) {
    const entries = host.history.get(player.id) ?? [];
    entries.push({ tick: host.tick, x: player.x, y: player.y, z: player.z });
    while (entries.length > 90) entries.shift();
    host.history.set(player.id, entries);
  }
  for (const vehicle of host.traffic) {
    const entries = host.vehicleHistory.get(vehicle.id) ?? [];
    entries.push({ tick: host.tick, x: vehicle.x, y: vehicle.y, z: vehicle.z, rotation: vehicle.rotation });
    while (entries.length > 90) entries.shift();
    host.vehicleHistory.set(vehicle.id, entries);
  }
}

export type AiPhaseHost = {
  readonly traffic: readonly TrafficState[];
  maintainTraffic: () => void;
  maintainNpcs: () => void;
  updateNpcAi: (dt: number) => void;
  updateUnoccupiedVehicleDynamics: (dt: number) => void;
  syncCollisionWorld: () => void;
};

export function runAiPhase(host: AiPhaseHost, context: WorldPhaseContext<WorldTickState>) {
  if (context.state.playerOnly) {
    context.state.vehicleStarts = new Map(host.traffic.map(vehicle => [vehicle.id, { x: vehicle.x, y: vehicle.y, rotation: vehicle.rotation }]));
    return;
  }
  host.maintainTraffic();
  host.maintainNpcs();
  host.updateNpcAi(context.dt);
  context.state.vehicleStarts = new Map(host.traffic.map(vehicle => [vehicle.id, { x: vehicle.x, y: vehicle.y, rotation: vehicle.rotation }]));
  host.updateUnoccupiedVehicleDynamics(context.dt);
  host.syncCollisionWorld();
}

export type LifecyclePhaseHost = {
  readonly events: WorldEvent[];
  readonly players: () => Iterable<PlayerState>;
  readonly playerObjectFor: (id: string) => PlayerObject | undefined;
  readonly traffic: readonly TrafficState[];
  readonly vehicleObjectFor: (id: number) => VehicleObject | undefined;
  readonly hazards: HazardState[];
  readonly projectiles: readonly PendingProjectile[];
  readonly spawnProtection: Map<string, number>;
  readonly wantedDecay: Map<string, number>;
  readonly server: boolean;
  readonly wreckFireTicks: number;
  updateGameObjects: (dt: number, playerOnly?: boolean) => void;
  runNpcCombatPhase: () => void;
  tickPlayerStatus: (playerOnly?: boolean) => void;
  updatePlayerJumps: (dt: number, playerOnly?: boolean) => void;
  updateNpcJumps: (dt: number) => void;
  updateVehicleOccupancyTransitions: (dt: number) => void;
  advancePickups: () => ReadonlySet<number>;
  spawnVehicleFireHazard: (vehicle: TrafficState, life: number, effect?: 'fire' | 'explosion') => void;
  removeVehicleFireHazards: (vehicle: TrafficState, effect?: 'fire' | 'explosion') => void;
  syncVehicleFireHazards: () => void;
  removeHazard: (hazard: HazardState) => void;
  syncCollisionWorld: () => void;
  advanceProjectiles: (dt: number) => readonly PendingProjectile[];
  resolveProjectileCollisions: () => void;
  applyProjectileImpactDamage: (projectile: PendingProjectile) => void;
  detonate: (projectile: PendingProjectile) => void;
  removeProjectile: (projectile: PendingProjectile) => void;
};

export function runLifecyclePhase(host: LifecyclePhaseHost, context: WorldPhaseContext<WorldTickState>) {
  host.events.splice(0, host.events.length);
  const playerOnly = context.state.playerOnly;
  host.updateGameObjects(context.dt, playerOnly);
  if (!playerOnly) host.runNpcCombatPhase();
  host.updatePlayerJumps(context.dt, playerOnly);
  if (!playerOnly) host.updateNpcJumps(context.dt);
  if (!playerOnly) host.updateVehicleOccupancyTransitions(context.dt);
  host.tickPlayerStatus(playerOnly);
  if (playerOnly) {
    context.state.reactivated = new Set<number>();
    return;
  }
  for (const [id, value] of host.spawnProtection) {
    if (value <= 1) host.spawnProtection.delete(id); else host.spawnProtection.set(id, value - 1);
  }
  for (const [id, value] of host.wantedDecay) {
    if (value <= 1) {
      host.wantedDecay.delete(id);
      host.playerObjectFor(id)?.decayWanted();
    } else host.wantedDecay.set(id, value - 1);
  }
  context.state.reactivated = host.advancePickups();
  if (host.server) for (const vehicle of host.traffic) {
    const vehicleObject = host.vehicleObjectFor(vehicle.id);
    if (!vehicleObject) continue;
    vehicleObject.tickCollisionCooldown();
    const transition = vehicleObject.tickDamage();
    if (vehicle.damagePhase === 'burning' && !vehicle.fireExtinguished) host.spawnVehicleFireHazard(vehicle, 9_000);
    if (transition.turnedToWreck) {
      vehicleObject.completeWreck();
      host.removeVehicleFireHazards(vehicle, 'explosion');
      host.spawnVehicleFireHazard(vehicle, vehicle.fireTicks ?? host.wreckFireTicks, 'fire');
    }
    if (transition.fireExpired) host.removeVehicleFireHazards(vehicle, 'fire');
  }
  host.syncVehicleFireHazards();
  for (const hazard of [...host.hazards]) if (hazard.life <= 0) host.removeHazard(hazard);
  host.syncCollisionWorld();
  const expired = new Set(host.advanceProjectiles(context.dt));
  host.resolveProjectileCollisions();
  for (const projectile of host.projectiles) if (projectile.state.life <= 0) expired.add(projectile);
  for (const projectile of expired) {
    if (!projectile.state.destroyedByWater) {
      host.applyProjectileImpactDamage(projectile);
      if (projectile.state.explosive) host.detonate(projectile);
    }
    host.removeProjectile(projectile);
  }
}
