import { WORLD, tileToWorld } from '../../../shared/domain/world/world';
import type { GameMap } from '../../../shared/engine/loader/map-parser';
import type { ScenarioLevelId } from './scenario-definitions';
import { TOP_DOWN_FOV } from '../../rendering/world-projection';

/** Shared framing for every scenario viewer. The entry/exit viewer is the reference. */
export const SCENARIO_VIEW_ZOOM = 1.12;
export const SCENARIO_ROOM_TILES = 25;
export const SCENARIO_ROOM_RADIUS = (SCENARIO_ROOM_TILES - 1) / 2;
export const SCENARIO_VIEW_CAMERA_HEIGHT = WORLD.render.cameraHeight / SCENARIO_VIEW_ZOOM;
/** Tiny Town needs enough overhead clearance to include the layer-6 bridge deck. */
export const TINY_TOWN_CAMERA_HEIGHT = 640;

/** Authored Tiny Town locations used by the scenario registry. */
export const TINY_TOWN_ROAD_TILE = { x: 80, y: 178 } as const;
export const TINY_TOWN_WATER_TILE = { x: 22, y: 180 } as const;
export const TINY_TOWN_WATER_AREA = { minX: 22, maxX: 27, minY: 161, maxY: 200 } as const;
/** Camera anchor for the four-car rendering comparison. */
export const TINY_TOWN_RENDERING_TILE = { x: 78.5, y: 188.5 } as const;
/** Tight authored room containing all four rendering comparison positions. */
export const TINY_TOWN_RENDERING_ROOM = { minX: 71, maxX: 85, minY: 183, maxY: 193 } as const;

export interface ScenarioLevel {
  readonly level: GameMap;
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly surfaceZ: number;
  readonly room: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
  readonly water?: typeof TINY_TOWN_WATER_AREA;
}

/** Every replay uses a window onto the loaded Tiny Town map. */
export function createScenarioLevel(source: GameMap, kind: ScenarioLevelId): ScenarioLevel {
  if (kind === 'tiny-town') {
    return {
      level: source,
      origin: scenarioTileOrigin(TINY_TOWN_RENDERING_TILE, 2),
      surfaceZ: 2,
      room: TINY_TOWN_RENDERING_ROOM,
    };
  }
  const tile = kind === 'water' ? TINY_TOWN_WATER_TILE : TINY_TOWN_ROAD_TILE;
  const surfaceZ = kind === 'water' ? 1 : 2;
  return {
    level: source,
    origin: scenarioTileOrigin(tile, surfaceZ),
    surfaceZ,
    room: {
      minX: tile.x - SCENARIO_ROOM_RADIUS,
      maxX: tile.x + SCENARIO_ROOM_RADIUS,
      minY: tile.y - SCENARIO_ROOM_RADIUS,
      maxY: tile.y + SCENARIO_ROOM_RADIUS,
    },
    ...(kind === 'water' ? { water: TINY_TOWN_WATER_AREA } : {}),
  };
}

export function scenarioTileOrigin(tile: { x: number; y: number }, z: number) {
  return { x: tileToWorld(tile.x), y: -tileToWorld(tile.y), z };
}

/** Pixels per GTA2 world pixel using the enter/exit viewer's camera framing. */
export function scenarioViewScale(_viewWidth: number, viewHeight: number) {
  const fovRadians = TOP_DOWN_FOV * Math.PI / 180;
  return Math.max(1, viewHeight) / (2 * SCENARIO_VIEW_CAMERA_HEIGHT * Math.tan(fovRadians / 2));
}

/** Perspective-camera height that produces the same vertical scale as the 2D viewer. */
export function scenarioCameraHeight(viewHeight: number, pixelsPerWorldUnit: number) {
  const fovRadians = TOP_DOWN_FOV * Math.PI / 180;
  return Math.max(1, viewHeight) / (2 * pixelsPerWorldUnit * Math.tan(fovRadians / 2));
}
