/**
 * Named values from the GTA2 map and asset formats.
 *
 * Keeping these values in one module makes the binary loaders and renderers
 * describe the format instead of scattering protocol numbers throughout the
 * implementation. The numeric values are part of the on-disk format and must
 * not be changed without updating the decoder.
 */

export enum GTA2FaceType {
  Left = 0,
  Right = 1,
  Top = 2,
  Bottom = 3,
  Lid = 4,
}

export enum GTA2SlopeType {
  Flat = 0,
  UpLow = 1,
  UpHigh = 2,
  DownLow = 3,
  DownHigh = 4,
  LeftLow = 5,
  LeftHigh = 6,
  RightLow = 7,
  RightHigh = 8,
  Up7Low = 9,
  Up7High = 16,
  Down7Low = 17,
  Down7High = 24,
  Left7Low = 25,
  Left7High = 32,
  Right7Low = 33,
  Right7High = 40,
  DiagonalFacingDown = 41,
  DiagonalFacingUp = 42,
  DiagonalFacingLeft = 43,
  DiagonalFacingRight = 44,
  DiagonalFacingUpLeft = 45,
  DiagonalFacingUpRight = 46,
  DiagonalFacingDownLeft = 47,
  DiagonalFacingDownRight = 48,
  PartialLeftCenter = 53,
  PartialRightCenter = 54,
  PartialTopCenter = 55,
  PartialBottomCenter = 56,
  PartialTopLeft = 57,
  PartialTopRight = 58,
  PartialBottomRight = 59,
  PartialBottomLeft = 60,
  PartialCenter = 61,
  PartialLow = PartialLeftCenter,
  PartialHigh = PartialCenter,
}

/** Ground classification stored in the low two bits of a GMP block. */
export enum GTA2GroundType {
  Air = 0,
  Road = 1,
  Pavement = 2,
  Field = 3,
}

export enum GTA2MapZoneType {
  General = 0,
  Navigation = 1,
  TrafficLight = 2,
  ArrowBlocker = 5,
  RailwayPlatform = 6,
  BusStop = 7,
  GeneralTrigger = 8,
  Information = 10,
  RailwayEntry = 11,
  RailwayExit = 12,
  RailwayStop = 13,
  Gang = 14,
  LocalNavigation = 15,
  Restart = 16,
  ArrestRestart = 20,
}

export enum GTA2MapFormat {
  Uncompressed = 'UMAP',
  Compressed = 'CMAP',
  WideCompressed = 'DMAP',
}

export enum GTA2MapChunk {
  Root = 'GBMP',
  UncompressedMap = 'UMAP',
  CompressedMap = 'CMAP',
  WideCompressedMap = 'DMAP',
  Objects = 'MOBJ',
  Zones = 'ZONE',
  Animations = 'ANIM',
  Lights = 'LGHT',
  PsxMapping = 'PSXM',
  RoadGraph = 'RGEN',
}

export enum GTA2Direction {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

/** Bit fields used by a packed map face value. */
export const GTA2FaceBits = {
  TileMask: 0x03ff,
  Wall: 0x0400,
  BulletWall: 0x0800,
  Flat: 0x1000,
  Flip: 0x2000,
  RotationShift: 14,
  RotationStepDegrees: 90,
} as const;

/** Bit fields used by a packed road arrow value. */
export const GTA2RoadArrowBits = {
  GreenLeft: 1 << 0,
  GreenRight: 1 << 1,
  GreenUp: 1 << 2,
  GreenDown: 1 << 3,
  RedLeft: 1 << 4,
  RedRight: 1 << 5,
  RedUp: 1 << 6,
  RedDown: 1 << 7,
  GreenMask: 0x0f,
  RedMask: 0xf0,
} as const;

/** Dimensions and fixed capacities used by the GTA2 map chunks. */
export const GTA2MapLimits = {
  Width: 256,
  Height: 256,
  Layers: 8,
  InteriorMinTile: 1,
  InteriorMaxTileExclusive: 255,
  BlockBytes: 12,
} as const;

/** Fixed-point scales used by map object and light records. */
export const GTA2MapEncoding = {
  ObjectCoordinateScale: 128,
  ObjectRotationSteps: 256,
  LightFixedPointScale: 128,
  GroundTypeMask: 0x03,
  SlopeTypeShift: 2,
} as const;

/** Fixed record sizes and capacities used by the road graph chunk. */
export const GTA2RoadGraphLimits = {
  JunctionCapacity: 1024,
  SegmentCapacity: 512,
  JunctionBytes: 9,
  SegmentBytes: 8,
  CountsBytes: 6,
} as const;

/** The complete format vocabulary, convenient for callers that prefer one import. */
export const GTA2Enums = {
  FaceType: GTA2FaceType,
  SlopeType: GTA2SlopeType,
  GroundType: GTA2GroundType,
  MapZoneType: GTA2MapZoneType,
  MapFormat: GTA2MapFormat,
  MapChunk: GTA2MapChunk,
  Direction: GTA2Direction,
  FaceBits: GTA2FaceBits,
  RoadArrowBits: GTA2RoadArrowBits,
  MapLimits: GTA2MapLimits,
  MapEncoding: GTA2MapEncoding,
  RoadGraphLimits: GTA2RoadGraphLimits,
} as const;

