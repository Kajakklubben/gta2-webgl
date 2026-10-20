import type { AssetName } from '../../shared/loader/asset-loaders';
import { MULTIPLAYER_MAPS, type MultiplayerMapDefinition } from '../../shared/loader/multiplayer-maps';

/** Browser asset transport. Parsing remains in shared typed loaders. */
export async function fetchAsset(name: AssetName): Promise<Uint8Array> {
  const path = name.split('/').map(part => encodeURIComponent(part)).join('/');
  const response = await fetch(`/assets/${path}`);
  if (!response.ok) throw new Error(`Cannot load ${name} (HTTP ${response.status}). Place your GTA2 files in assets/ and restart.`);
  return new Uint8Array(await response.arrayBuffer());
}

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

export { loadClientAssets } from '../../shared/loader/bundle';
