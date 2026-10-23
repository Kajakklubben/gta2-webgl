import type { AssetReader } from '../../shared/engine/assets/reader';
import { MULTIPLAYER_MAPS, type MultiplayerMapDefinition } from '../../shared/engine/loader/multiplayer-maps';

/** Browser asset transport. Parsing remains inside the engine-owned loader. */
export function staticAssetUrl(name: string): URL {
  if (!name) throw new Error('Cannot build an asset URL without an asset name.');
  const path = name.split('/').map(part => encodeURIComponent(part)).join('/');
  // Derive the static root from the actual bundled script. This works at the
  // domain root and below a subdirectory, without Vite rewriting a variable
  // URL into a request such as /static/undefined.
  const bundle = [...document.scripts].find(script => script.src.includes('/static/'));
  const assetRoot = bundle?.src ? new URL('../assets/', bundle.src) : new URL('assets/', document.baseURI);
  return new URL(path, assetRoot);
}

export const fetchAsset: AssetReader = async (name) => {
  const response = await fetch(staticAssetUrl(name));
  if (!response.ok) throw new Error(`Cannot load ${name} (HTTP ${response.status}). Place your GTA2 files in assets/ and restart.`);
  return new Uint8Array(await response.arrayBuffer());
};

/** Return the map bundles the authoritative server was able to load. */
export async function fetchAvailableMultiplayerMaps(): Promise<readonly MultiplayerMapDefinition[]> {
  try {
    const response = await fetch('/maps', { cache: 'no-store' });
    if (!response.ok) throw new Error('Map catalog unavailable');
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error('Invalid map catalog');
    const known = new Map<string, MultiplayerMapDefinition>(MULTIPLAYER_MAPS.map(map => [map.id, map]));
    const available: MultiplayerMapDefinition[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== 'string') continue;
      const map = known.get(id);
      if (map) available.push(map);
    }
    return available.length ? available : MULTIPLAYER_MAPS;
  } catch {
    return MULTIPLAYER_MAPS;
  }
}

export { loadClientAssets } from '../../shared/engine/loader/bundle';
