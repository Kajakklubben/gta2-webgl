import type { CarInfo } from '../../engine/loader/style-parser';
import type { VehicleBounds } from '../../engine/loader/vehicle-bounds';
import { normalizeRotation } from '../physics/motion-vector';
import { WORLD } from '../world/world';
import type { TrafficState, VehicleSeatRole } from '../../protocol/types';

/** The four delta groups used by Car_Door_10::sub_439CD0/sub_439D40. */
export const VEHICLE_DOOR_DELTA_SLOTS = [7, 24, 11, 28] as const;
export const VEHICLE_DOOR_ANIMATION_FRAMES = 4;
export const VEHICLE_DOOR_FRAME_DELAY = 2;
export const VEHICLE_DOOR_OPEN_HOLD = 50;

/** CARI's `dword_6772BC` is 0xCCC in 16.14 fixed point: 12.8 pixels. */
export const SOURCE_DOOR_CENTER_OFFSET = 0xccc / 0x4000 * WORLD.tileSize;

export interface VehicleDoorDefinition {
  index: number;
  /** Encoded CARI x value, retained for the inclusive +/-64 marker. */
  rx: number;
  ry: number;
  positionX: number;
  positionY: number;
  straightEntry: boolean;
}

export interface VehicleSeatDefinition {
  index: number;
  role: VehicleSeatRole;
  door: number;
}

export interface VehicleDoorPoint {
  x: number;
  y: number;
  /** Point at the first source entry pose before the transition. */
  outsideX: number;
  outsideY: number;
  /** Point left by the source after the final exit pose. */
  exitX: number;
  exitY: number;
  /** Point inside the car used while the ped is seated. */
  seatX: number;
  seatY: number;
  straightEntry: boolean;
}

export interface VehicleDoorAlignment {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Map Char_B4's discrete entry animation frame to the phase consumed by
 * CarDoorAlignmentSolver_545AF0. The source reuses phases 0..3 for frames
 * 4..7 on a normal side entry, while a straight entry walks back through
 * phases 7..0. Phase 8 is the terminal pose inside the car.
 */
export function vehicleEntryAlignmentPhase(frame: number, straightEntry: boolean) {
  const sourceFrame = Math.max(0, Math.min(8, Math.floor(frame)));
  if (sourceFrame >= 8) return 8;
  if (straightEntry) return 7 - sourceFrame;
  if (sourceFrame < 4) return sourceFrame;
  return sourceFrame - 4;
}

/** Map Char_B4's exit frames to the source door-alignment phases. */
export function vehicleExitAlignmentPhase(frame: number, straightEntry: boolean) {
  const sourceFrame = Math.max(0, Math.min(8, Math.floor(frame)));
  if (sourceFrame >= 8) return 8;
  if (straightEntry) return sourceFrame;
  if (sourceFrame < 4) return 7 - sourceFrame;
  return sourceFrame - 4;
}

/** The four logical DELS groups used by Car_Door_10. */
export function vehicleDoorLogicalDelta(doorIndex: number, frame = 1) {
  const slot = VEHICLE_DOOR_DELTA_SLOTS[doorIndex as 0 | 1 | 2 | 3];
  if (slot === undefined) throw new RangeError(`Unknown vehicle door ${doorIndex}`);
  return slot + Math.max(0, Math.min(3, frame - 1));
}

/**
 * Map an authored door to the DELS group that is visible in our sprite
 * renderer.  GTA2's source sprite is displayed with a 180 degree placement
 * offset (the same offset used by every actor GameObject), so its horizontal
 * door groups appear on the opposite screen side.  Keep the source table
 * above intact and swap only the paired side at this rendering boundary.
 */
export function vehicleDoorRenderDelta(doorIndex: number, frame = 1) {
  return vehicleDoorLogicalDelta(doorIndex ^ 1, frame);
}

const fallbackDoors = (bounds: VehicleBounds): VehicleDoorDefinition[] => [
  { index: 0, rx: -bounds.width * .5, ry: 0, positionX: -bounds.width * .5, positionY: 0, straightEntry: false },
  { index: 1, rx: bounds.width * .5, ry: 0, positionX: bounds.width * .5, positionY: 0, straightEntry: false },
];

export function vehicleDoorDefinitions(info: CarInfo | undefined, bounds: VehicleBounds): VehicleDoorDefinition[] {
  // An absent CarInfo means a legacy/network snapshot without authored CARI
  // metadata, so retain the rectangle fallback for that case. An authored
  // empty door list is meaningful: trailers, wrecks, and rail stock really
  // have no usable entry doors and must not become enterable two-door cars.
  let doors: CarInfo['doors'] | VehicleDoorDefinition[];
  if (info === undefined) doors = fallbackDoors(bounds);
  else doors = info.doors;
  return doors.map((door, index) => ({ index, rx: door.rx, ry: door.ry, positionX: door.positionX, positionY: door.positionY, straightEntry: door.straightEntry }));
}

/**
 * CARI stores the passenger count separately from the doors. The source
 * always treats seat zero as the driver and uses CARI's source door order
 * (right front, left front, right rear, left rear) for the available seats.
 * `door` is the seat's preferred door; FindUsableCarDoor may select another
 * accessible door for the same seat when the player approaches elsewhere.
 */
export function vehicleSeatDefinitions(info: CarInfo | undefined, bounds: VehicleBounds): VehicleSeatDefinition[] {
  const doors = vehicleDoorDefinitions(info, bounds);
  const capacity = Math.max(0, info?.passengers ?? 0);
  // Keep the one-seat legacy fallback only for snapshots with no CARI record.
  // A decoded vehicle with zero doors has no seats reachable by the source
  // occupancy state machine.
  if (!doors.length) {
    if (info === undefined) return [{ index: 0, role: 'driver', door: 0 }];
    return [];
  }
  const firstDoor = doors[0];
  if (!firstDoor) return [];
  const frontRight = firstDoor.index;
  const frontLeft = (doors[1] ?? firstDoor).index;
  const rear = doors.filter(door => door.index >= 2).map(door => door.index);
  const seats: VehicleSeatDefinition[] = [{ index: 0, role: 'driver', door: frontLeft }];
  const passengerDoors = [frontRight, ...rear, ...doors.map(door => door.index)];
  for (let seat = 1; seat <= capacity; seat++) {
    const door = passengerDoors[(seat - 1) % passengerDoors.length];
    if (door === undefined) throw new Error('Vehicle passenger door list is unexpectedly empty');
    seats.push({ index: seat, role: 'passenger', door });
  }
  return seats;
}

/**
 * Transform a chassis-local point into the runtime world coordinates.
 *
 * Vehicle state is already expressed in the renderer's y-up world space
 * (map y has been inverted at load time), so this is the ordinary 2D
 * rotation used by Three.js. Keeping it here gives entry logic, debug
 * overlays, and scenario fixtures one placement transform.
 */
export function rotateVehicleLocal(x: number, y: number, rotation: number) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return { x: x * c - y * s, y: x * s + y * c };
}

