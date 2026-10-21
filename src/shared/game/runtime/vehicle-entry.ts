import type { PlayerState, TrafficState } from '../../protocol/types';
import { WORLD } from '../../domain/world/world';
import { mapFixtureMatches } from '../physics/map-fixtures';
import type { VehicleCatalog } from '../../domain/vehicles/vehicle-catalog';
import { ensureVehicleOccupancy, occupantForPlayer, vehicleDoorDefinitions, vehicleDoorPoint, vehiclePassengerIndex, vehicleSeatDefinitions } from '../../domain/vehicles/vehicle-occupancy';

export type VehicleDoorPosition = {
  door: number;
  seat: number;
  role: 'driver' | 'passenger';
  outsideX: number;
  outsideY: number;
  straightEntry: boolean;
};

export type VehicleExitPosition = {
  door: number;
  seat: number;
  exitX: number;
  exitY: number;
};

export type VehicleEntryContext = {
  readonly traffic: readonly TrafficState[];
  readonly players: ReadonlyMap<string, Readonly<PlayerState>>;
  readonly vehicleCatalog: VehicleCatalog;
  readonly collisionLayer: (state: { z: number; collisionLayer?: number | undefined }) => number;
  readonly rayCast: (start: { x: number; y: number }, end: { x: number; y: number }, accept: (fixture: unknown) => boolean) => number;
};

export function vehicleMetadata(catalog: VehicleCatalog, vehicle: TrafficState) {
  const metadata = catalog.get(vehicle.model);
  // Entry is used from both authoritative input and direct scenario/debug
  // callers. Normalize at this boundary as well as during reconciliation so a
  // parked snapshot cannot retain a door owner from an older occupant list.
  ensureVehicleOccupancy(vehicle, metadata.info, metadata.bounds);
  return metadata;
}

export function vehicleDoorAccessible(ctx: VehicleEntryContext, vehicle: TrafficState, door: number, player?: Readonly<PlayerState>) {
  const metadata = vehicleMetadata(ctx.vehicleCatalog, vehicle);
  const point = vehicleDoorPoint(vehicle, door, metadata.info, metadata.bounds);
  const clear = (start: { x: number; y: number }, end: { x: number; y: number }) => ctx.rayCast(
    start,
    end,
    fixture => mapFixtureMatches(fixture, ctx.collisionLayer(vehicle), 'movement'),
  );
  // FindUsableCarDoor tests the pedestrian's route to the authored door
  // point. A second centre-to-door ray made valid cars fail whenever a wall or
  // map object clipped the chassis footprint, which is why entry felt random
  // after traffic was enabled. Exiting has no pedestrian route yet, so retain
  // the chassis check for that path.
  if (player) {
    if (clear({ x: player.x, y: player.y }, { x: point.x, y: point.y }) < .98) return false;
  } else if (clear({ x: vehicle.x, y: vehicle.y }, { x: point.x, y: point.y }) < .98) return false;
  return true;
}

