import type { SpriteDefinitionRef, SpritePaletteRef } from '../../../shared/game/gameobjects/gameobject';

export function mapObjectDefinition(model: number): SpriteDefinitionRef {
  return { bank: 'map-object', sourceId: model };
}

export function codeObjectDefinition(model: number): SpriteDefinitionRef {
  return { bank: 'code-object', sourceId: model };
}

export function mapObjectPalette(index: number): SpritePaletteRef {
  return { area: 'map-object-remaps', index };
}

export function codeObjectPalette(index: number): SpritePaletteRef {
  return { area: 'code-object-remaps', index };
}
