import type { Gta2SpriteRange } from '../../../shared/domain/world/gta2-sprites';

/** Rendering-facing view of a source sprite range. */
export type SpriteRange = Readonly<Gta2SpriteRange>;

/** A source range with an optional non-contiguous frame order. */
export interface SpriteSequence extends SpriteRange {
  readonly frames?: readonly number[];
}
