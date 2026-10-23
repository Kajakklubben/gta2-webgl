import type { SpriteDefinitionRef, SpritePaletteRef } from '../../../shared/game/gameobjects/gameobject';
import type { Style } from '../../../shared/engine/loader/models/style';
import { cars, objects, pedestrians } from '../sprite';

export interface SpriteDefinitionSummary {
  readonly ref: SpriteDefinitionRef;
  readonly frameCount: number;
  readonly paletteAreas: readonly SpritePaletteRef['area'][];
  readonly variants: readonly ('paint' | 'damage' | 'remap')[];
}

/** Enumerates source-facing definitions for scenario tools and diagnostics. */
export class SpriteDefinitionCatalog {
  constructor(private readonly style: Style) {}

  list(): SpriteDefinitionSummary[] {
    const result: SpriteDefinitionSummary[] = [];
    const add = (ref: SpriteDefinitionRef, frameCount: number, paletteAreas: readonly SpritePaletteRef['area'][], variants: readonly SpriteDefinitionSummary['variants'][number][]) => {
      if (frameCount <= 0) return;
      result.push({ ref, frameCount, paletteAreas, variants });
    };
    for (const car of this.style.cars) {
      add(cars.definition(car.model), this.style.sprites.cars[car.model]?.length ?? 0, ['car-remaps'], [
        ...(this.style.sprites.carPaints[car.model]?.length ? ['paint' as const] : []),
        ...(this.style.sprites.carDamage[car.model]?.length ? ['damage' as const] : []),
      ]);
    }
    add(pedestrians.definition('player'), this.style.sprites.player.walking.length, ['ped-remaps'], ['remap']);
    add(pedestrians.definition('civilian'), this.style.sprites.civilian.walking.length, ['ped-remaps'], ['remap']);
    add(pedestrians.definition('police'), this.style.sprites.cop.walking.length, ['ped-remaps'], ['remap']);
    for (const [model, frames] of Object.entries(this.style.sprites.codeObjects)) {
      add(objects.codeObjectDefinition(Number(model)), frames.length, ['code-object-remaps'], ['remap']);
    }
    for (const [model, frames] of Object.entries(this.style.sprites.objects)) {
      add(objects.mapObjectDefinition(Number(model)), frames.length, ['sprites', 'map-object-remaps'], []);
    }
    return result;
  }
}
