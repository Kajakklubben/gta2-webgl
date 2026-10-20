import type { SpriteSourceSequence } from '../../../shared/game/gameobjects/gameobject';
import { sourceModelRange as sourceEffectModelRange, sequence as sourceEffectSequence } from '../sprite/effects';
import { sourceModelRange as sourceWeaponModelRange } from '../sprite/weapons';
import type { SpriteRange, SpriteSequence } from '../sprite/types';

export type SourceSpriteRange = SpriteRange;
export type SourceSpriteSequence = SpriteSequence;

/** Source model/range catalog. Gameplay keeps model enums; rendering owns this lookup. */
export function sourceModelRange(sourceModel: number): SourceSpriteRange | undefined {
  return sourceWeaponModelRange(sourceModel) ?? sourceEffectModelRange(sourceModel);
}

export function sourceSequence(sequence: SpriteSourceSequence): SourceSpriteSequence {
  return sourceEffectSequence(sequence);
}
