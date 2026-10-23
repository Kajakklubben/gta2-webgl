import type { Input, PlayerState } from '../protocol/types';
import { WeaponSystem } from '../domain/combat/weapon-system';
import type { CarPhysics } from '../engine/loader/gci';
import type { PlayerObject } from './gameobjects/player';
import type { VehicleObject } from './gameobjects/vehicle';
import { PlayerLoadoutSystem } from './player-loadout';
import { PlayerMovementSystem } from './player-movement';

/**
 * Compatibility entry point for player rules.
 *
 * New code should depend on the explicit category systems exposed here:
 * `movement` and `loadout`. Vehicle movement is now owned by the PlayerObject
 * -> VehicleObject delegation path. Keeping this small facade avoids breaking
 * older loadout/movement callers while the runtime uses object actions.
 */
export class PlayerSystem {
  readonly movement: PlayerMovementSystem;
  readonly loadout: PlayerLoadoutSystem;

  constructor(weapons = new WeaponSystem()) {
    this.movement = new PlayerMovementSystem();
    this.loadout = new PlayerLoadoutSystem(weapons);
  }

  cycleWeapon(player: PlayerState) {
    return this.loadout.cycleWeapon(player);
  }

  cycleWeaponPrevious(player: PlayerState) {
    return this.loadout.cycleWeaponPrevious(player);
  }

  giveAllWeapons(player: PlayerState | undefined) {
    return this.loadout.giveAllWeapons(player);
  }

  /** @deprecated Use `playerObject.driveVehicle(...)`; retained for older integrations. */
  updateVehicle(playerObject: PlayerObject, _vehicleObject: VehicleObject, input: Input, dt: number, _physics?: CarPhysics, slippery = false) {
    return playerObject.driveVehicle(input, dt, slippery);
  }

  /** @deprecated Use `movement.update(...)`; retained for older integrations. */
  updateOnFoot(player: PlayerState, input: Input, floor: number, dt: number) {
    return this.movement.update(player, input, floor, dt);
  }
}
