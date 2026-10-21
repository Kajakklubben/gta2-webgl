import { WORLD } from '../../shared/domain/world/world';
import type { CameraBounds, CameraInput, Gta2Camera } from './gta2-camera';

/** Fixed-step camera motion routines kept separate from subject selection. */
export function updateElevation(camera: Gta2Camera, input: CameraInput, dtTicks: number) {
  const C = camera.constructor as typeof Gta2Camera;
  if (input.zoomOut) camera.targetElevation += C.ELEVATION_STEP * dtTicks;
  if (input.zoomIn) camera.targetElevation -= C.ELEVATION_STEP * dtTicks;
  camera.targetElevation = Math.max(0, Math.min(C.MAX_ELEVATION, camera.targetElevation));
}

export function updateDebugTarget(camera: Gta2Camera, input: CameraInput, dtTicks: number) {
  const C = camera.constructor as typeof Gta2Camera;
  const step = .5 * dtTicks * WORLD.tileSize;
  camera.pending = { ...camera.target };
  if (input.north) camera.pending.y += step;
  if (input.south) camera.pending.y -= step;
  if (input.west) camera.pending.x -= step;
  if (input.east) camera.pending.x += step;
  if (input.zoomOut) camera.pending.z = Math.min(C.MAX_CAMERA_Z, camera.pending.z + C.ELEVATION_STEP * dtTicks);
  if (input.zoomIn) camera.pending.z = Math.max(0, camera.pending.z - C.ELEVATION_STEP * dtTicks);
}

export function applyShake(camera: Gta2Camera) {
  const C = camera.constructor as typeof Gta2Camera;
  if (Math.abs(camera.shake) < 1e-6) { camera.shake = 0; return; }
  camera.current.x += camera.shake * WORLD.tileSize;
  camera.current.y += camera.shake * WORLD.tileSize;
  camera.current.z = Math.max(0, camera.current.z + camera.shake);
  camera.shake = -camera.shake * C.VERTICAL_BOUNDARY_RATIO;
}

export function computeBounds(camera: Gta2Camera): CameraBounds {
  const C = camera.constructor as typeof Gta2Camera;
  const zoom = Math.max(.05, camera.current.zoom), viewportScale = camera.viewportWidth / C.SOURCE_SCREEN_WIDTH;
  const horizontal = (C.Z_BASE_OFFSET + camera.current.z) / zoom * .5 * WORLD.tileSize * viewportScale;
  const vertical = horizontal * C.VERTICAL_BOUNDARY_RATIO * (camera.viewportHeight / camera.viewportWidth) * (C.SOURCE_SCREEN_WIDTH / C.SOURCE_SCREEN_HEIGHT);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const visible = {
    minX: clamp(camera.current.x - horizontal, camera.mapBounds.minX, camera.mapBounds.maxX),
    maxX: clamp(camera.current.x + horizontal, camera.mapBounds.minX, camera.mapBounds.maxX),
    minY: clamp(camera.current.y - vertical, camera.mapBounds.minY, camera.mapBounds.maxY),
    maxY: clamp(camera.current.y + vertical, camera.mapBounds.minY, camera.mapBounds.maxY),
  };
  const margin = C.BOUNDARY_MARGIN * WORLD.tileSize;
  return { ...visible, expanded: { minX: visible.minX - margin, maxX: visible.maxX + margin, minY: visible.minY - margin, maxY: visible.maxY + margin } };
}
