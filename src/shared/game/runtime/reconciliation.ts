import { STEP } from '../../protocol/constants';
import type { HazardState, Input, NpcState, PickupState, PlayerState, TrafficState } from '../../protocol/types';
import { cloneHazardSnapshot, cloneNpcSnapshot, cloneTrafficSnapshot, hazardSnapshotCodec, npcSnapshotCodec, playerSnapshotCodec, pickupSnapshotCodec, trafficSnapshotCodec } from '../snapshot-codecs';
import { createHazardObject } from '../effects/hazard';
import { PickupObject } from '../effects/pickup';
import { PlayerObject } from '../gameobjects/player';
import { NpcObject } from '../gameobjects/npc';
import { ensureVehicleOccupancy, occupantForPlayer, syncVehiclePassengers } from '../../domain/vehicles/vehicle-occupancy';
import { worldToPhysics } from '../../domain/world/world';
import type { WorldStepOptions } from './types';

export function step(host: any, inputs: ReadonlyMap<string, number | Input>, options: WorldStepOptions = {}) {
    const stepSeconds = options.stepSeconds ?? STEP;
    host.ensureGameObjectCoverage();
    host.tick++;
    const entityStarts = new Map<string, any>();
    for (const object of host.gameObjects.values()) {
      const placement = object.placement;
      entityStarts.set(`${object.kind}:${String(object.id)}`, { x: placement.x, y: placement.y, rotation: placement.rotation });
    }

    const state = { inputs, playerOnly: options.playerOnly === true, reactivated: new Set<number>(), vehicleStarts: new Map(), entityStarts, contacts: [] };
    host.runtime.run({ tick: host.tick, dt: stepSeconds, state });
  }

export function restore(host: any, state: PlayerState) {
    const current = host.gameState.playerStates.get(state.id);
    if (!current) { host.addPlayer(state.id, state); return; }
    playerSnapshotCodec.apply(current, state);
    if (host.localId) host.gameObjects.findPlayer(current.id)?.syncReplicatedShot();
    const body = host.gameObjects.findPlayer(state.id)?.physicsBody;
    if (body) {
      body.setPosition({ x: worldToPhysics(state.x), y: -worldToPhysics(state.y) });
      body.setLinearVelocity({ x: worldToPhysics(state.vx), y: -worldToPhysics(state.vy) });
      body.setAwake(true);
    }
    // A restored server player is a camera relocation. Let the source-style
    // spawner seed the new camera immediately instead of waiting for a tick.
    host.maintainTraffic();
  }

export function reconcilePickupObjects(host: any) {
    const ids = new Set((host.gameState.pickupStates as PickupState[]).map((pickup: PickupState) => pickup.id));
    for (const object of [...host.gameObjects.values()]) {
      if (object.kind === 'pickup' && !ids.has(Number(object.id))) host.unregisterObject(object);
    }
    for (const pickup of host.gameState.pickupStates as PickupState[]) {
      if (!host.gameObjects.findPickup(pickup.id)) host.registerObject(new PickupObject(pickup));
    }
  }

export function restoreVehicleBody(host: any, vehicle: TrafficState) {
    host.updateVehicleFloor(vehicle);
    const body = host.createVehicleBody(vehicle);
    if (!body) return;
    host.updateVehicleBodyLayer(vehicle, body);
    body.setPosition({ x: worldToPhysics(vehicle.x), y: -worldToPhysics(vehicle.y) });
    body.setAngle(-vehicle.rotation);
    body.setLinearVelocity({ x: worldToPhysics(vehicle.vx), y: -worldToPhysics(vehicle.vy) });
    body.setAngularVelocity(-vehicle.angularVelocity);
    body.setAwake(true);
  }

export function reconcileVehicleObjects(host: any, incoming: readonly TrafficState[]) {
    const incomingIds = new Set(incoming.map(vehicle => vehicle.id));
    for (const vehicle of [...host.gameState.vehicleStates]) if (!incomingIds.has(vehicle.id)) {
      host.trafficSpawner.remove(vehicle.id);
      host.destroyVehicleBody(vehicle.id);
      host.unregisterObject(host.gameObjects.findVehicle(vehicle.id));
      host.vehicleHistory.delete(vehicle.id);
    }
    for (const source of incoming) {
      const current = host.gameState.vehicleStates.find((vehicle: TrafficState) => vehicle.id === source.id);
      if (current) trafficSnapshotCodec.apply(current, cloneTrafficSnapshot(source));
      else {
        const object = host.createVehicleObject(cloneTrafficSnapshot(source));
        host.registerObject(object);
      }
    }
    for (const vehicle of host.gameState.vehicleStates) {
      host.vehicleMetadata(vehicle);
      if (!host.gameObjects.findVehicle(vehicle.id)) host.registerObject(host.createVehicleObject(vehicle));
      host.restoreVehicleBody(vehicle);
    }
    if (host.gameState.vehicleStates.length) host.nextTrafficId = Math.max(host.nextTrafficId, ...host.gameState.vehicleStates.map((vehicle: TrafficState) => vehicle.id + 1));
  }

