import type { GameMap, MapObject } from '../../engine/loader/map-parser';
import { MapSurfaceResolver } from './map-surface';
import { authoredLocationToWorld } from '../world/world';

export interface MapObjectPlacement {
  readonly x: number;
  readonly y: number;
  /** Actor support height, not the raw block-array index. */
  readonly z: number;
  readonly collisionLayer: number;
  readonly grounded: boolean;
}

/** Resolve an MOBJ using the same authored coordinate and floor lookup as the
 * source loader. The raw object position is inside a map cube, so it must be
 * converted through authoredLocationToWorld before querying slopes. */
export function resolveMapObjectPlacement(level: GameMap, object: MapObject, surfaces = new MapSurfaceResolver(level)): MapObjectPlacement {
  const world = authoredLocationToWorld(object.x, object.y);
  const support = surfaces.resolve({ x: world.x, y: world.y })[0];
  if (!support) return { x: world.x, y: world.y, z: 0, collisionLayer: 0, grounded: false };
  return { x: world.x, y: world.y, z: support.height, collisionLayer: support.collisionLayer, grounded: true };
}
