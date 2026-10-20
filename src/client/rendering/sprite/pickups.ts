import { GTA2_PICKUP_SPRITES } from '../../../shared/domain/world/gta2-sprites';
import { WORLD } from '../../../shared/domain/world/world';
import type { PickupState } from '../../../shared/protocol/types';
import type { GameObjectSprite, SpriteDefinitionRef } from '../../../shared/game/gameobjects/gameobject';
import type { SpriteRange } from './types';

export const PICKUP_RANGES = GTA2_PICKUP_SPRITES;

export function rangeForWeapon(weapon: number): SpriteRange | undefined {
  return PICKUP_RANGES[weapon];
}

export function definition(weapon: number): SpriteDefinitionRef | undefined {
  const range = rangeForWeapon(weapon);
  return range ? { bank: 'code-object', sourceId: range.start } : undefined;
}

/** Canonical pickup presentation used by both registered objects and the
 * renderer's authoritative-state repair pass. Keeping the range and depth
 * policy here prevents the two paths from drifting apart again. */
export function spriteFor(state: Pick<PickupState, 'weapon' | 'x' | 'y' | 'z' | 'collisionLayer' | 'active'>): GameObjectSprite {
  const range = rangeForWeapon(state.weapon);
  const pickupDefinition = definition(state.weapon);
  return {
    atlas: 'codeObjects',
    ...(range ? { model: range.start, frameCount: range.count } : {}),
    ...(pickupDefinition ? { definition: pickupDefinition } : {}),
    animation: 'rotate',
    frameMs: 120,
    placement: { x: state.x, y: state.y, z: state.z, rotation: 0, ...(state.collisionLayer === undefined ? {} : { layer: state.collisionLayer }) },
    opacity: state.active ? 1 : 0,
    depthTest: true,
    depthWrite: false,
    alphaTest: .01,
    // Pickups sit on the map surface. The small positive offset keeps the
    // transparent sprite from losing the depth test to the floor lid.
    depthOffset: WORLD.render.projectileZOffset,
    renderOrder: 4,
    fallbackColor: 0x55d6ff,
  };
}
