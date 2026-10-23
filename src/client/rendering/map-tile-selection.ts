import type { Block } from '../../shared/engine/loader/map-parser';

export type MapTileFace = 'left' | 'right' | 'top' | 'bottom' | 'lid' | 'object';

export interface MapTileHit {
  readonly layer: number;
  readonly face: MapTileFace;
  readonly renderOrder: number;
  readonly distance: number;
}

export interface MapTileSelection {
  readonly x: number;
  readonly y: number;
  readonly hit?: MapTileHit;
  readonly blocks: readonly (Block | undefined)[];
}

export interface MapTileSelectionTarget {
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  readonly face: MapTileFace;
}

export const MAP_TILE_FACE_NAMES: readonly MapTileFace[] = ['left', 'right', 'top', 'bottom', 'lid'];

export function mapTileFaceName(type: number): MapTileFace | undefined {
  return MAP_TILE_FACE_NAMES[type];
}
