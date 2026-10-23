import type { PickupState, PlayerState, WorldEventInput } from '../protocol/types';
import { WeaponSystem } from '../domain/combat/weapon-system';
import { WORLD } from '../domain/world/world';
import { withinCollisionRadius } from '../domain/physics/collision-rules';
import { pickupSnapshotCodec } from './snapshot-codecs';
import type { PickupObject } from './effects/pickup';
import type { PlayerObject } from './gameobjects/player';
import { isScrPickupWeapon, SCR_ON_FOOT_PICKUP_OBJECTS } from '../engine/loader/scr';

/** The source generator's timing is outside the current replicated pickup DTO. */
export const PICKUP_RESPAWN_TICKS = 900;

export interface PickupSystemContext {
  readonly floor: (player: PlayerState) => number;
  readonly emit: (event: WorldEventInput) => void;
  readonly pickupObjectFor?: (id: number) => PickupObject | undefined;
  readonly playerObject?: PlayerObject | undefined;
}

/** Owns authored pickup activation, collection, and respawn timers. */
export class PickupSystem {
  private readonly timers = new Map<number, number>();
  constructor(readonly pickups: PickupState[], private readonly weapons = new WeaponSystem()) {}

  replace(pickups: readonly PickupState[], normalize: (pickup: PickupState) => PickupState) {
    // Preserve state objects across authoritative snapshots. GameObject
    // wrappers and renderer meshes can then keep their identity while the
    // server corrects fields in place.
    const existing = new Map(this.pickups.map(pickup => [pickup.id, pickup]));
    const next = pickups.filter(pickup => this.isValidPickup(pickup)).map(source => {
      const normalized = normalize(source), target = existing.get(normalized.id);
      if (!target) return normalized;
      pickupSnapshotCodec.apply(target, normalized);
      return target;
    });
    this.pickups.splice(0, this.pickups.length, ...next);
    this.timers.clear();
  }

  advance(resolve?: (id: number) => PickupObject | undefined): Set<number> {
    const reactivated = new Set<number>();
    for (const [id, value] of this.timers) {
      if (value <= 1) {
        const pickup = this.pickups.find(item => item.id === id);
        const object = resolve?.(id);
        if (object) object.reactivate();
        else if (pickup) pickup.active = true;
        if (object || pickup) reactivated.add(id);
        this.timers.delete(id);
      } else this.timers.set(id, value - 1);
    }
    return reactivated;
  }

  collect(player: PlayerState, reactivated: ReadonlySet<number>, context: PickupSystemContext) {
    for (const pickup of this.pickups) {
      if (!this.isValidPickup(pickup) || !pickup.active || reactivated.has(pickup.id) || (this.weapons.isVehicleWeapon(pickup.weapon) && player.vehicleId === undefined) || !withinCollisionRadius(player, pickup, WORLD.interaction.pickupRadius)) continue;
      const definition = this.weapons.get(pickup.weapon);
      const current = Math.max(0, Math.floor(player.combat.ammo[pickup.weapon] ?? 0));
      const requested = pickup.ammo > 0 ? pickup.ammo : definition.sourceDefaultAmmo || definition.ammo;
      const amount = Math.max(0, Math.min(Math.floor(requested), this.weapons.maxAmmo(pickup.weapon) - current));
      if (amount <= 0) continue;
      const equip = this.shouldEquip(player, pickup.weapon);
      const object = context.pickupObjectFor?.(pickup.id);
      let collected: boolean;
      if (object && context.playerObject) collected = object.collect(context.playerObject, amount, equip);
      else collected = this.collectLegacy(player, pickup, amount, equip);
      if (!collected) continue;
      this.timers.set(pickup.id, PICKUP_RESPAWN_TICKS);
      context.emit({ type: 'pickup', actor: player.id, entity: pickup.id, weapon: pickup.weapon, x: pickup.x, y: pickup.y, z: pickup.z });
    }
  }

  private isValidPickup(pickup: PickupState) {
    return Number.isSafeInteger(pickup.id) && pickup.id >= 0 &&
      [pickup.x, pickup.y, pickup.z].every(Number.isFinite) &&
      Number.isSafeInteger(pickup.ammo) && pickup.ammo >= 0 &&
      typeof pickup.active === 'boolean' && isScrPickupWeapon(pickup.weapon) &&
      this.weapons.definitions[pickup.weapon] !== undefined;
  }

  private shouldEquip(player: PlayerState, weapon: number) {
    // The source attaches vehicle pickups to the active car weapon and does
    // not switch to a ped weapon while the player is seated.
    if (this.weapons.isVehicleWeapon(weapon)) return player.vehicleId !== undefined;
    if (player.vehicleId !== undefined) return false;
    return [...SCR_ON_FOOT_PICKUP_OBJECTS.values()].every(slot => (player.combat.ammo[slot] ?? 0) <= 0);
  }

  private collectLegacy(player: PlayerState, pickup: PickupState, amount: number, equip: boolean) {
    player.combat.ammo[pickup.weapon] = (player.combat.ammo[pickup.weapon] ?? 0) + amount;
    if (equip) player.combat.weapon = pickup.weapon;
    pickup.active = false;
    return true;
  }
}

