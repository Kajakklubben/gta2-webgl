/**
 * Representative decoded vehicle records used by the scenario lab and its
 * browser tests. The values come from the authored bil.sty/nyc.gci catalog
 * used by the loaded Tiny Town replay.
 */
export interface VehiclePropertyCase {
  readonly name: string;
  readonly car: number;
  readonly doors: number;
  readonly seats: number;
  readonly straightDoors: number;
  readonly flags: number;
  readonly flags2: number;
  readonly width: number;
  readonly height: number;
  readonly mass: number;
  readonly maxSpeed: number;
  readonly thrust: number;
  readonly turnRatio: number;
  readonly spriteCount: number;
  readonly enterable: boolean;
  readonly sharedSpriteWith?: number;
}

export const VEHICLE_PROPERTY_CASES = [
  { name: 'Romero two-door', car: 0, doors: 2, seats: 4, straightDoors: 0, flags: 0, flags2: 0, width: 32, height: 64, mass: 16.5, maxSpeed: 0.245, thrust: 0.152, turnRatio: 0.45, spriteCount: 1, enterable: true },
  { name: 'G4 Bank Van straight-entry', car: 4, doors: 3, seats: 10, straightDoors: 1, flags: 0, flags2: 0, width: 40, height: 79, mass: 24, maxSpeed: 0.186, thrust: 0.17, turnRatio: 0.4, spriteCount: 1, enterable: true },
  { name: 'Box Car no doors', car: 6, doors: 0, seats: 0, straightDoors: 0, flags: 1, flags2: 0, width: 42, height: 128, mass: 10, maxSpeed: 0.95, thrust: 0.143, turnRatio: 0.9, spriteCount: 1, enterable: false },
  { name: 'Bulwark four-door', car: 10, doors: 4, seats: 5, straightDoors: 0, flags: 0, flags2: 0, width: 34, height: 64, mass: 17, maxSpeed: 0.307, thrust: 0.185, turnRatio: 0.45, spriteCount: 1, enterable: true },
  { name: 'Bus high capacity', car: 11, doors: 3, seats: 31, straightDoors: 3, flags: 4, flags2: 0, width: 40, height: 127, mass: 30, maxSpeed: 0.215, thrust: 0.235, turnRatio: 0.65, spriteCount: 1, enterable: true },
  { name: 'Cop Car emergency lights', car: 12, doors: 4, seats: 5, straightDoors: 0, flags: 2, flags2: 0, width: 32, height: 63, mass: 14.5, maxSpeed: 0.415, thrust: 0.15, turnRatio: 0.4, spriteCount: 1, enterable: true },
  { name: 'Medicar rear emergency lights', car: 34, doors: 3, seats: 5, straightDoors: 1, flags: 0x82, flags2: 0, width: 32, height: 95, mass: 20, maxSpeed: 0.338, thrust: 0.231, turnRatio: 0.5, spriteCount: 1, enterable: true },
  { name: 'Stinger popup headlights', car: 46, doors: 2, seats: 2, straightDoors: 0, flags: 0, flags2: 2, width: 30, height: 62, mass: 15, maxSpeed: 0.401, thrust: 0.14, turnRatio: 0.65, spriteCount: 1, enterable: true },
  { name: 'Taxi for-hire lights', car: 51, doors: 4, seats: 6, straightDoors: 0, flags: 0x20, flags2: 0, width: 36, height: 64, mass: 15, maxSpeed: 0.27, thrust: 0.145, turnRatio: 0.4, spriteCount: 1, enterable: true },
  { name: 'Tank collision flags', car: 54, doors: 2, seats: 4, straightDoors: 0, flags: 1, flags2: 1, width: 46, height: 81, mass: 45, maxSpeed: 0.1, thrust: 0.29, turnRatio: 0.75, spriteCount: 1, enterable: true },
  { name: 'Tanker trailer no doors', car: 55, doors: 0, seats: 0, straightDoors: 0, flags: 0x11, flags2: 0, width: 40, height: 128, mass: 30, maxSpeed: 0.3, thrust: 0, turnRatio: 0.8, spriteCount: 1, enterable: false },
  { name: 'TV Van shared sprite source', car: 67, doors: 4, seats: 10, straightDoors: 0, flags: 0x40, flags2: 0, width: 42, height: 72, mass: 19, maxSpeed: 0.205, thrust: 0.15, turnRatio: 0.8, spriteCount: 1, enterable: true },
  { name: 'Van shared sprite variant', car: 68, doors: 4, seats: 10, straightDoors: 0, flags: 0, flags2: 0, width: 42, height: 72, mass: 19, maxSpeed: 0.205, thrust: 0.15, turnRatio: 0.8, spriteCount: 0, enterable: true, sharedSpriteWith: 67 },
] as const satisfies readonly VehiclePropertyCase[];

export const VEHICLE_PROPERTY_CASE_MODELS = VEHICLE_PROPERTY_CASES.map(propertyCase => propertyCase.car);
