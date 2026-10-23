import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSET_NAMES, loadMapAsset, loadPickupAsset, loadStyleAsset, type AssetName } from '../shared/engine/loader/asset-loaders';
import type { MultiplayerMapDefinition } from '../shared/engine/loader/multiplayer-maps';
import type { PickupState } from '../shared/protocol/types';
import type { GameMap } from '../shared/engine/loader/map-parser';
import type { CarInfo } from '../shared/engine/loader/style-parser';
import type { MapObjectDefinition } from '../shared/engine/loader/models/style';
import { parseCarPhysics } from '../shared/engine/loader/gci';
import type { CarPhysics } from '../shared/engine/loader/gci';
import { loadVehicleBounds, type VehicleBounds } from '../shared/engine/loader/vehicle-bounds';
export interface AssetConfig { readonly assetDirectory?: string; readonly mapFile?: string; readonly styleFile?: string; readonly pickupScript?: string; }

export async function loadCarBoundsFromDisk(directory = assetDirectory(), config: AssetConfig = {}) {
  const name = config.styleFile ?? ASSET_NAMES[1];
  const style = loadStyleAsset(name, await readAsset(name, directory));
  return loadVehicleBounds(style.style.cars);
}

export async function loadCarInfoFromDisk(directory = assetDirectory(), config: AssetConfig = {}) {
  const name = config.styleFile ?? ASSET_NAMES[1];
  try {
    const style = loadStyleAsset(name, await readAsset(name, directory));
    return new Map(style.style.cars.map(car => [car.model, car] as const));
  } catch {
    return new Map();
  }
}

export const assetDirectory = (workingDirectory = process.cwd()) => {
  const root = resolve(workingDirectory, 'assets');
  const nested = resolve(root, 'App_Executables', 'data');
  if (existsSync(resolve(root, ASSET_NAMES[0])) && existsSync(resolve(root, ASSET_NAMES[1]))) return root;
  if (existsSync(resolve(nested, ASSET_NAMES[0])) && existsSync(resolve(nested, ASSET_NAMES[1]))) return nested;
  return root;
};

export async function readAsset(name: AssetName, directory = assetDirectory()): Promise<Uint8Array> {
  try { return new Uint8Array(await readFile(resolve(directory, name))); }
  catch { throw new Error(`Cannot read ${name}. Copy your GTA2 ${ASSET_NAMES.join(' and ')} files into ${directory}, or update the server configuration.`); }
}

export async function loadLevelAsset(directory = assetDirectory()): Promise<GameMap> {
  return (await loadLevelBundle(directory)).map;
}

export interface ServerLevelBundle {
  readonly map: GameMap;
  readonly mapObjectDefinitions: ReadonlyMap<number, MapObjectDefinition>;
}

/** Load the configured default map and retain the style-derived MOBJ
 * definitions for the authoritative collision world. */
export async function loadLevelBundle(directory = assetDirectory(), config: AssetConfig = {}): Promise<ServerLevelBundle> {
  const mapName = config.mapFile ?? ASSET_NAMES[0];
  const styleName = config.styleFile ?? ASSET_NAMES[1];
  const [mapBytes, styleBytes] = await Promise.all([readAsset(mapName, directory), readAsset(styleName, directory)]);
  const mapAsset = loadMapAsset(mapName, mapBytes);
  const style = loadStyleAsset(styleName, styleBytes, mapAsset.map).style;
  return { map: mapAsset.map, mapObjectDefinitions: style.mapObjects };
}

export interface ServerMapBundle {
  readonly definition: MultiplayerMapDefinition;
  readonly map: GameMap;
  readonly pickups: readonly PickupState[];
  readonly trafficModels: readonly number[];
  readonly carBounds: ReadonlyMap<number, VehicleBounds>;
  readonly carInfo: ReadonlyMap<number, CarInfo>;
  readonly mapObjectDefinitions: ReadonlyMap<number, MapObjectDefinition>;
}

/** Load one complete multiplayer map/style/script bundle for an authoritative room. */
export async function loadMultiplayerMapBundle(definition: MultiplayerMapDefinition, directory = assetDirectory()): Promise<ServerMapBundle> {
  const [mapBytes, styleBytes] = await Promise.all([
    readAsset(definition.map, directory),
    readAsset(definition.style, directory),
  ]);
  const map = loadMapAsset(definition.map, mapBytes).map;
  const style = loadStyleAsset(definition.style, styleBytes).style;
  const pickups = await loadPickupAssetFromDisk(directory, { mapName: definition.map, scriptName: definition.script });
  const trafficModels = style.recyclingModels.filter(model => style.cars.some(car => car.model === model));
  const fallbackTrafficModels = style.cars.filter(car => car.rating < 99 && car.wreck < 99).map(car => car.model);
  return {
    definition,
    map,
    pickups,
    trafficModels: trafficModels.length ? trafficModels : fallbackTrafficModels,
    carBounds: loadVehicleBounds(style.cars),
    carInfo: new Map(style.cars.map(car => [car.model, car] as const)),
    mapObjectDefinitions: style.mapObjects,
  };
}

