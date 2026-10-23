import { GTA2_MAP_LAYER_COUNT } from '../../shared/domain/world/presentation-order';
import type { PresentationBand } from '../../shared/engine/presentation-order';

/** The client-side order of controlled GTA2 passes inside one authored level. */
export const RENDER_PASS_BANDS = [
  'map-wall',
  'map-surface',
  'underlay',
  'map-object',
  'pickup',
  'npc',
  'vehicle',
  'player',
  'overlay',
] as const;

export type RenderPassBand = (typeof RENDER_PASS_BANDS)[number];

export const RENDER_PASS_LEVELS = Array.from({ length: GTA2_MAP_LAYER_COUNT }, (_, level) => level);

export interface RenderPassMetadata {
  readonly mapLevel: number;
  readonly band: RenderPassBand;
}

export function renderPassKey(pass: RenderPassMetadata) {
  return `${pass.mapLevel}:${pass.band}`;
}

/** Map a neutral sprite command onto the concrete controlled pass. */
export function spriteRenderPassBand(kind: string, band: PresentationBand): RenderPassBand {
  if (band === 'underlay') return 'underlay';
  if (kind === 'map-object') return 'map-object';
  if (kind === 'pickup') return 'pickup';
  if (kind === 'npc') return 'npc';
  if (kind === 'vehicle') return 'vehicle';
  if (kind === 'player') return 'player';
  return 'overlay';
}
