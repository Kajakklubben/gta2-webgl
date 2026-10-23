import type { PickupState } from '../../protocol/types';
import type { GameObjectSprite } from '../gameobjects/gameobject';
import { StatefulGameObject, type GameObjectUpdateHandler } from '../gameobjects/stateful';
import { PlayerObject } from '../gameobjects/player';
import { COLLISION_CATEGORY } from '../../domain/physics/collision-rules';
import { GTA2_PICKUP_SPRITES } from '../../domain/world/gta2-sprites';
export class PickupObject extends StatefulGameObject<PickupState, number> {
  constructor(state: PickupState, update?: GameObjectUpdateHandler<PickupState>) { super(state.id, state, 'pickup', update); this.collision = { shape: { type: 'circle', radius: 0 }, solid: false, mask: COLLISION_CATEGORY.player | COLLISION_CATEGORY.vehicle }; }
  override get collisionEnabled() { return this.mutableState.active; }
  /** Consume this pickup through the player's action surface. */
  collect(player: PlayerObject, ammo: number, equip = true) {
    const previousWeapon = player.activeWeapon;
    if (!this.mutableState.active || !player.collectPickup(this.mutableState.weapon, ammo)) return false;
    if (!equip) player.mutablePlayerState.combat.weapon = previousWeapon;
    this.mutableState.active = false;
    return true;
  }
  reactivate() { this.mutableState.active = true; }
  override getSprite(_now: number): GameObjectSprite {
    const range = GTA2_PICKUP_SPRITES[this.mutableState.weapon];
    return {
      atlas: 'codeObjects',
      ...(range ? { model: range.start, frameCount: range.count } : {}),
      animation: 'rotate', frameMs: 120,
      placement: this.placement,
      opacity: this.mutableState.active ? 1 : 0,
      alphaTest: .01,
      presentation: { band: 'object' },
      fallbackColor: 0x55d6ff,
    };
  }
}