const sourceFixedPixels = (value: number) => value / 0x4000 * WORLD.tileSize;
const SOURCE_ALIGN_POINT1 = sourceFixedPixels(0x666);
const SOURCE_ALIGN_POINT06 = sourceFixedPixels(0x3d7);
const SOURCE_ALIGN_POINT02 = sourceFixedPixels(0x147);
const SOURCE_ALIGN_POINT08 = sourceFixedPixels(0x51e);
const SOURCE_ALIGN_POINT04 = sourceFixedPixels(0x28f);
const SOURCE_ALIGN_POINT3 = sourceFixedPixels(0x1333);
const SOURCE_ALIGN_HALF = sourceFixedPixels(0x333);
const SOURCE_ALIGN_THRESHOLD = 64;

function authoredDoorLocalPosition(door: VehicleDoorDefinition, doorIndex: number, info: CarInfo | undefined) {
  let x = door.positionX, y = door.positionY;
  // GetDoorWorldPosition and CarDoorAlignmentSolver share the same CARI
  // center correction. Fallback doors are already runtime chassis points.
  if (info?.doors?.length) switch (doorIndex) {
    case 0: x += SOURCE_DOOR_CENTER_OFFSET; break;
    case 1:
    case 3: x -= SOURCE_DOOR_CENTER_OFFSET; break;
    case 2:
      if (x === 0) y -= SOURCE_DOOR_CENTER_OFFSET;
      else if (x < 0) x -= SOURCE_DOOR_CENTER_OFFSET;
      else x += SOURCE_DOOR_CENTER_OFFSET;
      break;
    default: break;
  }
  return { x, y };
}

/**
 * Port of Ped.cpp's CarDoorAlignmentSolver_545AF0. The returned local points
 * use the browser's world-pixel convention; all source fixed-point constants
 * are converted once above. Phase 0..12 is the source animation phase and 99
 * is the source's initial accessibility pose.
 */
