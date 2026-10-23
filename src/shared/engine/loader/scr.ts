import type { DecodedPickup } from './models/catalog';
import { GTA2_PICKUP_SPRITES } from '../../domain/world/gta2-sprites';

import { authoredLocationToWorld } from '../../domain/world/world';

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
const SCR_AMMO_UNIT = 10;

/**
 * The source's pickup path accepts COLLECT_00..COLLECT_13 (with the authored
 * gaps) as ped weapons.  These values are the stable runtime slots, not the
 * source Weapon_30 indices.  In particular, the source data has no COLLECT
 * object for this project's StunGun slot; COLLECT_03 remains the existing
 * ElectroShock mapping until the source data says otherwise.
 */
export const SCR_ON_FOOT_PICKUP_OBJECTS = new Map<number, number>([
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
]);

/**
 * COLLECT_16..COLLECT_18 are real authored SCR pickups, but the source
 * AddWeaponWithAmmo path only accepts them while a ped is in a vehicle. Keep
 * them in a separate table so an on-foot acquisition can never accidentally
 * treat a mounted weapon as an ordinary ped weapon.
 */
export const SCR_VEHICLE_PICKUP_OBJECTS = new Map<number, number>([
  [216, 6],  // COLLECT_16, Vehicle oil
  [217, 11], // COLLECT_17, Vehicle mine
  [218, 7],  // COLLECT_18, Vehicle machine gun
]);

/** All source-authored pickup objects accepted by the loader. */
export const SCR_PICKUP_OBJECTS = new Map<number, number>([
  ...SCR_ON_FOOT_PICKUP_OBJECTS,
  ...SCR_VEHICLE_PICKUP_OBJECTS,
]);

/** Runtime slots represented by an authored SCR collectible. */
export const SCR_COLLECTIBLE_WEAPON_SLOTS = new Set<number>(SCR_PICKUP_OBJECTS.values());

/**
 * Valid weapon definitions that are intentionally not SCR collectibles:
 * StunGun has no COLLECT mapping, while the remaining slots are script/debug
 * or vehicle capability weapons.  This is kept explicit for acquisition
 * validation rather than relying on an array index fallback.
 */
export const SCR_SCRIPT_ONLY_WEAPON_SLOTS = new Set<number>([9, 14, 15, 16, 17, 18, 19]);

export function isScrPickupWeapon(weapon: number) {
  return Number.isSafeInteger(weapon) && SCR_COLLECTIBLE_WEAPON_SLOTS.has(weapon);
}

// COLLECT_* are code objects. Their sprites live in the STY code-object base,
// not in OBJI/map-object sprites. Values are the first relative sprite for
// each definition; every weapon pickup has eight rotating frames.
export const SCR_PICKUP_SPRITE_MODELS = new Map<number, number>(
  Object.entries(GTA2_PICKUP_SPRITES).map(([weapon, range]) => [Number(weapon), range.start]),
);

type ScriptCommand = { type: number; offset: number };

function u8(bytes: Uint8Array, offset: number) {
  return offset >= 0 && offset < bytes.length ? bytes[offset] : undefined;
}

function u16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function i32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);
}

function fixed(value: number) {
  return value / 16384;
}

function commands(bytes: Uint8Array, pointers: number[], start: number, end: number): ScriptCommand[] {
  const result: ScriptCommand[] = [];
  const first = Math.max(0, Math.trunc(start));
  const last = Math.min(pointers.length, Math.max(first, Math.trunc(end)));
  for (let index = first; index < last; index++) {
    const offset = pointers[index];
    if (offset === undefined || offset <= 0 || offset + CMD_HEADER_BYTES > bytes.length) continue;
    const type = u16(bytes, offset + 2);
    if (type === undefined) continue;
    result.push({ type, offset });
  }
  return result;
}

function isObjectCommand(type: number) {
  return (type >= 15 && type <= 20) || (type >= 47 && type <= 52);
}

