import type { CarInfo } from '../../engine/loader/style-parser';
import type { VehicleBounds } from '../../engine/loader/vehicle-bounds';
import type { TrafficState, VehicleDoorState, VehicleOccupantState } from '../../protocol/types';
export * from './vehicle-door-geometry';
import { VEHICLE_DOOR_ANIMATION_FRAMES, VEHICLE_DOOR_FRAME_DELAY, VEHICLE_DOOR_OPEN_HOLD, vehicleDoorDefinitions, vehicleSeatDefinitions } from './vehicle-door-geometry';

function defaultDoorState(): VehicleDoorState { return { phase: 'closed', frame: 0, timer: 0 }; }
function syncDoorMask(vehicle: TrafficState) {
  vehicle.doors = vehicle.doorStates.reduce((mask, door, index) => {
    if (door.frame > 0) return mask | (1 << index);
    return mask;
  }, 0);
}

/** Normalize old snapshots into the seat-aware representation. */
export function ensureVehicleOccupancy(vehicle: TrafficState, info: CarInfo | undefined, bounds: VehicleBounds) {
  const doors = vehicleDoorDefinitions(info, bounds);
  const seats = vehicleSeatDefinitions(info, bounds);
  let states: VehicleDoorState[];
  if (vehicle.doorStates.length > 0) states = vehicle.doorStates;
  else {
    states = doors.map((_, index) => {
      if ((vehicle.doors ?? 0) & (1 << index)) return { phase: 'open' as const, frame: VEHICLE_DOOR_ANIMATION_FRAMES, timer: VEHICLE_DOOR_OPEN_HOLD };
      return defaultDoorState();
    });
  }
  vehicle.doorStates = doors.map((_, index) => {
    const state = states[index] ?? defaultDoorState();
    return { ...state, frame: Math.max(0, Math.min(VEHICLE_DOOR_ANIMATION_FRAMES, state.frame)), phase: state.phase, timer: state.timer ?? 0 };
  });
  const legacy = vehicle as TrafficState & { driver?: string | null };
  const existing = vehicle.occupants.filter(item => doors.some(door => door.index === item.door));
  const orderedIds = [...vehicle.passengers];
  if (legacy.driver && !orderedIds.includes(legacy.driver)) orderedIds.unshift(legacy.driver);
  if ('driver' in legacy) delete legacy.driver;
  for (const item of existing) if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
  const occupants = orderedIds.map((id, index) => {
    const previous = existing.find(item => item.id === id);
    const seat = seats[index];
    const occupant: VehicleOccupantState = {
      id,
      door: previous?.door ?? seat?.door ?? doors[index]?.index ?? 0,
      state: previous?.state ?? 'seated',
      progress: previous?.progress ?? 1,
    };
    if (previous?.straightEntry !== undefined) occupant.straightEntry = previous.straightEntry;
    return occupant;
  });
  vehicle.occupants = occupants;
  syncVehiclePassengers(vehicle);
  for (const [doorIndex, door] of vehicle.doorStates.entries()) {
    // Door ownership is a transition-only state.  A replicated parked car
    // can legitimately have no occupants while still carrying the previous
    // driver's door id; retaining that id makes openVehicleDoor reject the
    // next player and leaves the entry transition at a closed door forever.
    // Rebuild the owner from the authoritative occupant list instead of
    // trusting a stale transient field from an older snapshot.
    const transitioning = occupants.find(item => item.door === doorIndex && item.state !== 'seated');
    door.occupant = transitioning?.id;

    // A seated occupant does not keep the door open.  Once the authored
    // closing sequence reaches frame 0, leave it closed; reopening here made
    // every settled entry jump back to the fully-open DELS frame on the next
    // metadata pass. Legacy entering/exiting occupants still need their door
    // restored as open when snapshots do not carry door state.
    if (transitioning && door.phase === 'closed' && (transitioning.state === 'entering' || transitioning.state === 'exiting')) {
      door.phase = 'open'; door.frame = VEHICLE_DOOR_ANIMATION_FRAMES;
    }
  }
  syncDoorMask(vehicle);
  return { doors, seats };
}

