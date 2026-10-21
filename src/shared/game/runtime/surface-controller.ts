import type { PlayerState } from '../../protocol/types';
import { MapSurfaceResolver, surfaceHeightToFloor, type SurfaceResult } from '../../domain/physics/map-surface';
import { STEP } from '../../protocol/constants';
import { WORLD } from '../../domain/world/world';

export type SurfaceState = {
  x: number;
  y: number;
  z: number;
  collisionLayer?: number | undefined;
  grounded?: boolean | undefined;
  verticalVelocity?: number | undefined;
};

/** Owns the GTA2 height/layer rules shared by every mobile entity. The engine
 * physics adapter handles horizontal collision; this service supplies the
 * authored support surface and vertical fall/landing step. */
export class SurfaceController {
  constructor(readonly resolver: MapSurfaceResolver) {}

  collisionLayer(state: Pick<SurfaceState, 'z' | 'collisionLayer'>) {
    return state.collisionLayer ?? Math.max(0, Math.min(7, Math.ceil(state.z)));
  }

  surfaceFor(state: Pick<SurfaceState, 'x' | 'y' | 'z' | 'collisionLayer' | 'grounded'>): SurfaceResult {
    const layer = this.collisionLayer(state);
    // A snapshot without a grounded flag is an authored spawn/restore pose;
    // permit it to discover the supporting lid several blocks above legacy
    // traffic z values. Once an object is explicitly airborne, only the next
    // reachable support is accepted so it can fall instead of teleporting up.
    let maxClimb = 7;
    if (state.grounded === false || state.collisionLayer !== undefined) maxClimb = 1.05;
    return this.resolver.resolve({ x: state.x, y: state.y, height: state.z, blockLayer: Math.max(0, layer - 1), maxClimb });
  }

  applySurface(state: SurfaceState, surface: SurfaceResult, dt = STEP, allowFall = false) {
    const support = surface[0];
    if (!support) {
      if (!allowFall) return;
      state.grounded = false;
      state.verticalVelocity = Math.max(-WORLD.vertical.terminalVelocity, (state.verticalVelocity ?? 0) - WORLD.vertical.gravity * dt);
      state.z += state.verticalVelocity * dt;
      return;
    }
    const delta = support.height - state.z;
    if (allowFall && delta < -WORLD.vertical.snapDistance) {
      state.grounded = false;
      state.verticalVelocity = Math.max(-WORLD.vertical.terminalVelocity, (state.verticalVelocity ?? 0) - WORLD.vertical.gravity * dt);
      state.z += state.verticalVelocity * dt;
      if (state.z <= support.height) { state.z = support.height; state.verticalVelocity = 0; state.grounded = true; }
      else { state.collisionLayer = this.collisionLayer(state); return; }
    } else if (allowFall && state.grounded === false && delta > WORLD.vertical.snapDistance) {
      state.verticalVelocity = Math.max(-WORLD.vertical.terminalVelocity, (state.verticalVelocity ?? 0) - WORLD.vertical.gravity * dt);
      state.z += state.verticalVelocity * dt;
      if (state.z <= support.height) { state.z = support.height; state.verticalVelocity = 0; state.grounded = true; }
      else { state.collisionLayer = support.collisionLayer; return; }
    } else {
      state.z = support.height;
      state.verticalVelocity = 0;
      state.grounded = true;
    }
    state.collisionLayer = support.collisionLayer;
  }

  floor(player: Pick<PlayerState, 'x' | 'y' | 'z' | 'collisionLayer' | 'grounded'>) {
    const surface = this.surfaceFor(player);
    const support = surface[0];
    if (!support) return 0;
    return surfaceHeightToFloor(support.height);
  }
}
