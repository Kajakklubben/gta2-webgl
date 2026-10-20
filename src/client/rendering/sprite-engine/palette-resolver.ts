import type { GameObjectDrawCommand, GameObjectSpriteLayer, SpritePaletteRef } from '../../../shared/game/gameobjects/gameobject';

/**
 * Palette selection is kept separate from frame selection.  The style parser
 * currently decodes the selected palette into Pixels, but retaining the
 * source-area identity here prevents callers from having to know PALB offsets.
 */
export class PaletteResolver {
  resolve(layer: GameObjectSpriteLayer, _command?: GameObjectDrawCommand): SpritePaletteRef | undefined {
    if (layer.palette) return layer.palette;
    if (layer.atlas === 'cars' && layer.variant === 'paint') {
      return { area: 'car-remaps', index: layer.variantIndex ?? 0 };
    }
    if (layer.atlas === 'player' && layer.pedRemap !== undefined) {
      return { area: 'ped-remaps', index: layer.pedRemap };
    }
    if (layer.atlas === 'codeObjects' && layer.codeObjectRemap !== undefined) {
      return { area: 'code-object-remaps', index: layer.codeObjectRemap };
    }
    return undefined;
  }
}
