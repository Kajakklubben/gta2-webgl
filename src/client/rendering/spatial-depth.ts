import type { ResolvedSpatialDepth, SpatialDepthResolver } from '../../shared/engine/spatial-depth';
import type { GameObjectDrawCommand, GameObjectSpriteLayer } from '../../shared/game/gameobjects/gameobject';
import { WORLD, worldActorSurfaceZ } from '../../shared/domain/world/world';
import { renderPass } from './sprite-engine/render-policy';

const SORT_BAND = 1_000_000;
const SORT_DEPTH_SCALE = 1_000;

export interface RenderSpatialDepthInput {
  readonly command: GameObjectDrawCommand;
  readonly sprite: GameObjectSpriteLayer;
  readonly sequence?: number;
  /** Renderer-owned override used for shadows and other backend layers. */
  readonly passOverride?: number | undefined;
}

/** Convert a physics-resolved support height into renderer world Z. */
export function renderWorldZ(supportHeight: number, elevation = 0) {
  return worldActorSurfaceZ(supportHeight) + WORLD.render.entityZOffset + elevation;
}

/** Renderer-owned spatial depth adapter. It is the only place that turns
 * support height and semantic hints into concrete world Z and sort order. */
export const renderSpatialDepth: SpatialDepthResolver<RenderSpatialDepthInput> = {
  resolve(input): ResolvedSpatialDepth {
    const { command, sprite } = input;
    const hint = sprite.renderDepth;
    const hazardNeedsElevation = command.kind === 'hazard' && sprite.animation !== 'mine' && sprite.animation !== 'slick';
    const effectElevation = hint?.band === 'effect' || command.kind === 'pickup' || command.kind === 'projectile' || hazardNeedsElevation;
    const baseElevation = effectElevation ? WORLD.render.projectileZOffset : 0;
    let elevation = baseElevation + (hint?.elevation ?? 0);
    if (hint?.elevation === undefined && hint?.relation === 'behind-vehicle') elevation = baseElevation - 1;
    const worldZ = renderWorldZ(sprite.placement.z, elevation);
    const pass = input.passOverride ?? renderPass(command, sprite);
    const depth = Math.max(-500, Math.min(500, worldZ));
    return { worldZ, sortKey: pass * SORT_BAND + depth * SORT_DEPTH_SCALE + (input.sequence ?? 0) };
  },
};

export function resolveRenderDepth(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer, sequence = 0, passOverride?: number) {
  return renderSpatialDepth.resolve({ command, sprite, sequence, passOverride });
}
