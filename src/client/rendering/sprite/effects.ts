import {
  GTA2_CAR_FIRE_FRAME_SEQUENCES,
  GTA2_CAR_FIRE_SPRITE_RANGES,
  GTA2_CAR_FIRE_SPRITES,
  GTA2_CODE_OBJECT_SPRITES,
  GTA2_EXPLOSION_SPRITES,
  GTA2_LARGE_EXPLOSION_SPRITES,
  GTA2_SOURCE_EFFECT_SPRITES,
  Gta2CodeObjectModel,
} from '../../../shared/domain/world/gta2-sprites';
import type { SpriteSourceSequence, SpriteDefinitionRef } from '../../../shared/game/gameobjects/gameobject';
import type { SpriteRange, SpriteSequence } from './types';

export type { SpriteRange, SpriteSequence } from './types';

export const EXPLOSION_RANGES = {
  small: GTA2_EXPLOSION_SPRITES,
  large: GTA2_LARGE_EXPLOSION_SPRITES,
} as const satisfies Record<'small' | 'large', SpriteRange>;

export const CAR_FIRE_SPRITES = GTA2_CAR_FIRE_SPRITES;
export const CAR_FIRE_RANGES = GTA2_CAR_FIRE_SPRITE_RANGES;
export const CAR_FIRE_FRAME_SEQUENCES = GTA2_CAR_FIRE_FRAME_SEQUENCES;
export const EFFECT_RANGES = GTA2_SOURCE_EFFECT_SPRITES;

export function sourceModelRange(sourceModel: number): SpriteRange | undefined {
  return CAR_FIRE_RANGES[sourceModel];
}

export function sequence(sequence: SpriteSourceSequence): SpriteSequence {
  switch (sequence) {
    case 'rocket-trail': return EFFECT_RANGES.rocketTrail;
    case 'explosion-small': return EFFECT_RANGES.explosionSmall;
    case 'explosion-large': return EFFECT_RANGES.explosionLarge;
    case 'fire-trail': return EFFECT_RANGES.fireTrail;
    case 'blood-burst': return { ...EFFECT_RANGES.bloodBurst, frames: [EFFECT_RANGES.bloodBurst.start] };
    case 'impact-burst': return { ...EFFECT_RANGES.impactBurst, frames: Array.from({ length: EFFECT_RANGES.impactBurst.count }, (_, index) => EFFECT_RANGES.impactBurst.start + index) };
    case 'water-splash': return { ...EFFECT_RANGES.waterSplash, frames: Array.from({ length: EFFECT_RANGES.waterSplash.count }, (_, index) => EFFECT_RANGES.waterSplash.start + index) };
    case 'electric-arc': return { ...EFFECT_RANGES.electricArc, frames: Array.from({ length: EFFECT_RANGES.electricArc.count }, (_, index) => EFFECT_RANGES.electricArc.start + index) };
    case 'car-fire-small': {
      const frames = CAR_FIRE_FRAME_SEQUENCES[CAR_FIRE_SPRITES.small.start];
      return frames ? { ...EFFECT_RANGES.fireTrail, frames } : EFFECT_RANGES.fireTrail;
    }
    case 'car-fire-large': {
      const frames = CAR_FIRE_FRAME_SEQUENCES[CAR_FIRE_SPRITES.large.start];
      return frames ? { ...EFFECT_RANGES.carFireBurst, frames } : EFFECT_RANGES.carFireBurst;
    }
    case 'car-fire-wreck': {
      const frames = CAR_FIRE_FRAME_SEQUENCES[CAR_FIRE_SPRITES.wreck.start];
      return frames ? { ...EFFECT_RANGES.carFireBurst, frames } : EFFECT_RANGES.carFireBurst;
    }
    case 'ped-fire': return GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.PedFire] ?? { start: 270, count: 8 };
  }
}

export function definition(sourceModel: number): SpriteDefinitionRef {
  return { bank: 'code-object', sourceId: sourceModel };
}
