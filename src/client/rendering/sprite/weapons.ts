import {
  GTA2_CODE_OBJECT_SPRITES,
  GTA2_SOURCE_OBJECT_MODELS,
  GTA2_SOURCE_OBJECT_SPRITES,
  GTA2_SOURCE_PROJECTILE_FRAME_TICKS,
  GTA2_WEAPON_PROJECTILE_SPRITES,
  Gta2CodeObjectModel,
} from '../../../shared/domain/world/gta2-sprites';
import type { SpriteDefinitionRef } from '../../../shared/game/gameobjects/gameobject';
import type { SpriteRange } from './types';

export const CODE_OBJECT_MODELS = Gta2CodeObjectModel;
export const CODE_OBJECT_RANGES = GTA2_CODE_OBJECT_SPRITES;
export const SOURCE_OBJECT_MODELS = GTA2_SOURCE_OBJECT_MODELS;
export const WEAPON_PROJECTILE_RANGES = GTA2_WEAPON_PROJECTILE_SPRITES;

export function sourceModelRange(sourceModel: number): SpriteRange | undefined {
  return GTA2_SOURCE_OBJECT_SPRITES[sourceModel];
}

export function weaponRange(weapon: number): SpriteRange | undefined {
  return WEAPON_PROJECTILE_RANGES[weapon];
}

export function frameTicks(sourceModel: number | undefined) {
  return sourceModel === undefined ? undefined : GTA2_SOURCE_PROJECTILE_FRAME_TICKS[sourceModel];
}

export function definition(sourceModel: number): SpriteDefinitionRef {
  return { bank: 'code-object', sourceId: sourceModel };
}