function isGeneratorCommand(type: number) {
  return (type >= 28 && type <= 32) || type === 55 || type === 56;
}

function sourceAmmoToRuntime(raw: number | undefined) {
  if (raw === undefined || !Number.isInteger(raw) || raw < 0 || raw > 0xff) return undefined;
  return raw === 0 ? 0 : raw * SCR_AMMO_UNIT;
}

function readPickup(command: ScriptCommand, script: Uint8Array, id: number): DecodedPickup[] {
  const { type, offset } = command;
  if (isObjectCommand(type)) {
    // SCR_OBJ_DATA places the model at +24 and the pickup's item parameter at
    // +28. The original object allocator multiplies that source clip count
    // by ten when it adds ammo to a weapon.
    if (offset + 29 > script.length) return [];
    const model = u16(script, offset + 24), object = model === undefined ? undefined : SCR_PICKUP_OBJECTS.get(model);
    if (object === undefined) return [];
    const ammo = sourceAmmoToRuntime(u8(script, offset + 28));
    return ammo === undefined ? [] : point(script, offset, object, ammo, id);
  }
  if (isGeneratorCommand(type)) {
    // SCR_GENERATOR stores the object at +26 and an optional one-byte source
    // clip count at +32. Types 28..32 are generator declarations used by the
    // retail multiplayer scripts; 55..56 are their CREATE_GENERATOR forms.
    if (offset + 33 > script.length) return [];
    const model = u16(script, offset + 26), object = model === undefined ? undefined : SCR_PICKUP_OBJECTS.get(model);
    if (object === undefined) return [];
    const ammo = sourceAmmoToRuntime(u8(script, offset + 32));
    return ammo === undefined ? [] : point(script, offset, object, ammo, id);
  }
  return [];
}

function point(script: Uint8Array, offset: number, weapon: number, ammo: number, id: number): DecodedPickup[] {
  const rawX = i32(script, offset + 12), rawY = i32(script, offset + 16), rawZ = i32(script, offset + 20);
  if (rawX === undefined || rawY === undefined || rawZ === undefined) return [];
  const x = fixed(rawX), y = fixed(rawY), z = fixed(rawZ);
  if (![x, y, z].every(Number.isFinite) || !Number.isSafeInteger(ammo) || x < 0 || x > 255 || y < 0 || y > 255 || z < 0 || z > 8 || ammo < 0) return [];
  return [{ id, ...authoredLocationToWorld(x, y, z), weapon, ammo, active: true }];
}

function baseScript(bytes: Uint8Array) {
  if (bytes.length < BASE_POINTER_BYTES + BASE_SCRIPT_BYTES) throw new Error('Invalid base SCR');
  const script = new Uint8Array(BASE_SCRIPT_BYTES);
  script.set(bytes.subarray(BASE_POINTER_BYTES, BASE_POINTER_BYTES + BASE_SCRIPT_BYTES));
  const pointers = Array.from({ length: BASE_POINTER_BYTES / 2 }, (_, index) => u16(bytes, index * 2)).filter((value): value is number => value !== undefined);
  let end = pointers.length;
  while (end > 1 && pointers[end - 1] === 0) end--;
  return { script, pointers, end };
}

function missionCommands(bytes: Uint8Array, basePointerCount: number) {
  if (bytes.length < MISSION_HEADER_BYTES + MISSION_POINTER_COUNT * 2) throw new Error('Invalid mission SCR');
  if (u16(bytes, 0) !== basePointerCount) throw new Error('Mission SCR pointer count does not match base SCR');
  const size = u16(bytes, 4);
  if (size === undefined) throw new Error('Invalid mission SCR size');
  const pointers = Array.from({ length: MISSION_POINTER_COUNT }, (_, index) => u16(bytes, MISSION_HEADER_BYTES + index * 2)).filter((value): value is number => value !== undefined);
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
