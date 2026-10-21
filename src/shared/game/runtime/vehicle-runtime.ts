import { INTEREST_RADIUS, STEP } from '../../protocol/constants';
import type { TrafficState } from '../../protocol/types';
import { VehicleObject } from '../gameobjects/vehicle';
import { WORLD, physicsToWorld, worldToPhysics } from '../../domain/world/world';
import { RECYCLED_TRAFFIC_LIMIT } from '../../domain/vehicles/car-traffic';
import { updateVehicleBodyLayer as updateVehiclePhysicsBodyLayer } from '../physics/body-factory';
import { locallyDrivenVehicle } from './prediction';

export function createVehicleObject(host: any, vehicle: TrafficState) {
    const metadata = host.vehicleCatalog.get(vehicle.model);
    // Normalize authored traffic snapshots before their first render/collision
    // pass.  Cars and pedestrians use the same support-height convention;
    // their z value is the top of the supporting map surface, not the block
    // index below it.
    const object = new VehicleObject(vehicle, undefined, metadata.bounds, metadata.physics, metadata.info);
    host.updateVehicleFloor(vehicle);
    // A spawned/reconciled vehicle can already have a map body before its
    // GameObject wrapper is created. Refresh that fixture immediately so the
    // first world tick uses the normalized support layer as well.
    host.updateVehicleBodyLayer(vehicle);
    return object;
  }
export function createVehicleBody(host: any, vehicle: TrafficState) {
    const driven = locallyDrivenVehicle(host);
    if ((host.localId && !driven.some(item => item.id === vehicle.id)) || host.vehicleBodies.has(vehicle.id)) return host.vehicleBodies.get(vehicle.id);
    const body = host.createVehiclePhysicsBody(vehicle);
    host.vehicleBodies.set(vehicle.id, body);
    return body;
  }
export function destroyVehicleBody(host: any, id: number) {
    const body = host.vehicleBodies.get(id);
    if (body) host.destroyPhysicsBody(body);
    host.vehicleBodies.delete(id);
  }
export function updateVehicleBodyLayer(host: any, vehicle: TrafficState, body = host.vehicleBodies.get(vehicle.id)) {
    updateVehiclePhysicsBodyLayer(body, vehicle, state => host.collisionLayer(state));
  }
  /**
   * Resolve the same map surface metadata that CarPhysics_B0 stores in
   * field_98_surface_type/field_A5_current_slope_length. The renderer's map
   * decoder retains the source slope index, so the gradient size and
   * direction can be recovered without inventing a second vehicle surface
   * model.
   */
  /**
   * Run the same source drivetrain pass for every unoccupied car.  A neutral
   * control is the source's parked/coasting input: it applies tyre damping,
   * slope gravity, angular stabilisation, and residual-velocity clamping while
   * The engine physics runtime remains the only integrator that advances the chassis pose.
   */
export function updateUnoccupiedVehicleDynamics(host: any, dt: number) {
    for (const vehicle of host.gameState.vehicleStates) {
      host.updateVehicleFloor(vehicle, dt);
      const object = host.gameObjects.findVehicle(vehicle.id);
      if (!object) continue;
      // The traffic planner mutates route/AI metadata as part of producing its
      // control packet. Do not run that planner for a player-driven chassis:
      // besides being unnecessary, it makes a successfully entered car look
      // AI-controlled in debug output and can overwrite driver state.
      if (object.isPlayerDriven()) {
        object.setPlayerControlMode();
        continue;
      }
      object.setAutonomousControlMode();
      const autonomousTraffic = !host.localId && ((host.carPhysics?.size ?? 0) > 0 || (host.carInfo?.size ?? 0) > 0);
      const control = autonomousTraffic ? host.trafficSpawner.controlFor(vehicle, host.gameState.vehicleStates, host.tick, [...host.gameState.playerStates.values()]) : undefined;
      object.updateUnoccupied(dt, control);
    }
  }
