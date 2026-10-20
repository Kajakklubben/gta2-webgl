import type { DecodedPickup } from './models/catalog';
import { GTA2_PICKUP_SPRITES } from '../domain/world/gta2-sprites';

import { authoredLocationToWorld } from '../domain/world/world';

/**
 * GTA2's compiled SCR files contain a pointer table followed by a 64 KiB
 * command area.  The command header is eight bytes and all integer values are
 * little endian.  Coordinates use the compiler's signed 16.14 fixed point
 * format (the same format used by the original decompiler). Their x/y origin
 * is the north-west corner of a cube; `authoredLocationToWorld` converts that
 * to the renderer's integer tile-centre grid.
 */
const BASE_POINTER_BYTES = 12_000;
const BASE_SCRIPT_BYTES = 65_536;
const MISSION_HEADER_BYTES = 8;
const MISSION_POINTER_COUNT = 1_536;
const CMD_HEADER_BYTES = 8;

// SCR_OBJECTS: COLLECT_00..COLLECT_23.  The gaps are intentional: COLLECT_07
// is unused, while 15..23 are vehicle weapons.  The values on the right are
// this project's weapon slots (see weapons.ts), rather than SCR weapon IDs.
export const SCR_PICKUP_OBJECTS = new Map<number, number>([
  [200, 0],  // COLLECT_00, Pistol
  [201, 1],  // COLLECT_01, Machine gun
  [202, 3],  // COLLECT_02, Rocket launcher
  [203, 12], // COLLECT_03, Electro gun
  [204, 4],  // COLLECT_04, Molotov cocktail
  [205, 8],  // COLLECT_05, Grenade
  [206, 10], // COLLECT_06, Shotgun
  [208, 2],  // COLLECT_08, Flamethrower
  [209, 5],  // COLLECT_09, Silenced gun
  [210, 13], // COLLECT_10, Dual shot pistol
  [216, 6],  // COLLECT_16, Vehicle oil
  [217, 11], // COLLECT_17, Vehicle mine
  [218, 7],  // COLLECT_18, Vehicle machine gun
]);

// COLLECT_* are code objects. Their sprites live in the STY code-object base,
// not in OBJI/map-object sprites. Values are the first relative sprite for
// each definition; every weapon pickup has eight rotating frames.
export const SCR_PICKUP_SPRITE_MODELS = new Map<number, number>(
  Object.entries(GTA2_PICKUP_SPRITES).map(([weapon, range]) => [Number(weapon), range.start]),
);

type ScriptCommand = { type: number; offset: number };

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function i32(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24));
}

function fixed(value: number) {
  return value / 16384;
}

function commands(bytes: Uint8Array, pointers: number[], start: number, end: number): ScriptCommand[] {
  const result: ScriptCommand[] = [];
  for (let index = start; index < end; index++) {
    const offset = pointers[index]!;
    if (!offset || offset < 0 || offset + CMD_HEADER_BYTES > bytes.length) continue;
    result.push({ type: u16(bytes, offset + 2), offset });
  }
  return result;
}

function readPickup(command: ScriptCommand, script: Uint8Array, id: number): DecodedPickup[] {
  const { type, offset } = command;
  // OBJ_DATA declarations and CREATE_OBJ variants all place the object model
  // at +24 from the command start.  The 2D/3D forms differ only in their
  // trailing fields, which are irrelevant to a one-off pickup.
  if ((type >= 15 && type <= 20) || (type >= 47 && type <= 52)) {
    if (offset + 28 > script.length) return [];
    const object = SCR_PICKUP_OBJECTS.get(u16(script, offset + 24));
    if (object === undefined) return [];
    return point(script, offset, object, 0, id);
  }
  // Multiplayer SCR files use OBJ_DATA's compact type 30 record. Its
  // coordinates remain at +12/+16/+20, while the model is at +26.
  if (type === 30) {
    if (offset + 28 > script.length) return [];
    const object = SCR_PICKUP_OBJECTS.get(u16(script, offset + 26));
    if (object === undefined) return [];
    return point(script, offset, object, 0, id);
  }
  // GENERATOR variants use (var, padding, xyz, rotation, object, min, max,
  // ammo, padding).  The explicit ammo value is retained when present.
  if (type >= 55 && type <= 58) {
    if (offset + 34 > script.length) return [];
    const object = SCR_PICKUP_OBJECTS.get(u16(script, offset + 26));
    if (object === undefined) return [];
    return point(script, offset, object, u16(script, offset + 32), id);
  }
  return [];
}

function point(script: Uint8Array, offset: number, weapon: number, ammo: number, id: number): DecodedPickup[] {
  const x = fixed(i32(script, offset + 12));
  const y = fixed(i32(script, offset + 16));
  const z = fixed(i32(script, offset + 20));
  if (![x, y, z].every(Number.isFinite) || x < 0 || x > 255 || y < 0 || y > 255 || z < 0 || z > 8) return [];
  return [{ id, ...authoredLocationToWorld(x, y, z), weapon, ammo, active: true }];
}

function baseScript(bytes: Uint8Array) {
  if (bytes.length < BASE_POINTER_BYTES + BASE_SCRIPT_BYTES) throw new Error('Invalid base SCR');
  const script = new Uint8Array(BASE_SCRIPT_BYTES);
  script.set(bytes.subarray(BASE_POINTER_BYTES, BASE_POINTER_BYTES + BASE_SCRIPT_BYTES));
  const pointers = Array.from({ length: BASE_POINTER_BYTES / 2 }, (_, index) => u16(bytes, index * 2));
  let end = pointers.length;
  while (end > 1 && pointers[end - 1] === 0) end--;
  return { script, pointers, end };
}

function missionCommands(bytes: Uint8Array, basePointerCount: number) {
  if (bytes.length < MISSION_HEADER_BYTES + MISSION_POINTER_COUNT * 2) throw new Error('Invalid mission SCR');
  if (u16(bytes, 0) !== basePointerCount) throw new Error('Mission SCR pointer count does not match base SCR');
  const size = u16(bytes, 4);
  const pointers = Array.from({ length: MISSION_POINTER_COUNT }, (_, index) => u16(bytes, MISSION_HEADER_BYTES + index * 2));
  const start = pointers[0];
  if (!start || start + size > BASE_SCRIPT_BYTES || MISSION_HEADER_BYTES + MISSION_POINTER_COUNT * 2 + size > bytes.length) throw new Error('Invalid mission SCR command range');
  return { pointers, start, size };
}

/** Decode weapon pickup points from a base SCR and its mission SCR files. */
export function decodeScrPickups(baseBytes: Uint8Array, missionBytes: Uint8Array[] = []): DecodedPickup[] {
  let base: ReturnType<typeof baseScript>;
  try {
    base = baseScript(baseBytes);
  } catch {
    return [];
  }
  const result: DecodedPickup[] = [];
  const scan = (script: Uint8Array, pointers: number[], start: number, end: number) => {
    for (const command of commands(script, pointers, start, end)) {
      result.push(...readPickup(command, script, result.length));
    }
  };
  scan(base.script, base.pointers, 1, base.end);
  for (const bytes of missionBytes) {
    let mission: ReturnType<typeof missionCommands>;
    try {
      mission = missionCommands(bytes, base.end);
    } catch {
      continue;
    }
    const script = new Uint8Array(base.script);
    script.set(bytes.subarray(MISSION_HEADER_BYTES + MISSION_POINTER_COUNT * 2, MISSION_HEADER_BYTES + MISSION_POINTER_COUNT * 2 + mission.size), mission.start);
    scan(script, mission.pointers, 0, mission.pointers.length);
  }
  return result;
}