export function vehicleDoorAlignment(vehicle: TrafficState, doorIndex: number, phase: number, info: CarInfo | undefined, bounds: VehicleBounds): VehicleDoorAlignment {
  const door = vehicleDoorDefinitions(info, bounds).find(candidate => candidate.index === doorIndex);
  if (!door) throw new RangeError(`Unknown vehicle door ${doorIndex}`);
  // Synthetic or legacy snapshots may not have CARI. Keep their rectangle
  // fallback usable without applying the source's authored 0xCCC correction
  // to a point that was already derived from the runtime chassis bounds.
  if (!info?.doors?.length) {
    const progress = Math.max(0, Math.min(1, phase / 8));
    const local = { x: door.positionX * (1 - progress * .5), y: door.positionY * (1 - progress * .5) };
    const rotated = rotateVehicleLocal(local.x, local.y, vehicle.rotation);
    return { x: vehicle.x + rotated.x, y: vehicle.y + rotated.y, rotation: normalizeRotation(vehicle.rotation) };
  }
  // The source solver starts from the raw CARI pair, then applies its own
  // 0xCCC correction below. Do not feed it GetDoorWorldPosition's already
  // corrected coordinate.
  let { x, y } = { x: door.positionX, y: door.positionY };
  // The solver reads the encoded CARI value and removes the +/-64 straight
  // marker before applying the phase offsets.
  let straight = door.straightEntry;
  if (info?.doors?.length) {
    straight = Math.abs(door.rx) >= SOURCE_ALIGN_THRESHOLD;
    if (straight) {
      if (door.rx > 0) x = door.rx - SOURCE_ALIGN_THRESHOLD;
      else x = door.rx + SOURCE_ALIGN_THRESHOLD;
    }
  }
  let front = false;
  let outputRotation = vehicle.rotation;
  const add = (value: number) => { x += value; };
  const sub = (value: number) => { x -= value; };

  if (doorIndex === 0 || doorIndex === 2) {
    if (x === 0) { y -= SOURCE_DOOR_CENTER_OFFSET; front = true; }
    else if (x < 0) x -= SOURCE_DOOR_CENTER_OFFSET;
    else x += SOURCE_DOOR_CENTER_OFFSET;
    if (straight) {
      y -= SOURCE_ALIGN_POINT1;
      switch (phase) {
        case 0: sub(SOURCE_DOOR_CENTER_OFFSET); break;
        case 1: sub(SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT06); break;
        case 2: sub(SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT02); break;
        case 3: sub(SOURCE_ALIGN_POINT08); break;
        case 4: sub(SOURCE_ALIGN_POINT04); break;
        case 6: add(SOURCE_ALIGN_POINT04); break;
        case 7: add(SOURCE_ALIGN_POINT08); break;
      }
    }
    if (front) {
      switch (phase) {
        case 0: y += SOURCE_DOOR_CENTER_OFFSET; break;
        case 1: y += SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT06; break;
        case 2: y += SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT02; break;
        case 3: y += SOURCE_ALIGN_POINT08; break;
        case 4: y += SOURCE_ALIGN_POINT04; break;
        case 6: y -= SOURCE_ALIGN_POINT04; break;
        case 7: y -= SOURCE_ALIGN_POINT06; break;
      }
    } else if (!straight) {
      switch (phase) {
        case 0: y -= SOURCE_ALIGN_POINT1; x -= SOURCE_ALIGN_POINT1; break;
        case 1: y -= SOURCE_ALIGN_POINT1; x -= SOURCE_ALIGN_HALF; break;
        case 2: y -= SOURCE_ALIGN_POINT1; break;
        case 3: y -= SOURCE_ALIGN_POINT1; x += SOURCE_ALIGN_HALF; break;
        case 4: y -= SOURCE_ALIGN_HALF; x -= SOURCE_ALIGN_POINT1; break;
        case 5: y -= SOURCE_ALIGN_HALF; x -= SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_HALF; break;
        case 6: y -= SOURCE_ALIGN_HALF; x -= SOURCE_DOOR_CENTER_OFFSET; break;
        case 7: y -= SOURCE_ALIGN_HALF; x -= SOURCE_DOOR_CENTER_OFFSET + SOURCE_ALIGN_HALF; break;
        case 8: y -= SOURCE_ALIGN_HALF; x -= SOURCE_ALIGN_POINT3; break;
        case 9:
        case 10:
        case 11:
        case 12: y -= SOURCE_ALIGN_POINT02 + SOURCE_ALIGN_POINT1; x -= SOURCE_ALIGN_POINT04; break;
        case 99: x += SOURCE_ALIGN_POINT1; break;
      }
      outputRotation = vehicle.rotation;
    }
    if (straight) outputRotation = vehicle.rotation + Math.PI / 2;
    else if (front) outputRotation = vehicle.rotation + Math.PI;
    else outputRotation = vehicle.rotation + Math.PI / 2;
  } else if (doorIndex === 1 || doorIndex === 3) {
    x -= SOURCE_DOOR_CENTER_OFFSET;
    if (straight) {
      y -= SOURCE_ALIGN_POINT1;
      switch (phase) {
        case 0: add(SOURCE_DOOR_CENTER_OFFSET); break;
        case 1: add(SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT06); break;
        case 2: add(SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_POINT02); break;
        case 3: add(SOURCE_ALIGN_POINT08); break;
        case 4: add(SOURCE_ALIGN_POINT04); break;
        case 6: sub(SOURCE_ALIGN_POINT04); break;
        case 7: sub(SOURCE_ALIGN_POINT08); break;
      }
    } else {
      switch (phase) {
        case 0: y -= SOURCE_ALIGN_POINT1; add(SOURCE_ALIGN_POINT1); outputRotation = vehicle.rotation + Math.PI; break;
        case 1: y -= SOURCE_ALIGN_POINT1; add(SOURCE_ALIGN_HALF); outputRotation = vehicle.rotation + Math.PI; break;
        case 2: y -= SOURCE_ALIGN_POINT1; outputRotation = vehicle.rotation + Math.PI; break;
        case 3: y -= SOURCE_ALIGN_POINT1; sub(SOURCE_ALIGN_HALF); outputRotation = vehicle.rotation + Math.PI; break;
        case 5: y -= SOURCE_ALIGN_HALF; add(SOURCE_ALIGN_POINT1 + SOURCE_ALIGN_HALF); outputRotation = vehicle.rotation; break;
        case 6: y -= SOURCE_ALIGN_HALF; add(SOURCE_DOOR_CENTER_OFFSET); outputRotation = vehicle.rotation; break;
        case 7: y -= SOURCE_ALIGN_HALF; add(SOURCE_DOOR_CENTER_OFFSET + SOURCE_ALIGN_HALF); outputRotation = vehicle.rotation; break;
        case 4:
        case 8: y -= SOURCE_ALIGN_HALF; add(SOURCE_ALIGN_POINT1); outputRotation = vehicle.rotation; break;
        case 9:
        case 10:
        case 11:
        case 12: y -= SOURCE_ALIGN_POINT1; add(SOURCE_ALIGN_POINT04); outputRotation = vehicle.rotation + Math.PI / 2; break;
        case 99: sub(SOURCE_ALIGN_POINT1); outputRotation = vehicle.rotation; break;
      }
    }
    if (straight) outputRotation = vehicle.rotation - Math.PI / 2;
  }
  // The source's Ang16 helper operates on the equivalent fixed-point local
  // pair; rotateVehicleLocal converts that pair into runtime world space.
  const rotated = rotateVehicleLocal(x, y, vehicle.rotation);
  return { x: vehicle.x + rotated.x, y: vehicle.y + rotated.y, rotation: normalizeRotation(outputRotation) };
}

