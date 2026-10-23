/**
 * Renderer-neutral placement in the authored presentation hierarchy.
 *
 * `mapLevel` is the coarse authored map layer. `band` is the local position
 * inside that layer. Neither field is a Three.js render order or a CSS z-index.
 */
export type PresentationBand = 'map' | 'underlay' | 'object' | 'overlay';

export const PRESENTATION_BAND_ORDER: Readonly<Record<PresentationBand, number>> = {
  map: 0,
  underlay: 1,
  object: 2,
  overlay: 3,
};

export interface PresentationSlot {
  /** Authored map-layer order. The domain may supply a default. */
  readonly mapLevel?: number;
  /** Local order relative to the primary object at this level. */
  readonly band?: PresentationBand;
  /** Stable local order inside a map phase. */
  readonly priority?: number;
  /** Continuous visual lift above the resolved support surface. */
  readonly elevation?: number;
}

export interface PresentationOrderKey {
  readonly mapLevel: number;
  readonly band: PresentationBand;
  readonly priority: number;
  readonly depth: number;
  readonly sequence: number;
}

/** Stable generic ordering used by presentation backends. */
export function comparePresentationOrder(left: PresentationOrderKey, right: PresentationOrderKey) {
  return left.mapLevel - right.mapLevel
    || PRESENTATION_BAND_ORDER[left.band] - PRESENTATION_BAND_ORDER[right.band]
    || left.priority - right.priority
    || left.depth - right.depth
    || left.sequence - right.sequence;
}
