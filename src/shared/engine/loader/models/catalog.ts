import type { WeaponDefinition } from './weapons';
import type { CarPhysics, VehicleBounds } from './vehicles';
import type { GameMap } from './map';
import type { CarInfo, Style } from './style';
import type { Pixels } from '../../assets/pixels';
import type { SourcePresentationValidation } from '../source-presentation-validation';

/** Decoded SCR pickup record before it enters the network/game state model. */
export interface DecodedPickup {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly weapon: number;
  readonly ammo: number;
  readonly active: boolean;
  readonly collisionLayer?: number | undefined;
}

/** Complete decoded asset set consumed by the client. */
export interface ClientAssetBundle {
  readonly map: MapAsset;
  readonly style: StyleAsset;
  readonly cars: CarCatalog;
  readonly weapons: WeaponCatalog;
  /** Authored weapon points decoded from the map's compiled SCR file. */
  readonly pickups: readonly DecodedPickup[];
}

/** Typed results returned by the asset loading boundary. */
export interface MapAsset {
  readonly name: string;
  readonly map: GameMap;
}

export interface StyleAsset {
  readonly name: string;
  readonly style: Style;
  /** Non-fatal retail source-art audit produced at the asset boundary. */
  readonly presentationValidation?: SourcePresentationValidation | undefined;
}

export interface CarAsset {
  readonly model: number;
  readonly name?: string | undefined;
  readonly info?: CarInfo | undefined;
  readonly physics?: CarPhysics | undefined;
  readonly recycled: boolean;
  readonly deltaData: readonly Uint8Array[];
  readonly frames: readonly Pixels[];
  readonly paintFrames: readonly Pixels[];
  readonly damageFrames: readonly Pixels[];
}

export interface CarCatalog {
  readonly bounds: ReadonlyMap<number, VehicleBounds>;
  readonly byModel: ReadonlyMap<number, CarAsset>;
  readonly names: ReadonlyMap<number, string>;
  readonly physics: ReadonlyMap<number, CarPhysics>;
  readonly recyclingModels: readonly number[];
}

export interface WeaponCatalog {
  readonly definitions: readonly WeaponDefinition[];
}

export interface PickupAsset {
  readonly pickups: readonly DecodedPickup[];
  readonly source: string;
}
