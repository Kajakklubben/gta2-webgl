import { expect, it } from 'vitest';
import { WeaponId, newCombat } from '../../shared/domain/combat/weapons';
import { PickupSystem, PICKUP_RESPAWN_TICKS } from '../../shared/game/pickup-system';
import {
  decodeScrPickups,
  SCR_COLLECTIBLE_WEAPON_SLOTS,
  SCR_ON_FOOT_PICKUP_OBJECTS,
  SCR_PICKUP_OBJECTS,
  SCR_SCRIPT_ONLY_WEAPON_SLOTS,
  SCR_VEHICLE_PICKUP_OBJECTS,
} from '../../shared/engine/loader/scr';
import type { PickupState, PlayerState, WorldEventInput } from '../../shared/protocol/types';

function baseWithCommand(options: {
  readonly type: number;
  readonly model: number;
  readonly modelOffset?: number;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly ammo?: number;
}) {
  const bytes = new Uint8Array(82_656);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 8, true);
  const command = 12_008;
  view.setUint16(command + 2, options.type, true);
  view.setInt32(command + 12, Math.round((options.x ?? 12.5) * 16_384), true);
  view.setInt32(command + 16, Math.round((options.y ?? 4.25) * 16_384), true);
  view.setInt32(command + 20, Math.round((options.z ?? 2) * 16_384), true);
  view.setUint16(command + (options.modelOffset ?? 24), options.model, true);
  if (options.ammo !== undefined) view.setUint8(command + (options.type === 30 ? 32 : 28), options.ammo);
  return bytes;
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'pickup-player', x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0,
    name: 'pickup', color: 0, score: 0, kills: 0, deaths: 0, ready: true,
    armor: 0, money: 0, wanted: 0, team: 0, combat: newCombat(), ...overrides,
  };
}

function pickup(overrides: Partial<PickupState> = {}): PickupState {
  return { id: 1, x: 0, y: 0, z: 0, weapon: WeaponId.MachineGun, ammo: 10, active: true, ...overrides };
}

function collect(system: PickupSystem, state: PlayerState, reactivated: ReadonlySet<number> = new Set()) {
  const events: WorldEventInput[] = [];
  system.collect(state, reactivated, { floor: () => state.z, emit: event => events.push(event) });
  return events;
}

it('classifies authored SCR collectibles and leaves StunGun/script-only slots unmapped', () => {
  expect([...SCR_ON_FOOT_PICKUP_OBJECTS.entries()]).toEqual([
    [200, 0], [201, 1], [202, 3], [203, 12], [204, 4], [205, 8], [206, 10],
    [208, 2], [209, 5], [210, 13],
  ]);
  expect([...SCR_VEHICLE_PICKUP_OBJECTS.entries()]).toEqual([[216, 6], [217, 11], [218, 7]]);
  expect(SCR_PICKUP_OBJECTS.has(207)).toBe(false);
  expect(SCR_PICKUP_OBJECTS.get(203)).not.toBe(WeaponId.StunGun);
  expect(SCR_COLLECTIBLE_WEAPON_SLOTS.has(WeaponId.StunGun)).toBe(false);
  expect(SCR_SCRIPT_ONLY_WEAPON_SLOTS.has(WeaponId.StunGun)).toBe(true);
  expect(SCR_SCRIPT_ONLY_WEAPON_SLOTS.has(WeaponId.CarBomb)).toBe(true);
});

it('converts authored SCR clip counts to runtime ammunition for object and generator records', () => {
  const object = decodeScrPickups(baseWithCommand({ type: 47, model: 201, ammo: 15 }));
  const generator = decodeScrPickups(baseWithCommand({ type: 30, model: 217, modelOffset: 26, ammo: 4 }));
  expect(object[0]).toMatchObject({ weapon: WeaponId.MachineGun, ammo: 150, active: true });
  expect(generator[0]).toMatchObject({ weapon: WeaponId.LandMines, ammo: 40, active: true });
});

it('rejects malformed, unsupported, and out-of-range SCR pickup records', () => {
  expect(decodeScrPickups(new Uint8Array(32))).toEqual([]);
  expect(decodeScrPickups(baseWithCommand({ type: 47, model: 234 }))).toEqual([]);
  expect(decodeScrPickups(baseWithCommand({ type: 99, model: 201 }))).toEqual([]);
  expect(decodeScrPickups(baseWithCommand({ type: 47, model: 201, x: -1 }))).toEqual([]);
  expect(decodeScrPickups(baseWithCommand({ type: 30, model: 217, modelOffset: 26, z: 9 }))).toEqual([]);
  const truncated = new Uint8Array(82_656);
  const view = new DataView(truncated.buffer);
  view.setUint16(2, 65_528, true);
  view.setUint16(12_000 + 65_528 + 2, 47, true);
  expect(decodeScrPickups(truncated)).toEqual([]);
});

it('uses authored ammo, clamps to max ammo, and does not collect unsupported state', () => {
  const maxed = player({ combat: { ...newCombat(), ammo: newCombat().ammo.map((ammo, index) => index === WeaponId.MachineGun ? 980 : ammo) } });
  const system = new PickupSystem([pickup({ ammo: 50 })]);
  const events = collect(system, maxed);
  expect(maxed.combat.ammo[WeaponId.MachineGun]).toBe(990);
  expect(maxed.combat.weapon).toBe(WeaponId.Pistol);
  expect(events).toHaveLength(1);

  const unsupported = new PickupSystem([pickup({ weapon: WeaponId.StunGun })]);
  const state = player();
  expect(collect(unsupported, state)).toEqual([]);
  expect(unsupported.pickups[0]!.active).toBe(true);
});

it('gates vehicle pickups on vehicle occupancy and equips only the mounted pickup in a vehicle', () => {
  const pickupState = pickup({ weapon: WeaponId.LandMines, ammo: 40 });
  const system = new PickupSystem([pickupState]);
  const onFoot = player();
  expect(collect(system, onFoot)).toEqual([]);
  expect(pickupState.active).toBe(true);

  const mounted = player({ vehicleId: 7 });
  const events = collect(system, mounted);
  expect(events).toHaveLength(1);
  expect(mounted.combat.ammo[WeaponId.LandMines]).toBe(40);
  expect(mounted.combat.weapon).toBe(WeaponId.LandMines);
  expect(pickupState.active).toBe(false);
});

it('matches source first-weapon equip behavior and reactivates after the respawn timer', () => {
  const state = player({ combat: { ...newCombat(), weapon: WeaponId.None, ammo: new Array(20).fill(0) } });
  const pickupState = pickup({ ammo: 10 });
  const system = new PickupSystem([pickupState]);
  expect(collect(system, state)).toHaveLength(1);
  expect(state.combat.weapon).toBe(WeaponId.MachineGun);
  expect(pickupState.active).toBe(false);

  for (let tick = 0; tick < PICKUP_RESPAWN_TICKS - 1; tick++) expect(system.advance()).toEqual(new Set());
  const reactivated = system.advance();
  expect(reactivated).toEqual(new Set([pickupState.id]));
  expect(pickupState.active).toBe(true);
  expect(collect(system, state, reactivated)).toEqual([]);
  expect(collect(system, state)).toHaveLength(1);
  expect(state.combat.ammo[WeaponId.MachineGun]).toBe(20);
});