type FileLookup = { bytes: Uint8Array; root: string };

async function firstFile(roots: string[], names: string[]): Promise<FileLookup> {
  for (const root of roots) for (const name of names) {
    try { return { bytes: new Uint8Array(await readFile(resolve(root, name))), root }; }
    catch { /* try the next supported GTA2 data layout */ }
  }
  throw new Error(`None of the supported files exist: ${names.join(', ')}`);
}

/** Load authored vehicle handling values used by deterministic game. */
export async function loadCarPhysicsFromDisk(directory = assetDirectory(), _config: AssetConfig = {}): Promise<ReadonlyMap<number, CarPhysics>> {
  const roots = [directory, resolve(directory, 'App_Executables', 'data')];
  try { return parseCarPhysics((await firstFile(roots, ['nyc.gci', 'NYC.GCI'])).bytes); }
  catch { return new Map(); }
}

export async function loadTrafficCarModelsFromDisk(directory = assetDirectory(), config: AssetConfig = {}): Promise<readonly number[]> {
  const styleName = config.styleFile ?? ASSET_NAMES[1];
  try {
    const style = loadStyleAsset(styleName, await readAsset(styleName, directory));
    // RECY is the authored traffic pool. CARI also contains wrecks, mission
    // vehicles, trailers and special models which are valid sprites but are
    // not normal civilian traffic.
    const recycled = style.style.recyclingModels.filter(model => style.style.cars.some(car => car.model === model));
    if (recycled.length) return recycled;
    return style.style.cars.filter(car => car.rating < 99 && car.wreck < 99).map(car => car.model);
  } catch {
    return [];
  }
}

/** Load authored weapon points from the district's compiled SCR files. */
export function defaultPickupScriptForMap(mapName: string) {
  const name = mapName.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (name === 'mp1-comp.gmp') return 'MP1-6P.SCR';
  if (name === 'mp2-comp.gmp') return 'MP2-6P.SCR';
  if (name === 'mp5-comp.gmp') return 'MP5-6P.SCR';
  if (name === 'bil-multi.gmp') return 'Industrial-6P.scr';
  if (name === 'wil-multi.gmp') return 'downtown-6P.SCR';
  if (name === 'bil.gmp') return 'bil.scr';
  if (name === 'wil.gmp') return 'wil.SCR';
  if (name === 'ste.gmp') return 'ste.SCR';
  return 'bil.scr';
}

export async function loadPickupAssetFromDisk(directory = assetDirectory(), options: { mapName?: string; scriptName?: string } & AssetConfig = {}): Promise<PickupState[]> {
  const configured = options.scriptName ?? options.pickupScript ?? defaultPickupScriptForMap(options.mapName ?? options.mapFile ?? ASSET_NAMES[0]);
  const baseName = configured.split(/[\\/]/).pop() ?? 'bil.scr';
  const district = baseName.replace(/\.scr$/i, '');
  const roots = [directory, resolve(directory, 'App_Executables', 'data')];
  let base: FileLookup;
  try { base = await firstFile(roots, [baseName, baseName.toLowerCase(), baseName.toUpperCase()]); }
  catch { return []; }
  const missionBytes: Uint8Array[] = [];
  for (const root of [base.root, ...roots]) {
    for (const name of [district, district.toLowerCase(), district.toUpperCase()]) {
      try {
        const entries = (await readdir(resolve(root, name), { withFileTypes: true }))
          .filter(entry => entry.isFile() && /\.scr$/i.test(entry.name))
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) missionBytes.push(new Uint8Array(await readFile(resolve(root, name, entry.name))));
        if (entries.length) return [...loadPickupAsset(baseName, base.bytes, missionBytes).pickups];
      } catch { /* mission files are optional for a base-only script */ }
    }
  }
  return [...loadPickupAsset(baseName, base.bytes, missionBytes).pickups];
}

/** Server-facing names retained for the asset-check and startup adapters. */
export {
  loadLevelAsset as checkAssets,
  loadPickupAssetFromDisk as readWeaponPickups,
  loadCarPhysicsFromDisk as readCarPhysics,
};
