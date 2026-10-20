import type { PlayerState } from '../protocol/types';
import { WeaponSystem } from '../domain/combat/weapon-system';
import { WeaponId } from '../domain/combat/weapons';

/** Weapon selection and debug loadout rules for a player. */
export class PlayerLoadoutSystem {
  constructor(private readonly weapons = new WeaponSystem()) {}

  /**
   * Mirror Player::SelectNextOrPrevWeapon: cycle through weapons the player
   * can actually use, then expose the source's unarmed (-1) slot. This keeps
   * empty pickups and car-only weapons out of the on-foot weapon cycle.
   */
  cycleWeapon(player: PlayerState) {
    this.cycleWeaponBy(player, 1);
  }

  cycleWeaponPrevious(player: PlayerState) {
    this.cycleWeaponBy(player, -1);
  }

  private cycleWeaponBy(player: PlayerState, direction: 1 | -1) {
    const combat = player.combat;
    const order = [...this.weapons.definitions.map((_definition, weapon) => weapon), WeaponId.None];
    // The source starts a malformed selection at slot zero, then scans in the
    // requested direction until it finds ammo or reaches the unarmed slot.
    const current = order.indexOf(combat.weapon);
    let start = current;
    if (current < 0) start = 0;
    for (let offset = 1; offset <= order.length; offset++) {
      const weapon = order[(start + direction * offset + order.length * 2) % order.length]!;
      if (weapon === WeaponId.None) { combat.weapon = WeaponId.None; return; }
      const definition = this.weapons.definitions[weapon];
      if ((combat.ammo[weapon] ?? 0) > 0 && (!definition?.vehicleOnly || player.vehicleId !== undefined)) {
        combat.weapon = weapon;
        return;
      }
    }
    combat.weapon = WeaponId.None;
  }

  /** Debug-only loadout helper: fill every authored slot and make an unarmed
   * player immediately usable without changing an already selected weapon. */
  giveAllWeapons(player: PlayerState | undefined) {
    // A debug packet can arrive during reconnect/room teardown after the
    // authoritative player has already been detached. Treat that as a stale
    // command instead of dereferencing an absent player and taking down the
    // websocket handler.
    if (!player) return false;
    const combat = player.combat;
    combat.ammo = this.weapons.definitions.map(definition => definition.ammo);
    if (combat.weapon === WeaponId.None) combat.weapon = WeaponId.Pistol;
    combat.throwing = false;
    combat.throwCharge = 0;
    combat.throwAnimation = 0;
    combat.attacking = false;
    return true;
  }
}