export function vehicleDoorPosition(
  ctx: VehicleEntryContext,
  vehicle: TrafficState,
  player: Readonly<PlayerState>,
  _entering: boolean,
  role?: 'driver' | 'passenger',
): VehicleDoorPosition[] {
  const metadata = vehicleMetadata(ctx.vehicleCatalog, vehicle);
  let currentSpeed = Math.hypot(vehicle.vx, vehicle.vy);
  if (vehicle.wrecked && vehicle.health > 0) currentSpeed = 0;
  if (currentSpeed > WORLD.vehicle.occupancySpeedLimit) return [];
  const occupants = vehicle.occupants;
  const seats = vehicleSeatDefinitions(metadata.info, metadata.bounds);
  // An NPC in seat zero is the traffic driver.  A player entering that car
  // takes the driver seat (the NPC is removed when the entry is committed),
  // so keep that seat and its authored door eligible for carjacking.
  const driverId = vehicle.passengers[0];
  const npcDriverId = driverId?.startsWith('npc:') ? driverId : undefined;
  const takingNpcDriver = role === 'driver' && npcDriverId !== undefined;
  const usedSeats = new Set(occupants
    .filter(item => item.id !== player.id && !(takingNpcDriver && item.id === npcDriverId))
    .map(item => vehiclePassengerIndex(vehicle, item.id)));
  const usedDoors = new Set(occupants
    .filter(item => item.id !== player.id && !(takingNpcDriver && item.id === npcDriverId))
    .map(item => item.door));
  const doors = vehicleDoorDefinitions(metadata.info, metadata.bounds);
  const candidates: (VehicleDoorPosition & { distanceToPlayer: number; preferredDoor: number })[] = [];
  for (const seat of seats) {
    if (usedSeats.has(seat.index) || (role !== undefined && seat.role !== role)) continue;
    for (const door of doors) {
      const point = vehicleDoorPoint(vehicle, door.index, metadata.info, metadata.bounds);
      if (usedDoors.has(door.index) || !vehicleDoorAccessible(ctx, vehicle, door.index, player)) continue;
      const occupied = ctx.traffic.some(other => other.id !== vehicle.id && other.health > 0 && other.z === vehicle.z && Math.hypot(other.x - point.outsideX, other.y - point.outsideY) < WORLD.vehicle.collisionDistance)
        || [...ctx.players.values()].some(other => other.id !== player.id && other.vehicleId === undefined && other.combat.respawn === 0 && Math.hypot(other.x - point.outsideX, other.y - point.outsideY) < WORLD.player.radius * 2);
      if (occupied) continue;
      candidates.push({ ...point, door: door.index, seat: seat.index, role: seat.role, distanceToPlayer: Math.hypot(player.x - point.outsideX, player.y - point.outsideY), preferredDoor: seat.door });
    }
  }
  const preferredDoorPriority = (candidate: VehicleDoorPosition & { preferredDoor: number }) => {
    if (candidate.door === candidate.preferredDoor) return -1;
    return 0;
  };
  return candidates
    .sort((a, b) => a.distanceToPlayer - b.distanceToPlayer || preferredDoorPriority(a) - preferredDoorPriority(b) || a.door - b.door)
    .map(({ distanceToPlayer: _distanceToPlayer, preferredDoor: _preferredDoor, ...candidate }) => candidate);
}

export function vehicleExitPosition(ctx: VehicleEntryContext, vehicle: TrafficState, player: Readonly<PlayerState>): VehicleExitPosition[] {
  const occupant = occupantForPlayer(vehicle, player.id);
  if (!occupant) return [];
  const metadata = vehicleMetadata(ctx.vehicleCatalog, vehicle);
  const seats = vehicleSeatDefinitions(metadata.info, metadata.bounds);
  const passengerIndex = vehiclePassengerIndex(vehicle, player.id);
  // Seat zero is the driver and its authored preferred door is the rendered
  // left-front door. Try that door first, then fall back when it is blocked.
  const preferredDoor = seats[passengerIndex]?.door ?? occupant.door;
  // An occupant that is already leaving still owns its door until the exit
  // transition detaches it. Treat that door as unavailable so two occupants
  // cannot be animated through the same opening at once.
  const usedDoors = new Set(vehicle.occupants.filter(item => item.id !== player.id).map(item => item.door));
  const doorOrder = [preferredDoor, occupant.door, ...vehicleDoorDefinitions(metadata.info, metadata.bounds).map(door => door.index)]
    .filter((door, index, list) => list.indexOf(door) === index);
  for (const door of doorOrder) {
    const doorState = vehicle.doorStates[door];
    if (usedDoors.has(door) || (doorState?.occupant !== undefined && doorState.occupant !== player.id) || !vehicleDoorAccessible(ctx, vehicle, door)) continue;
    const point = vehicleDoorPoint(vehicle, door, metadata.info, metadata.bounds);
    const occupied = ctx.traffic.some(other => other.id !== vehicle.id && other.health > 0 && other.z === vehicle.z && Math.hypot(other.x - point.exitX, other.y - point.exitY) < WORLD.vehicle.collisionDistance)
      || [...ctx.players.values()].some(other => other.id !== player.id && other.vehicleId === undefined && other.combat.respawn === 0 && Math.hypot(other.x - point.exitX, other.y - point.exitY) < WORLD.player.radius * 2);
    if (!occupied) return [{ ...point, door, seat: passengerIndex }];
  }
  return [];
}
