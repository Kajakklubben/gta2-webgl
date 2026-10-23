/** Decoded structures produced from a GTA2 style asset. */

import type { Pixels } from '../../assets/pixels';

export type { Pixels } from '../../assets/pixels';

export interface CarDoor {
  /** Encoded source coordinate. Values at or beyond +/-64 carry the straight-in flag. */
  rx: number;
  ry: number;
  /** Coordinate after removing the source's straight-in marker. */
  positionX: number;
  positionY: number;
  straightEntry: boolean;
}

export interface CarInfoFlags {
  pedJump: boolean;
  emergencyLights: boolean;
  roofLights: boolean;
  cab: boolean;
  trailer: boolean;
  forHireLights: boolean;
  roofDecal: boolean;
  rearEmergencyLights: boolean;
}

export interface CarInfoFlags2 {
  collideOver: boolean;
  popupHeadlights: boolean;
}

export interface CarInfo {
  model: number;
  /** The raw 0/1 allocation value stored in CARI before sprite sharing is resolved. */
  spriteCount: number;
  /** Relative sprite number after CARI's 0/1 allocation values are resolved. */
  sprite: number;
  width: number;
  height: number;
  remaps: number[];
  passengers: number;
  wreck: number;
  rating: number;
  frontWheelOffset: number;
  rearWheelOffset: number;
  frontWindowOffset: number;
  rearWindowOffset: number;
  /** Raw CARI flag bytes retained alongside their decoded meanings. */
  flags: number;
  flags2: number;
  infoFlags: CarInfoFlags;
  infoFlags2: CarInfoFlags2;
  doors: CarDoor[];
}

export interface ObjectInfo {
  model: number;
  sprites: number;
}

/** Runtime properties applied by GTA2's ObjectDefinitions table to an OBJI record. */
export interface MapObjectDefinition {
  model: number;
  spriteCount: number;
  width: number;
  height: number;
  /** Source collision depth. Kept in map-tile units for physics consumers. */
  depth: number;
  behavior: 'static' | 'animated';
  nextDefinition: number;
  collisionBucket: number;
  blocksMovement: boolean;
  drawLayer: number;
  spriteFlags: number;
  hasShadows: boolean;
  /** Number of source ticks before an animated map-object frame advances. */
  frameTicks: number;
  /** Initial Object_2C animation timer. Positive values make a source
   * animation finite; negative values loop until another source event. */
  animationTimer?: number | undefined;
  /** Source Object_2C callback invoked by the 50-tick explosion window. */
  explosionReaction?: 'remove' | 'detonate' | undefined;
}

export interface PedSpriteSet {
  walking: Pixels[];
  running: Pixels[];
  idle: Pixels;
  idleFrames: Pixels[];
  armedRunning: Pixels[];
  armedWalking: Pixels[];
  firing: Pixels[];
  throwing: Pixels[];
  throwingIdle: Pixels[];
  jumping: Pixels[];
  entering: Pixels[];
  exiting: Pixels[];
  pulledOut: Pixels[];
  falling: Pixels[];
  dead: Pixels[];
  lying: Pixels[];
  lyingReverse: Pixels[];
  electrocuted: Pixels[];
}

export interface Style {
  tiles: (Pixels | undefined)[];
  sprites: {
    player: PedSpriteSet;
    civilian: PedSpriteSet;
    /** Civilian sets keyed by the source Char remap index. */
    civilianRemaps?: Record<number, PedSpriteSet> | undefined;
    cop: PedSpriteSet;
    cars: Record<number, Pixels[]>;
    carPaints: Record<number, Pixels[]>;
    carDamage: Record<number, Pixels[]>;
    codeObjects: Record<number, Pixels[]>;
    /** Code-object sprites decoded through the source code-object remap bank. */
    codeObjectRemaps: Record<number, Record<number, Pixels[]>>;
    objects: Record<number, Pixels[]>;
  };
  /** Compose any source DELS bits over a selected CARI paint remap. */
  composeCarSprite?: ((model: number, paintIndex: number | undefined, logicalDeltas: readonly number[]) => Pixels | undefined) | undefined;
  spriteBases: Uint16Array;
  deltas: { data: Uint8Array; index?: Uint8Array | undefined };
  /** Parsed DELX/DELS entries keyed by resolved relative car sprite id. */
  carDeltaSets: Record<number, Uint8Array[]>;
  carInfo?: Uint8Array | undefined;
  objectInfo?: Uint8Array | undefined;
  fontInfo?: Uint8Array | undefined;
  recycling?: Uint8Array | undefined;
  /** Decoded RECY model list, excluding its 255 terminator. */
  recyclingModels: number[];
  psxTiles?: Uint8Array | undefined;
  cars: CarInfo[];
  objects: ObjectInfo[];
  /** Object definitions after the retail override table has been applied. */
  mapObjects: ReadonlyMap<number, MapObjectDefinition>;
}
