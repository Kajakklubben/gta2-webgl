import { WORLD } from '../../../shared/domain/world/world';
import { TOP_DOWN_FOV } from '../../rendering/world-projection';

/** Shared framing for every scenario viewer. The entry/exit viewer is the reference. */
export const SCENARIO_VIEW_ZOOM = 1.12;
export const SCENARIO_ROOM_TILES = 25;
export const SCENARIO_ROOM_RADIUS = (SCENARIO_ROOM_TILES - 1) / 2;
export const SCENARIO_VIEW_CAMERA_HEIGHT = WORLD.render.cameraHeight / SCENARIO_VIEW_ZOOM;

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
