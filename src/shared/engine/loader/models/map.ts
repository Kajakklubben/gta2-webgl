import type { GTA2MapFormat } from '../../../domain/world/gta2-enums';
import type { TileAnimationAsset, TileMapAsset } from '../../assets/tile-map';

/** Decoded structures produced from a GTA2 map asset. */

export interface Face {
  tileNumber: number;
  flat: boolean;
  flip: boolean;
  rotation: number;
  wall: boolean;
  bulletWall: boolean;
}

export interface Block {
  Left: Face;
  Right: Face;
  Top: Face;
  Bottom: Face;
  Lid: Face;
  slopeType: number;
  groundType: number;
  arrows: number;
}

export interface MapObject {
  x: number;
  y: number;
  rotation: number;
  type: number;
}

export interface MapZone {
  type: number;
  typeName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

export interface TileAnimation extends TileAnimationAsset {
  base: number;
  frameRate: number;
  repeat: number;
  tiles: number[];
}

export interface MapLight {
  argb: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  intensity: number;
  shape: number;
  onTime: number;
  offTime: number;
}

export interface RoadArrowSet {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface RoadNode {
  x: number;
  y: number;
  z: number;
  arrows: number;
  green: RoadArrowSet;
  red: RoadArrowSet;
  next: number[];
  specialNext: number[];
}

/** The packed Link_2 value used by the retail RGEN route graph. */
export interface RoadLink {
  raw: number;
  index: number;
  length: number;
  enabled: boolean;
}

export interface RoadLinkSet {
  north: RoadLink;
  south: RoadLink;
  east: RoadLink;
  west: RoadLink;
}

export interface RoadJunction {
  index: number;
  links: { north: number; south: number; east: number; west: number };
  searchType: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Present when the source-sized RGEN records were decoded. */
  linkData?: RoadLinkSet;
}

export interface RoadSegment {
  junction1: number;
  junction2: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TrafficMapMetadata {
  roadNodes: RoadNode[];
  junctions: RoadJunction[];
  horizontalSegments: RoadSegment[];
  verticalSegments: RoadSegment[];
  trafficLightZones: MapZone[];
  arrowBlockerZones: MapZone[];
  busStopZones: MapZone[];
}

export interface GameMap extends TileMapAsset<Block> {
  map: (Block | undefined)[][][];
  objects: MapObject[];
  zones: MapZone[];
  animations: TileAnimation[];
  lights: MapLight[];
  roads: RoadNode[];
  traffic: TrafficMapMetadata;
  format: GTA2MapFormat;
  psxMapping?: Uint8Array | undefined;
  junctionData?: Uint8Array | undefined;
}

/** A decoded wall edge used by collision and diagnostics. */
export interface MapWallSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly layer: number;
  readonly movement: boolean;
  readonly bullet: boolean;
}
