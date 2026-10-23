import * as THREE from 'three';
import { WORLD } from '../../shared/domain/world/world';

/** GTA2 uses a fixed overhead perspective camera. */
export const TOP_DOWN_NEAR = 1;
export const TOP_DOWN_FAR = 4096;
/** The retail camera is aligned vertically over the map. */
export const TOP_DOWN_PITCH = 0;
/** Wider browser framing while retaining the source-style perspective camera. */
export const TOP_DOWN_FOV = 62;

export function createTopDownCamera(viewWidth: number, viewHeight: number) {
  const camera = new THREE.PerspectiveCamera(
    TOP_DOWN_FOV,
    Math.max(1, viewWidth) / Math.max(1, viewHeight),
    TOP_DOWN_NEAR,
    TOP_DOWN_FAR,
  );
  const distance = WORLD.render.cameraHeight / Math.cos(TOP_DOWN_PITCH);
  camera.position.set(0, -Math.sin(TOP_DOWN_PITCH) * distance, WORLD.render.cameraHeight);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function setTopDownCamera(
  camera: THREE.PerspectiveCamera,
  centerX: number,
  centerY: number,
  cameraZ: number,
  viewWidth: number,
  viewHeight: number,
  rotationX = 0,
) {
  camera.aspect = Math.max(1, viewWidth) / Math.max(1, viewHeight);
  const verticalHeight = Math.max(1, cameraZ);
  const distance = verticalHeight / Math.cos(TOP_DOWN_PITCH);
  camera.position.set(centerX, centerY - Math.sin(TOP_DOWN_PITCH) * distance, verticalHeight);
  camera.userData['gta2Center'] = { x: centerX, y: centerY };
  camera.lookAt(centerX, centerY, 0);
  camera.rotation.x = rotationX;
  camera.updateProjectionMatrix();
  // Screen-space hit testing can project before the next WebGL render.
  camera.updateMatrixWorld();
}
