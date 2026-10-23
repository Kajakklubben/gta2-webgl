import { decodeScrPickups } from './scr';
import { parseMap, tileNumbers, type GameMap } from './map-parser';
import { parseStyle, type Style } from './style-parser';
import { validateSourcePresentation } from './source-presentation-validation';
import { WEAPONS } from '../../domain/combat/weapons';
import type { MapAsset, PickupAsset, StyleAsset, WeaponCatalog } from './models/catalog';
import type { WeaponDefinition } from './models/weapons';

export const ASSET_NAMES = ['MP1-comp.gmp', 'bil.sty'] as const;
export type AssetName = string;
export type { AssetReader } from '../assets/reader';
export type { GameMap, Style, WeaponDefinition };

export function loadMapAsset(name: string, bytes: Uint8Array): MapAsset {
  return { name, map: parseMap(bytes) };
}

export function loadStyleAsset(name: string, bytes: Uint8Array, map?: GameMap): StyleAsset {
  let tileSelection: number[] = [];
  if (map) tileSelection = tileNumbers(map);
  const style = parseStyle(bytes, tileSelection);
  return { name, style, presentationValidation: validateSourcePresentation(style) };
}

export function loadPickupAsset(source: string, base: Uint8Array, missions: readonly Uint8Array[] = []): PickupAsset {
  return { source, pickups: decodeScrPickups(base, [...missions]) };
}

export function loadWeaponCatalog(): WeaponCatalog {
  return { definitions: WEAPONS };
}