export function reconcileHazardObjects(host: any, incoming: readonly HazardState[]) {
    const incomingIds = new Set(incoming.map(hazard => hazard.id));
    for (const hazard of [...host.gameState.hazardStates]) if (!incomingIds.has(hazard.id)) host.unregisterObject(host.gameObjects.findHazard(hazard.id));
    for (const source of incoming) {
      const current = host.gameState.hazardStates.find((hazard: HazardState) => hazard.id === source.id);
      if (current) hazardSnapshotCodec.apply(current, cloneHazardSnapshot(source));
      else {
        const created = cloneHazardSnapshot(source);
        host.registerObject(createHazardObject(created));
      }

    }
    for (const hazard of host.gameState.hazardStates as HazardState[]) {
      const surface = host.surfaces.resolve({ x: hazard.x, y: hazard.y, height: hazard.z });
      const support = surface[0];
      if (support && Math.abs(support.height - hazard.z) <= 1.05) hazard.collisionLayer = support.collisionLayer;
    }
    if (host.gameState.hazardStates.length) host.hazardId = Math.max(host.hazardId, ...host.gameState.hazardStates.map((hazard: HazardState) => hazard.id + 1));
  }

export function reconcileNpcObjects(host: any, incoming: readonly NpcState[]) {
    const incomingIds = new Set(incoming.map(npc => npc.id));
    for (const npc of [...host.gameState.npcStates]) if (!incomingIds.has(npc.id)) {
      host.destroyNpcBody(npc.id);
      host.unregisterObject(host.gameObjects.findNpc(npc.id));
    }
    for (const source of incoming) {
      const current = host.gameState.npcStates.find((npc: NpcState) => npc.id === source.id);
      if (current) npcSnapshotCodec.apply(current, cloneNpcSnapshot(source));
      else host.registerObject(host.createNpcObject(cloneNpcSnapshot(source)));
    }
    for (const npc of host.gameState.npcStates as NpcState[]) {
      if (!host.localId) host.createNpcBody(npc);
      const object = host.gameObjects.findNpc(npc.id);
      if (!object) host.registerObject(host.createNpcObject(npc));
      else if (object instanceof NpcObject) object.syncReplicatedShot();
    }
    if (host.gameState.npcStates.length) host.nextNpcId = Math.max(host.nextNpcId, ...host.gameState.npcStates.map((npc: NpcState) => npc.id + 1));
}

  /** Rebuild the two-way links after a snapshot. Traffic is the authoritative
   * owner of seat/door occupancy, while player state carries the convenient
   * vehicle id used by input and rendering. */
export function reconcileVehicleOccupancyLinks(host: any) {
    for (const vehicle of host.gameState.vehicleStates) {
      const metadata = host.vehicleCatalog.get(vehicle.model);
      ensureVehicleOccupancy(vehicle, metadata.info, metadata.bounds);
      syncVehiclePassengers(vehicle);
      for (const occupant of vehicle.occupants) {
        const player = host.gameState.playerStates.get(occupant.id);
        const playerObject = player && host.gameObjects.findPlayer(player.id);
        if (player && playerObject instanceof PlayerObject) {
          let animation: PlayerState['animation'];
          if (occupant.state === 'entering') animation = { kind: 'entering', progress: occupant.progress, straightEntry: occupant.straightEntry };
          else if (occupant.state === 'exiting') animation = { kind: 'exiting', progress: occupant.progress, straightEntry: occupant.straightEntry };
          else if (occupant.state === 'seated') animation = { kind: 'seated', progress: 1 };
          playerObject.syncVehicleOccupancy(vehicle.id, animation);
        }
      }
    }
    for (const player of host.gameState.playerStates.values()) {
      let vehicle: TrafficState | undefined;
      if (player.vehicleId !== undefined) vehicle = host.gameState.vehicleStates.find((item: TrafficState) => item.id === player.vehicleId);
      if (vehicle && occupantForPlayer(vehicle, player.id)) continue;
      if (player.vehicleId !== undefined) {
        const object = host.gameObjects.findPlayer(player.id);
        if (object instanceof PlayerObject) object.clearVehicleOccupancy();
      }
    }
  }

export function restoreWorld(host: any, pickups?: PickupState[], traffic?: TrafficState[], hazards?: HazardState[], npcs?: NpcState[]) {
    if (pickups) {
      host.pickupSystem.replace(pickups, (pickup: PickupState) => host.normalizePickup(pickup));
      host.reconcilePickupObjects();
    }
    if (traffic) host.reconcileVehicleObjects(traffic);
    if (hazards) host.reconcileHazardObjects(hazards);
    if (npcs) host.reconcileNpcObjects(npcs);
    host.reconcileVehicleOccupancyLinks();
  }
export function snapshot(host: any): PlayerState[] {
    return host.gameObjects.players.map((object: PlayerObject) => {
      const state = object.state;
      const placement = object.placement;
      const velocity = object.readPhysicsVelocity();
      const next = {
        ...state,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        rotation: placement.rotation,
      };
      if (placement.layer !== undefined) next.collisionLayer = placement.layer;
      if (velocity.vx !== undefined) next.vx = velocity.vx;
      if (velocity.vy !== undefined) next.vy = velocity.vy;
      return playerSnapshotCodec.toSnapshot(next);
    });
  }
export function snapshotWorld(host: any) {
    return {
      pickups: (host.gameState.pickupStates as PickupState[]).map((pickup: PickupState) => pickupSnapshotCodec.toSnapshot(pickup)),
      traffic: (host.gameState.vehicleStates as TrafficState[]).map((vehicle: TrafficState) => trafficSnapshotCodec.toSnapshot(vehicle)),
      npcs: (host.gameState.npcStates as NpcState[]).map((npc: NpcState) => npcSnapshotCodec.toSnapshot(npc)),
      hazards: (host.gameState.hazardStates as HazardState[]).map((hazard: HazardState) => hazardSnapshotCodec.toSnapshot(hazard)),
    };
  }
