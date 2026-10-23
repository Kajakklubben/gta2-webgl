import { fetchAsset, fetchAvailableMultiplayerMaps, loadClientAssets } from './assets';
import { DEFAULT_MULTIPLAYER_MAP_ID, MULTIPLAYER_MAPS, multiplayerMapById, multiplayerMapForFiles } from '../../shared/engine/loader/multiplayer-maps';
import { parseStartupOptions } from './startup-options';

export async function loadClientBootstrap() {
  const search = new URLSearchParams(location.search);
  const startup = parseStartupOptions(location.search);
  // Single-player and split-screen sessions are fully static. Avoid probing
  // the multiplayer catalog when there is no backend to answer the request.
  const availableMaps = startup.mode === 'multiplayer'
    ? await fetchAvailableMultiplayerMaps()
    : MULTIPLAYER_MAPS;
  const fileMap = multiplayerMapForFiles(search.get('map'), search.get('style'));
  const availableMapById = new Map(availableMaps.map(map => [map.id, map] as const));
  const requestedMapId = search.get('mapId') ?? localStorage.getItem('gta2-map');
  const configuredMap = fileMap ?? availableMapById.get(requestedMapId ?? '') ?? availableMaps[0] ?? availableMapById.get(DEFAULT_MULTIPLAYER_MAP_ID) ?? multiplayerMapById(DEFAULT_MULTIPLAYER_MAP_ID)!;
  const fileMapId = fileMap && availableMapById.has(fileMap.id) ? fileMap.id : undefined;
  const queryMapId = search.get('mapId');
  let selectedMapId: string | undefined = fileMapId;
  if (selectedMapId === undefined && queryMapId !== null && availableMapById.has(queryMapId)) selectedMapId = queryMapId;
  if (selectedMapId === undefined && !search.has('map') && !search.has('style')) selectedMapId = configuredMap.id;
  const localSingleplayerDefaults = startup.mode !== 'multiplayer'
    && !search.has('map')
    && !search.has('style')
    && !search.has('mapId')
    && !localStorage.getItem('gta2-map');
  const defaultLocalMap = multiplayerMapById(DEFAULT_MULTIPLAYER_MAP_ID)!;
  const requestedMap = search.get('map') || configuredMap.map;
  const requestedStyle = search.get('style') || configuredMap.style;
  const activeMapId = selectedMapId && multiplayerMapById(selectedMapId) ? selectedMapId : undefined;
  const pickupScript = configuredMap.script;
  const assets = await loadClientAssets(fetchAsset, {
    map: localSingleplayerDefaults ? defaultLocalMap.map : requestedMap,
    style: localSingleplayerDefaults ? defaultLocalMap.style : requestedStyle,
    carNames: 'nyc.gci',
    pickupScript: localSingleplayerDefaults ? defaultLocalMap.script : pickupScript,
  });
  return { startup, availableMaps, selectedMapId, activeMapId, assets };
}

export type ClientBootstrap = Awaited<ReturnType<typeof loadClientBootstrap>>;
