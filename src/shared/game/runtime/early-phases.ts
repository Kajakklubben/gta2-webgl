import type { WorldPhaseContext } from '../../engine/world-runtime';
import type { PendingProjectile, WorldTickState } from './types';
import { GTA2_VEHICLE_DAMAGE } from '../../domain/combat/vehicle-damage';
import {
  runAiPhase as executeAiPhase,
  runLifecyclePhase as executeLifecyclePhase,
  type AiPhaseHost,
  type LifecyclePhaseHost,
} from './phase-runners';
import { runNpcCombatPhase } from './combat-phase';

export function runLifecyclePhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
  const host: LifecyclePhaseHost = {
    events: world.events,
    players: () => world.gameState.playerStates.values(),
    playerObjectFor: (id: string) => world.gameObjects.findPlayer(id),
    traffic: world.gameState.vehicleStates,
    hazards: world.gameState.hazardStates,
    projectiles: world.gameState.projectiles,
    spawnProtection: world.spawnProtection,
    wantedDecay: world.wantedDecay,
    server: !world.localId,
    wreckFireTicks: GTA2_VEHICLE_DAMAGE.wreckFireTicks,
    vehicleObjectFor: (id: number) => world.gameObjects.findVehicle(id),
    updateGameObjects: (dt, playerOnly) => world.updateGameObjects(dt, playerOnly),
    runNpcCombatPhase: () => runNpcCombatPhase(world),
    updatePlayerJumps: (dt, playerOnly) => world.updatePlayerJumps(dt, playerOnly),
    updateNpcJumps: dt => world.updateNpcJumps(dt),
    updateVehicleOccupancyTransitions: dt => world.updateVehicleOccupancyTransitions(dt),
    tickPlayerStatus: playerOnly => world.tickPlayerStatus(playerOnly),
    advancePickups: () => world.pickupSystem.advance((id: number) => world.gameObjects.findPickup(id)),
    spawnVehicleFireHazard: (vehicle, life, effect) => world.spawnVehicleFireHazard(vehicle, life, effect),
    removeVehicleFireHazards: (vehicle, effect) => world.removeVehicleFireHazards(vehicle, effect),
    syncVehicleFireHazards: () => world.syncVehicleFireHazards(),
    removeHazard: hazard => world.unregisterObject(world.gameObjects.findHazard(hazard.id)),
    syncCollisionWorld: () => world.syncCollisionWorld(),
    advanceProjectiles: (dt: number) => {
      const expired: PendingProjectile[] = [];
      for (const projectile of world.gameState.projectiles) if (projectile.advance(dt)) expired.push(projectile);
      return expired;
    },
    resolveProjectileCollisions: () => world.projectileController.resolveCollisions(),
    applyProjectileImpactDamage: (projectile: PendingProjectile) => projectile.resolveImpact(world.gameObjectCombatContext()),
    detonate: (projectile: PendingProjectile) => projectile.detonate(world.gameObjectCombatContext()),
    removeProjectile: projectile => {
      world.unregisterObject(projectile);
    },
  };
  executeLifecyclePhase(host, _context);
}

export function runAiPhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
  const host: AiPhaseHost = {
    traffic: world.gameState.vehicleStates,
    maintainTraffic: () => { if (!world.localId) world.maintainTraffic(); },
    maintainNpcs: () => { if (!world.localId) world.maintainNpcs(); },
    updateNpcAi: dt => { if (!world.localId) world.updateNpcAi(dt); },
    updateUnoccupiedVehicleDynamics: dt => world.updateUnoccupiedVehicleDynamics(dt),
    syncCollisionWorld: () => world.syncCollisionWorld(),
  };
  executeAiPhase(host, _context);
}