export function syncVehiclePassengers(vehicle: TrafficState) {
  const occupants = vehicle.occupants;
  const current = vehicle.passengers;
  const ids = current.filter(id => occupants.some(item => item.id === id));
  for (const occupant of occupants) if (!ids.includes(occupant.id)) ids.push(occupant.id);
  vehicle.passengers = ids;
  syncDoorMask(vehicle);
}

export function vehiclePassengerIndex(vehicle: TrafficState, id: string) {
  const index = vehicle.passengers.indexOf(id);
  if (index < 0) throw new Error(`Player ${id} is not a passenger of vehicle ${vehicle.id}`);
  return index;
}

export function occupantForPlayer(vehicle: TrafficState, id: string) {
  return vehicle.occupants.find(item => item.id === id);
}

export function openVehicleDoor(vehicle: TrafficState, doorIndex: number, occupant?: string) {
  const door = vehicle.doorStates[doorIndex];
  if (!door) return false;
  if (door.occupant && door.occupant !== occupant) return false;
  door.occupant = occupant;
  if (door.frame >= VEHICLE_DOOR_ANIMATION_FRAMES) door.phase = 'open';
  else door.phase = 'opening';
  door.timer = 0;
  syncDoorMask(vehicle);
  return true;
}

export function closeVehicleDoor(vehicle: TrafficState, doorIndex: number) {
  const door = vehicle.doorStates[doorIndex];
  if (!door) return false;
  door.occupant = undefined;
  if (door.frame > 0) { door.phase = 'closing'; door.timer = 0; }
  else door.phase = 'closed';
  syncDoorMask(vehicle);
  return true;
}

export function tickVehicleDoors(vehicle: TrafficState) {
  for (const door of vehicle.doorStates) {
    if (door.phase === 'opening') {
      if (door.timer > 0) { door.timer--; continue; }
      door.frame = Math.min(VEHICLE_DOOR_ANIMATION_FRAMES, door.frame + 1);
      door.timer = VEHICLE_DOOR_FRAME_DELAY;
      if (door.frame >= VEHICLE_DOOR_ANIMATION_FRAMES) { door.phase = 'open'; door.timer = VEHICLE_DOOR_OPEN_HOLD; }
    } else if (door.phase === 'open' && !door.occupant) {
      if (door.timer > 0) door.timer--;
      else closeVehicleDoor(vehicle, vehicle.doorStates.indexOf(door));
    } else if (door.phase === 'closing') {
      if (door.timer > 0) { door.timer--; continue; }
      door.frame = Math.max(0, door.frame - 1);
      door.timer = VEHICLE_DOOR_FRAME_DELAY;
      if (door.frame === 0) { door.phase = 'closed'; door.timer = 0; }
    }
  }
  syncDoorMask(vehicle);
}

export function removeVehicleOccupant(vehicle: TrafficState, id: string) {
  const index = vehicle.occupants.findIndex(item => item.id === id);
  if (index < 0) throw new Error(`Player ${id} is not an occupant of vehicle ${vehicle.id}`);
  const occupant = vehicle.occupants.splice(index, 1)[0]!;
  vehicle.passengers = vehicle.passengers.filter(item => item !== id);
  if (vehicle.doorStates[occupant.door]?.occupant === id) closeVehicleDoor(vehicle, occupant.door);
  syncVehiclePassengers(vehicle);
}

export function addVehicleOccupant(vehicle: TrafficState, occupant: VehicleOccupantState, info: CarInfo | undefined, bounds: VehicleBounds) {
  ensureVehicleOccupancy(vehicle, info, bounds);
  if (vehicle.occupants.some(item => item.id === occupant.id)) return false;
  if (vehicle.passengers.length >= vehicleSeatDefinitions(info, bounds).length) return false;
  vehicle.occupants.push(occupant);
  vehicle.passengers = [...vehicle.passengers, occupant.id];
  syncVehiclePassengers(vehicle);
  return true;
}
