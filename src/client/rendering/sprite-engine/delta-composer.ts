import type { Style } from '../../../shared/engine/loader/models/style';
import type { Pixels } from '../../../shared/engine/assets/pixels';
import type { GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import { deltaIndices } from '../sprite/cars';

export { CAR_LIGHT_DELTA_SLOTS, lightDeltaIndices } from '../sprite/cars';

/**
 * Composes a car's selected paint and logical DELS slots. The binary DELS
 * decoder remains at the loader boundary; this class is the single runtime
 * owner of the visual composition policy and cache key.
 */
export class CarDeltaComposer {
  private readonly cache = new Map<string, Pixels>();

  constructor(private readonly style: Style) {}

  indices(layer: GameObjectSpriteLayer) {
    return deltaIndices(this.style, layer);
  }

  compose(layer: GameObjectSpriteLayer): Pixels | undefined {
    if (layer.model === undefined || !this.style.composeCarSprite) return undefined;
    const deltas = this.indices(layer);
    const hasPaintPalette = layer.palette?.area === 'car-remaps';
    if (!deltas.length && layer.variant !== 'paint' && !hasPaintPalette) return undefined;
    const paint = layer.variant === 'paint' || hasPaintPalette ? layer.variantIndex ?? layer.palette?.index : undefined;
    const cacheKey = `${layer.model}:${paint ?? 'base'}:${deltas.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const composed = this.style.composeCarSprite(layer.model, paint, deltas);
    if (composed) this.cache.set(cacheKey, composed);
    return composed;
  }

  clear() {
    this.cache.clear();
  }
}