/**
 * Mirrors Car_BC::GetDoorWorldPosition_43B5A0. The source applies the
 * 0xCCC centre correction according to the four door slots after removing the
 * straight-entry marker from rx.
 */
export function vehicleDoorPoint(vehicle: TrafficState, doorIndex: number, info: CarInfo | undefined, bounds: VehicleBounds): VehicleDoorPoint {
  const door = vehicleDoorDefinitions(info, bounds).find(candidate => candidate.index === doorIndex);
  if (!door) throw new RangeError(`Unknown vehicle door ${doorIndex}`);
  const local = authoredDoorLocalPosition(door, doorIndex, info);
  const rotated = rotateVehicleLocal(local.x, local.y, vehicle.rotation);
  const point = { x: vehicle.x + rotated.x, y: vehicle.y + rotated.y };
  // Entry phase 0 is the first normal pose. Straight entries begin at phase 7
  // and run toward phase 0, exactly as Char_B4's state 6 does.
  let entryPhase = 0;
  if (door.straightEntry) entryPhase = 7;
  // Char_B4 state 6 uses the normal terminal phase 8 even after the straight
  // sequence has walked through phases 7..0.
  const terminalPhase = 8;
  const entry = vehicleDoorAlignment(vehicle, doorIndex, entryPhase, info, bounds);
  const terminal = vehicleDoorAlignment(vehicle, doorIndex, terminalPhase, info, bounds);
  let exitPhase = 3;
  if (door.straightEntry) exitPhase = 7;
  const exit = vehicleDoorAlignment(vehicle, doorIndex, exitPhase, info, bounds);
  return { ...point, outsideX: entry.x, outsideY: entry.y, exitX: exit.x, exitY: exit.y, seatX: terminal.x, seatY: terminal.y, straightEntry: door.straightEntry };
}

