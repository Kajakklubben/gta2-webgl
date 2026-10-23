/**
 * Multiplayer map bundles shipped with the original PC game.
 *
 * The .mmp files are player-count variants of the same map bundle. The
 * browser/server runtime uses the six-player script as the common room
 * definition; the room itself can still contain fewer or more players than
 * the retail lobby limit.
 */
export interface MultiplayerMapDefinition {
  readonly id: string;
  readonly label: string;
  readonly map: string;
  readonly style: string;
  readonly script: string;
}

export const MULTIPLAYER_MAPS = [
  { id: 'tiny-town', label: 'Tiny Town', map: 'MP1-comp.gmp', style: 'bil.sty', script: 'MP1-6P.SCR' },
  { id: 'hidden-surprise', label: 'Hidden Surprise', map: 'MP2-comp.gmp', style: 'wil.sty', script: 'MP2-6P.SCR' },
  { id: 'face-off', label: 'Face Off', map: 'MP5-comp.gmp', style: 'ste.sty', script: 'MP5-6P.SCR' },
  { id: 'industrial', label: 'Industrial', map: 'bil-multi.gmp', style: 'bil.sty', script: 'Industrial-6P.scr' },
  { id: 'downtown', label: 'Downtown', map: 'wil-multi.gmp', style: 'wil.sty', script: 'downtown-6P.SCR' },
  { id: 'residential', label: 'Residential', map: 'ste.gmp', style: 'ste.sty', script: 'res-6p.SCR' },
] as const satisfies readonly MultiplayerMapDefinition[];

export type MultiplayerMapId = (typeof MULTIPLAYER_MAPS)[number]['id'];
export const DEFAULT_MULTIPLAYER_MAP_ID: MultiplayerMapId = 'tiny-town';

export function multiplayerMapById(id: string | null | undefined) {
  return MULTIPLAYER_MAPS.find(map => map.id === id);
}

function basename(value: string) {
  return value.split(/[\\/]/).pop()?.toLowerCase() ?? '';
}

/** Match an existing ?map=...&style=... URL to a catalog entry. */
export function multiplayerMapForFiles(mapName: string | null | undefined, styleName: string | null | undefined) {
  const map = basename(mapName ?? ''), style = basename(styleName ?? '');
  return MULTIPLAYER_MAPS.find(candidate => candidate.map.toLowerCase() === map && candidate.style.toLowerCase() === style);
}
