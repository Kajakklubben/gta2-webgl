import type { GameMap } from '../loader/map-parser';
import { GameWorld } from './game-world';
import type { PickupState } from '../protocol/types';
import type { VehicleBounds } from '../loader/vehicle-bounds';
import type { CarPhysics } from '../loader/gci';
import type { CarInfo } from '../loader/style-parser';
import type { MapObjectDefinition } from '../loader/models/style';
import { DEFAULT_MAP_OBJECT_DEFINITIONS } from '../loader/map-object-definitions';

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
  ) {
    super(level, localId, initialPickups, carPhysics, trafficModels, carBounds, carInfo, mapObjectDefinitions);
  }
}
