import type { GameMap } from '../engine/loader/map-parser';
import { GameWorld, type GameWorldOptions } from './game-world';
import type { PickupState } from '../protocol/types';
import type { VehicleBounds } from '../engine/loader/vehicle-bounds';
import type { CarPhysics } from '../engine/loader/gci';
import type { CarInfo } from '../engine/loader/style-parser';
import type { MapObjectDefinition } from '../engine/loader/models/style';
import { DEFAULT_MAP_OBJECT_DEFINITIONS } from '../engine/loader/map-object-definitions';

/**
 * GTA2's game implementation. Rules and state remain in GameWorld for now;
 * this facade is the composition boundary used by engine adapters and lets us
 * move individual systems out of core without changing transport code again.
 */
export class Gta2Game extends GameWorld {
  constructor(
    level: GameMap,
    localId?: string,
    initialPickups: PickupState[] = [],
    carPhysics: ReadonlyMap<number, CarPhysics> = new Map(),
    trafficModels: readonly number[] = [],
    carBounds: ReadonlyMap<number, VehicleBounds> = new Map(),
    carInfo: ReadonlyMap<number, CarInfo> = new Map(),
    mapObjectDefinitions: ReadonlyMap<number, MapObjectDefinition> = DEFAULT_MAP_OBJECT_DEFINITIONS,
    options: GameWorldOptions = {},
  ) {
    super(level, localId, initialPickups, carPhysics, trafficModels, carBounds, carInfo, mapObjectDefinitions, options);
  }
}
