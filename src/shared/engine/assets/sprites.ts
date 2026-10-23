import type { PixelFrame } from './pixels';

export interface SpriteAssetRequest {
  /** Stable identity supplied by a game-specific asset adapter. */
  readonly sourceKey: string;
  /** Optional palette/remap identity supplied by the adapter. */
  readonly paletteKey?: string;
}

export interface ResolvedSpriteAsset {
  readonly frames: readonly PixelFrame[];
  readonly sourceKey: string;
  readonly paletteKey: string;
}

/** Generic lookup port implemented by a game's source-asset adapter. */
export interface SpriteAssetResolver<TRequest = SpriteAssetRequest, TContext = void> {
  resolve(request: TRequest, context: TContext): ResolvedSpriteAsset;
  clear(): void;
}