export function updateVehicleFloor(host: any, vehicle: TrafficState, dt = STEP) {
    const object = host.gameObjects.findVehicle(vehicle.id);
    if (!object) return;
    object.updateFloor(
      (points: any, options: any) => host.surfaces.resolveFootprint(points, options),
      () => host.collisionLayer(vehicle),
      (surface: any) => host.applySurface(vehicle, surface, dt, true),
      (surface: any) => object.updateGroundContact(
        surface,
        () => {
          const cx = Math.round(vehicle.x / WORLD.tileSize), cy = Math.round(-vehicle.y / WORLD.tileSize);
          return host.level.traffic.roadNodes.some((node: { x: number; y: number; z: number }) => node.x === cx && node.y === cy && node.z + 1 === host.collisionLayer(vehicle));
        },
      ),
    );
  }
export function prepareVehicleBodies(host: any, starts: ReadonlyMap<number, { x: number; y: number; rotation: number }>, dt = STEP) {
    for (const vehicle of host.gameState.vehicleStates) {
      const body = host.createVehicleBody(vehicle);
      if (!body) continue;
      host.updateVehicleFloor(vehicle, dt);
      const start = starts.get(vehicle.id) ?? { x: vehicle.x, y: vehicle.y, rotation: vehicle.rotation };
      const object = host.gameObjects.findVehicle(vehicle.id);
      if (object) object.preparePhysics(body, start, worldToPhysics, () => host.updateVehicleBodyLayer(vehicle, body));
    }
  }
export function readVehicleBodies(host: any, dt = STEP) {
    for (const vehicle of host.gameState.vehicleStates) {
      const body = host.vehicleBodies.get(vehicle.id);
      if (!body) continue;
      const object = host.gameObjects.findVehicle(vehicle.id);
      if (object) {
        object.readPhysics(body, physicsToWorld, { afterRead: () => host.updateVehicleFloor(vehicle, dt) });
        object.syncSeatedOccupants(host.vehicleObjectContext(object));
      }
    }
  }
export function maintainTraffic(host: any) {
    if (host.localId || !host.gameState.playerStates.size) return;
    const players = [...host.gameState.playerStates.values()];
    for (const vehicle of [...host.gameState.vehicleStates]) {
      if (!vehicle) continue;
      if (players.some(player => Math.hypot(vehicle.x - player.x, vehicle.y - player.y) <= INTEREST_RADIUS)) continue;
      host.trafficSpawner.remove(vehicle.id);
      host.destroyVehicleBody(vehicle.id);
      host.unregisterObject(host.gameObjects.findVehicle(vehicle.id));
      host.vehicleHistory.delete(vehicle.id);
    }
    if (host.gameState.vehicleStates.length >= RECYCLED_TRAFFIC_LIMIT) return;
    for (const player of players) {
      if (host.gameState.vehicleStates.length >= RECYCLED_TRAFFIC_LIMIT) break;
      const occupied = [...host.gameState.playerStates.values(), ...host.gameState.vehicleStates].map(item => ({ x: item.x, y: item.y, z: item.z }));
      const spawned = host.trafficSpawner.spawnAround(player.x, player.y, host.nextTrafficId, occupied, host.tick, player.z);
      host.nextTrafficId += spawned.length;
      for (const vehicle of spawned) {
        host.createVehicleBody(vehicle);
        const object = host.createVehicleObject(vehicle);
        host.registerObject(object);
      }
    }
    // Public transport is source-owned rather than a random parked-car pick:
    // one bus/rail service is kept alive when the map exposes its authored
    // stops and the style supplies a matching vehicle model.
    if ((host.carInfo?.size || host.carPhysics?.size) && host.gameState.vehicleStates.length < RECYCLED_TRAFFIC_LIMIT) {
      for (const kind of ['bus', 'train'] as const) {
        if (host.gameState.vehicleStates.some((vehicle: TrafficState) => vehicle.transport === kind)) continue;
        const hasZones = kind === 'bus' ? host.level.traffic.busStopZones.length > 0 : host.level.zones.some((zone: { typeName: string }) => zone.typeName === 'railway-entry' || zone.typeName === 'railway-platform');
        if (!hasZones) continue;
        const spawned = host.trafficSpawner.spawnServiceVehicle(kind, host.nextTrafficId, host.tick, players[0]?.z ?? 0);
        host.nextTrafficId += spawned.length;
        for (const vehicle of spawned) {
          host.createVehicleBody(vehicle);
          host.registerObject(host.createVehicleObject(vehicle));
        }
      }
    }
  }

