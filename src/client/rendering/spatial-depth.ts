import type { ResolvedSpatialDepth, SpatialDepthResolver } from '../../shared/engine/spatial-depth';
import { PRESENTATION_BAND_ORDER, type PresentationBand } from '../../shared/engine/presentation-order';
import type { GameObjectDrawCommand, GameObjectKind, GameObjectSpriteLayer } from '../../shared/game/gameobjects/gameobject';
import { WORLD, worldActorSurfaceZ } from '../../shared/domain/world/world';
import { GTA2_MAP_LAYER_COUNT, resolveGta2Presentation } from '../../shared/domain/world/presentation-order';

const SORT_MAP_LEVEL = 1_000_000_000_000;
const SORT_BAND = 1_000_000_000;
const SORT_PRIORITY = 1_000_000;
const SORT_DEPTH_SCALE = 1_000;

export function presentationSortKey(mapLevel: number, band: PresentationBand, priority: number, depth: number, sequence = 0) {
  const clampedDepth = Math.max(-500, Math.min(500, depth));
  return mapLevel * SORT_MAP_LEVEL
    + PRESENTATION_BAND_ORDER[band] * SORT_BAND
    + priority * SORT_PRIORITY
    + clampedDepth * SORT_DEPTH_SCALE
    + sequence;
}

export interface RenderSpatialDepthInput {
  readonly command: GameObjectDrawCommand;
  readonly sprite: GameObjectSpriteLayer;
  readonly sequence?: number;
  /** Renderer-owned map-level override used for shadows and backend layers. */
  readonly mapLevelOverride?: number | undefined;
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
    const presentation = resolveGta2Presentation({
      kind: command.kind,
      animation: sprite.animation,
      sourceSequence: sprite.sourceSequence,
      mapLevel: mapLevelFromGameObject(command, sprite),
      slot: sprite.presentation,
    });
    const effectElevation = presentation.band === 'overlay' || command.kind === 'pickup' || command.kind === 'projectile';
    const baseElevation = effectElevation ? WORLD.render.projectileZOffset : 0;
    const elevation = baseElevation + presentation.elevation;
    const worldZ = renderWorldZ(sprite.placement.z, elevation);
    const mapLevel = input.mapLevelOverride ?? presentation.mapLevel;
    return { worldZ, sortKey: presentationSortKey(mapLevel, presentation.band, presentation.priority, worldZ, input.sequence ?? 0) };
  },
};

export function mapLevelFromSupportHeight(supportHeight: number, collisionLayer?: number) {
  const supportLayer = collisionLayer ?? Math.floor(supportHeight);
  return Math.max(0, Math.min(GTA2_MAP_LAYER_COUNT - 1, supportLayer - 1));
}

/**
 * Road-slope actors use a fractional support height. Their collision layer is
 * the ceiling layer, but their sprite belongs with the surface on that layer
 * rather than the flat level below it. Keep this presentation-only adjustment
 * here so sprite ordering and map-level visibility use the same rule.
 */
export function mapLevelFromGameObjectState(
  kind: GameObjectKind,
  supportHeight: number,
  collisionLayer?: number,
  grounded?: boolean,
) {
  const baseLevel = mapLevelFromSupportHeight(supportHeight, collisionLayer);
  const slopeAware = kind === 'vehicle' || kind === 'player' || kind === 'npc' || kind === 'pickup' || kind === 'map-object';
  const fractionalSupport = Math.abs(supportHeight - Math.round(supportHeight)) > 1e-3;
  if (!slopeAware || grounded === false || !fractionalSupport) return baseLevel;
  return Math.min(GTA2_MAP_LAYER_COUNT - 1, baseLevel + 1);
}

export function mapLevelFromGameObject(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer) {
  const state = command.state as { collisionLayer?: number; grounded?: boolean };
  return mapLevelFromGameObjectState(
    command.kind,
    sprite.placement.z,
    sprite.placement.layer ?? state.collisionLayer,
    state.grounded,
  );
}

export function resolveRenderDepth(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer, sequence = 0, mapLevelOverride?: number) {
  return renderSpatialDepth.resolve({ command, sprite, sequence, mapLevelOverride });
}
