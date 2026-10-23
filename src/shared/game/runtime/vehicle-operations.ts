import type { PlayerState, TrafficState } from '../../protocol/types';
import { worldToPhysics } from '../../domain/world/world';
import { ensureVehicleOccupancy } from '../../domain/vehicles/vehicle-occupancy';
import { vehicleDoorPosition as findVehicleDoorPosition, vehicleExitPosition as findVehicleExitPosition, vehicleMetadata as readVehicleMetadata, type VehicleEntryContext } from './vehicle-entry';
import type { VehicleObject, VehicleObjectContext } from '../gameobjects/vehicle';
import { PlayerObject } from '../gameobjects/player';
import { NpcObject } from '../gameobjects/npc';

export function vehicleMetadata(world: any, vehicle: TrafficState) {
  const metadata = readVehicleMetadata(world.vehicleCatalog, vehicle);
  ensureVehicleOccupancy(vehicle, metadata.info, metadata.bounds);
  return metadata;
}
export function vehicleDoorPosition(world: any, vehicle: TrafficState, player: PlayerState, entering: boolean, role?: 'driver' | 'passenger') {
  // Entry selection is also called for locally spawned traffic, before a
  // network reconciliation pass has had a chance to normalize the snapshot.
  // Keep the live state and the transition object on the same occupancy view.
  vehicleMetadata(world, vehicle);
  return findVehicleDoorPosition(vehicleEntryContext(world), vehicle, player, entering, role);
}

export function vehicleExitPosition(world: any, vehicle: TrafficState, player: PlayerState) {
  vehicleMetadata(world, vehicle);
  return findVehicleExitPosition(vehicleEntryContext(world), vehicle, player);
}

export function vehicleEntryContext(world: any): VehicleEntryContext {
  return {
    traffic: world.gameState.vehicleStates,
    players: world.gameState.playerStates,
    vehicleCatalog: world.vehicleCatalog,
    collisionLayer: (state: any) => world.collisionLayer(state),
    rayCast: (start: any, end: any, accept: any) => world.physicsWorld.rayCast(start, end, accept),
  };
}

export function setPlayerBodyPose(world: any, player: Readonly<PlayerState>) {
  const body = world.gameObjects.findPlayer(player.id)?.physicsBody;
  body?.setPosition({ x: worldToPhysics(player.x), y: -worldToPhysics(player.y) });
  body?.setLinearVelocity({ x: 0, y: 0 });
}

export function vehicleObjectContext(world: any, vehicle: VehicleObject): VehicleObjectContext {
  let metadata: VehicleObjectContext['metadata'];
  if (vehicle.info) metadata = { info: vehicle.info, bounds: vehicle.bounds };
  else metadata = { bounds: vehicle.bounds };
  return {
    metadata,
    playerFor: (id: string) => {
      const object = world.gameObjects.findPlayer(id);
      if (object instanceof PlayerObject) return object;
      return undefined;
    },
    npcFor: (id: string) => {
      const match = /^npc:(\d+)$/.exec(id);
      if (!match) return undefined;
      const object = world.gameObjects.findNpc(Number(match[1]));
      return object instanceof NpcObject ? object : undefined;
    },
    setPlayerBodyPose: (player: PlayerObject) => setPlayerBodyPose(world, player.state),
    damagePlayer: (player: PlayerObject, damage: number) => world.damagePlayer(player.state, damage),
    damageNpc: (npc: NpcObject, damage: number) => npc.applyDamage(damage, 'knockdown'),
    onVehicleExit: (player: PlayerObject) => world.emit({ type: 'vehicle-exit', actor: player.id, entity: vehicle.id, x: player.state.x, y: player.state.y, z: player.state.z }),
  };
}

export function updateVehicleOccupancyTransitions(world: any, dt = 1 / 30) {
  for (const vehicle of world.gameObjects.vehicles) vehicle.updateOccupancy(dt, vehicleObjectContext(world, vehicle));
}

export function tickPlayerStatus(world: any, playerOnly = false) {
  const combat = world.gameObjectCombatContext();
  for (const player of world.gameState.playerStates.values()) {
    if (playerOnly && player.id !== world.localId) continue;
    const object = world.gameObjects.findPlayer(player.id);
    if (object instanceof PlayerObject) object.tickStatus(combat);
  }
  // NPC status is normally updated by NpcObject.update. Run only the
  // post-occupancy water-start check here so a seated driver is tested against
  // the current vehicle pose without advancing its drowning timer twice.
  if (!playerOnly) for (const npc of world.gameState.npcStates) {
    const object = world.gameObjects.findNpc(npc.id);
    if (object instanceof NpcObject) object.tickWaterStatus(combat);
  }
}

export function beginVehicleExit(world: any, player: PlayerState, vehicle: TrafficState, immediate = false) {
  const object = world.gameObjects.findVehicle(vehicle.id);
  const playerObject = world.gameObjects.findPlayer(player.id);
  if (!object || !(playerObject instanceof PlayerObject)) return false;
  for (const exit of vehicleExitPosition(world, vehicle, player)) {
    if (object.beginExit(playerObject, exit, vehicleObjectContext(world, object), immediate)) return true;
  }
  return false;
}

export function beginVehicleEntry(world: any, player: PlayerState, vehicle: TrafficState, candidate: { door: number; seat: number; role: 'driver' | 'passenger'; outsideX: number; outsideY: number; straightEntry: boolean }) {
  const object = world.gameObjects.findVehicle(vehicle.id);
  if (!object) return false;
  const playerObject = world.gameObjects.findPlayer(player.id);
  const entered = playerObject instanceof PlayerObject && object.beginEntry(playerObject, candidate, vehicleObjectContext(world, object));
  if (entered) world.recentVehicleEntries.set(player.id, { vehicleId: vehicle.id, untilTick: world.tick + 8 });
  return entered;
}
