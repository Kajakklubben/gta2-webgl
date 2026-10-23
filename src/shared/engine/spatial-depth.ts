/**
 * Solver- and renderer-neutral placement shared by physics adapters and
 * presentation adapters. `z` is the support height resolved by physics;
 * `layer` is the integer collision/surface layer supplied by physics.
 * Neither value is a Three.js coordinate or a CSS z-index.
 */
export interface SpatialPlacement {
  x: number;
  y: number;
  z: number;
  rotation: number;
  layer?: number;
}

/** Result produced by a renderer's spatial depth adapter. */
export interface ResolvedSpatialDepth {
  readonly worldZ: number;
  readonly sortKey: number;
}

/** Backend adapter for converting a shared placement and semantic hint into
 * concrete presentation depth. The shared game never implements this. */
export interface SpatialDepthResolver<TInput> {
  resolve(input: TInput): ResolvedSpatialDepth;
}
