/** Generic animation metadata for a tiled map. */
export interface TileAnimationAsset {
  readonly base: number;
  readonly frameRate: number;
  readonly repeat: number;
  readonly tiles: readonly number[];
}

/**
 * Minimal layered tile-map contract. The cell type belongs to the game's map
 * adapter; the map renderer only needs a column/layer grid and tile animation
 * metadata at this boundary.
 */
export interface TileMapAsset<TCell> {
  readonly map: readonly (readonly (readonly (TCell | undefined)[])[])[];
  readonly animations: readonly TileAnimationAsset[];
}
