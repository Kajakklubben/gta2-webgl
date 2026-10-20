import type { SpriteDefinitionRef, SpritePaletteRef } from '../../../shared/game/gameobjects/gameobject';

export const PLAYER_DEFINITION = { bank: 'ped', sourceId: 0 } as const satisfies SpriteDefinitionRef;
export const CIVILIAN_DEFINITION = { bank: 'ped', sourceId: 1 } as const satisfies SpriteDefinitionRef;
export const POLICE_DEFINITION = { bank: 'ped', sourceId: 2 } as const satisfies SpriteDefinitionRef;

export type PedestrianKind = 'player' | 'civilian' | 'police';

export function definition(kind: PedestrianKind): SpriteDefinitionRef {
  if (kind === 'police') return POLICE_DEFINITION;
  if (kind === 'civilian') return CIVILIAN_DEFINITION;
  return PLAYER_DEFINITION;
}

export function palette(index: number): SpritePaletteRef {
  return { area: 'ped-remaps', index };
}
