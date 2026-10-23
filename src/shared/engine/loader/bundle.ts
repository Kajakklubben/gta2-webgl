import { loadCarCatalog } from './cars';
import { loadMapAsset, loadPickupAsset, loadStyleAsset, loadWeaponCatalog } from './asset-loaders';
import type { AssetReader } from '../assets/reader';
import type { ClientAssetBundle } from './models/catalog';

export type { ClientAssetBundle } from './models/catalog';

export async function loadClientAssets(reader: AssetReader, names: {
  map: string;
  style: string;
  carNames?: string;
  pickupScript?: string;
}): Promise<ClientAssetBundle> {
  let carNamesPromise: ReturnType<AssetReader> = Promise.resolve(new Uint8Array());
  if (names.carNames) carNamesPromise = reader(names.carNames).catch(() => new Uint8Array());
  let pickupScriptPromise: ReturnType<AssetReader> = Promise.resolve(new Uint8Array());
  if (names.pickupScript) pickupScriptPromise = reader(names.pickupScript).catch(() => new Uint8Array());
  const [mapBytes, styleBytes, carNamesBytes, pickupScriptBytes] = await Promise.all([
    reader(names.map),
    reader(names.style),
    carNamesPromise,
    pickupScriptPromise,
  ]);
  const map = loadMapAsset(names.map, mapBytes);
  const style = loadStyleAsset(names.style, styleBytes, map.map);
  const pickups = names.pickupScript ? loadPickupAsset(names.pickupScript, pickupScriptBytes).pickups : [];
  return { map, style, cars: loadCarCatalog(style.style, carNamesBytes), weapons: loadWeaponCatalog(), pickups };
}

