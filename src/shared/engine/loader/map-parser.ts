import { BinaryReader, readChunks, requiredChunk } from './binary';
import {
  GTA2Direction,
  GTA2FaceBits,
  GTA2MapChunk,
  GTA2MapEncoding,
  GTA2MapFormat,
  GTA2MapLimits,
  GTA2MapZoneType,
  GTA2RoadArrowBits,
  GTA2RoadGraphLimits,
  GTA2SlopeType,
} from '../../domain/world/gta2-enums';
import { tileToWorld } from '../../domain/world/world';
import type {
  Block, Face, GameMap, MapLight, MapObject, MapWallSegment, MapZone, RoadArrowSet,
  RoadJunction, RoadLink, RoadLinkSet, RoadNode, TileAnimation, TrafficMapMetadata,
} from './models/map';

export type {
  Block, Face, GameMap, MapLight, MapObject, MapWallSegment, MapZone, RoadArrowSet,
  RoadJunction, RoadLink, RoadLinkSet, RoadNode, RoadSegment, TileAnimation, TrafficMapMetadata,
} from './models/map';

// Preserve the original map-module names for existing renderer and gameplay
// callers while keeping the definitions in the shared enum module.
export { GTA2Direction, GTA2FaceType as FaceType, GTA2MapChunk, GTA2MapFormat, GTA2MapZoneType as MapZoneType, GTA2SlopeType as SlopeType } from '../../domain/world/gta2-enums';

const zoneTypeNames: Record<number, string> = {
  [GTA2MapZoneType.General]: 'general', [GTA2MapZoneType.Navigation]: 'navigation',
  [GTA2MapZoneType.TrafficLight]: 'traffic-light', [GTA2MapZoneType.ArrowBlocker]: 'arrow-blocker',
  [GTA2MapZoneType.RailwayPlatform]: 'railway-platform', [GTA2MapZoneType.BusStop]: 'bus-stop',
  [GTA2MapZoneType.GeneralTrigger]: 'general-trigger', [GTA2MapZoneType.Information]: 'information',
  [GTA2MapZoneType.RailwayEntry]: 'railway-entry', [GTA2MapZoneType.RailwayExit]: 'railway-exit',
  [GTA2MapZoneType.RailwayStop]: 'railway-stop', [GTA2MapZoneType.Gang]: 'gang',
  [GTA2MapZoneType.LocalNavigation]: 'local-navigation', [GTA2MapZoneType.Restart]: 'restart',
  [GTA2MapZoneType.ArrestRestart]: 'arrest-restart',
};

/** Expand the loaded map faces into the same world-pixel segments used by
 * movement and projectile collision. This is diagnostic/query data only; the
 * authoritative native fixtures remain owned by the engine physics adapter. */
export function mapWallSegments(level: GameMap): MapWallSegment[] {
  const segments: MapWallSegment[] = [];
  const add = (x: number, y: number, z: number, points: readonly [number, number, number, number], movement: boolean, bullet: boolean) => {
    segments.push({ x1: tileToWorld(x) + points[0], y1: -tileToWorld(y) - points[1], x2: tileToWorld(x) + points[2], y2: -tileToWorld(y) - points[3], layer: z, movement, bullet });
  };
  for (let x = 0; x < level.map.length; x++) {
    const column = level.map[x];
    if (!column) continue;
    for (let y = 0; y < column.length; y++) {
      const blocks = column[y];
      if (!blocks) continue;
      for (let z = 0; z < blocks.length; z++) {
        const block = blocks[z];
        if (!block) continue;
        const face = (points: readonly [number, number, number, number], value: Face) => {
          if (value.wall || value.bulletWall) add(x, y, z, points, value.wall, value.wall || value.bulletWall);
        };
        face([-32, -32, -32, 32], block.Left);
        face([32, -32, 32, 32], block.Right);
        face([-32, -32, 32, -32], block.Top);
        face([-32, 32, 32, 32], block.Bottom);
        if (block.slopeType >= GTA2SlopeType.DiagonalFacingUpLeft && block.slopeType <= GTA2SlopeType.DiagonalFacingDownRight) {
          let points: readonly [number, number, number, number] = [-32, -32, 32, 32];
          if (block.slopeType === GTA2SlopeType.DiagonalFacingUpLeft || block.slopeType === GTA2SlopeType.DiagonalFacingDownRight) points = [-32, 32, 32, -32];
          add(x, y, z, points, true, true);
        }
      }
    }
  }
  return segments;
}
/** Convert an arrow set into the destination direction used by route code. */
export function arrowAllows(arrows: RoadArrowSet, direction: string | undefined) {
  if (direction === GTA2Direction.Up) return arrows.up;
  if (direction === GTA2Direction.Down) return arrows.down;
  if (direction === GTA2Direction.Left) return arrows.left;
  if (direction === GTA2Direction.Right) return arrows.right;
  return false;
}

export function decodeFace(value: number): Face {
  return { tileNumber: value & GTA2FaceBits.TileMask, wall: !!(value & GTA2FaceBits.Wall), bulletWall: !!(value & GTA2FaceBits.BulletWall),
    flat: !!(value & GTA2FaceBits.Flat), flip: !!(value & GTA2FaceBits.Flip), rotation: (value >>> GTA2FaceBits.RotationShift) * GTA2FaceBits.RotationStepDegrees };
}

export function decodeRoadArrows(arrows: number): { green: RoadArrowSet; red: RoadArrowSet } {
  return {
    green: { left: !!(arrows & GTA2RoadArrowBits.GreenLeft), right: !!(arrows & GTA2RoadArrowBits.GreenRight), up: !!(arrows & GTA2RoadArrowBits.GreenUp), down: !!(arrows & GTA2RoadArrowBits.GreenDown) },
    red: { left: !!(arrows & GTA2RoadArrowBits.RedLeft), right: !!(arrows & GTA2RoadArrowBits.RedRight), up: !!(arrows & GTA2RoadArrowBits.RedUp), down: !!(arrows & GTA2RoadArrowBits.RedDown) },
  };
}

export type RoadGraphLayout = 'auto' | 'legacy' | 'source';

export interface ParseRoadGraphOptions {
  layout?: RoadGraphLayout;
}

const SOURCE_ROAD_GRAPH = {
  junctionCapacity: 545,
  junctionBytes: 16,
  segmentCapacity: 545,
  segmentBytes: 8,
  countsBytes: 6,
} as const;

interface RoadGraphCounts {
  junctionCount: number;
  horizontalCount: number;
  verticalCount: number;
}

function readRoadGraphCounts(bytes: Uint8Array, offset: number, junctionCapacity: number, segmentCapacity: number): RoadGraphCounts | undefined {
  if (offset < 0 || offset + 6 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = {
    junctionCount: view.getUint16(offset, true),
    horizontalCount: view.getUint16(offset + 2, true),
    verticalCount: view.getUint16(offset + 4, true),
  };
  if (counts.junctionCount > junctionCapacity || counts.horizontalCount > segmentCapacity || counts.verticalCount > segmentCapacity) return undefined;
  return counts;
}

function decodeRoadLink(view: DataView, offset: number): RoadLink {
  const raw = view.getUint16(offset, true);
  return { raw, index: raw & 0x1ff, length: (raw >>> 9) & 0x3f, enabled: !!(raw & 0x8000) };
}

function parseSourceRoadGraph(bytes: Uint8Array): Pick<TrafficMapMetadata, 'junctions' | 'horizontalSegments' | 'verticalSegments'> {
  const junctionOffset = 0;
  const horizontalOffset = SOURCE_ROAD_GRAPH.junctionCapacity * SOURCE_ROAD_GRAPH.junctionBytes;
  const verticalOffset = horizontalOffset + SOURCE_ROAD_GRAPH.segmentCapacity * SOURCE_ROAD_GRAPH.segmentBytes;
  const countsOffset = verticalOffset + SOURCE_ROAD_GRAPH.segmentCapacity * SOURCE_ROAD_GRAPH.segmentBytes;
  const minimumLength = countsOffset + SOURCE_ROAD_GRAPH.countsBytes;
  if (bytes.length < minimumLength) throw new Error('Invalid RGEN chunk size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = readRoadGraphCounts(bytes, countsOffset, SOURCE_ROAD_GRAPH.junctionCapacity, SOURCE_ROAD_GRAPH.segmentCapacity);
  if (!counts) throw new Error('Invalid RGEN counts');
  const junctions: RoadJunction[] = [];
  for (let index = 0; index < counts.junctionCount; index++) {
    const offset = junctionOffset + index * SOURCE_ROAD_GRAPH.junctionBytes;
    const linkData: RoadLinkSet = {
      north: decodeRoadLink(view, offset),
      south: decodeRoadLink(view, offset + 2),
      east: decodeRoadLink(view, offset + 4),
      west: decodeRoadLink(view, offset + 6),
    };
    junctions.push({
      index,
      links: { north: linkData.north.index, south: linkData.south.index, east: linkData.east.index, west: linkData.west.index },
      searchType: view.getUint32(offset + 8, true),
      minX: bytes[offset + 12]!, minY: bytes[offset + 13]!, maxX: bytes[offset + 14]!, maxY: bytes[offset + 15]!,
      linkData,
    });
  }
  const readSegments = (base: number, count: number) => Array.from({ length: count }, (_, index) => {
    const offset = base + index * SOURCE_ROAD_GRAPH.segmentBytes;
    return { junction1: view.getUint16(offset, true), junction2: view.getUint16(offset + 2, true), minX: bytes[offset + 4]!, minY: bytes[offset + 5]!, maxX: bytes[offset + 6]!, maxY: bytes[offset + 7]! };
  });
  return { junctions, horizontalSegments: readSegments(horizontalOffset, counts.horizontalCount), verticalSegments: readSegments(verticalOffset, counts.verticalCount) };
}

function parseLegacyRoadGraph(bytes: Uint8Array): Pick<TrafficMapMetadata, 'junctions' | 'horizontalSegments' | 'verticalSegments'> {
  const junctionOffset = 0;
  const horizontalOffset = GTA2RoadGraphLimits.JunctionCapacity * GTA2RoadGraphLimits.JunctionBytes;
  const verticalOffset = horizontalOffset + GTA2RoadGraphLimits.SegmentCapacity * GTA2RoadGraphLimits.SegmentBytes;
  const countsOffset = verticalOffset + GTA2RoadGraphLimits.SegmentCapacity * GTA2RoadGraphLimits.SegmentBytes;
  const minimumLength = countsOffset + GTA2RoadGraphLimits.CountsBytes;
  if (bytes.length < minimumLength) throw new Error('Invalid RGEN chunk size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = readRoadGraphCounts(bytes, countsOffset, GTA2RoadGraphLimits.JunctionCapacity, GTA2RoadGraphLimits.SegmentCapacity);
  if (!counts) throw new Error('Invalid RGEN counts');
  const junctions: RoadJunction[] = [];
  for (let index = 0; index < counts.junctionCount; index++) {
    const offset = junctionOffset + index * GTA2RoadGraphLimits.JunctionBytes;
    junctions.push({ index, links: { north: bytes[offset]!, south: bytes[offset + 1]!, east: bytes[offset + 2]!, west: bytes[offset + 3]! }, searchType: bytes[offset + 4]!, minX: bytes[offset + 5]!, minY: bytes[offset + 6]!, maxX: bytes[offset + 7]!, maxY: bytes[offset + 8]! });
  }
  const readSegments = (base: number, count: number) => Array.from({ length: count }, (_, index) => {
    const offset = base + index * GTA2RoadGraphLimits.SegmentBytes;
    return { junction1: view.getUint16(offset, true), junction2: view.getUint16(offset + 2, true), minX: bytes[offset + 4]!, minY: bytes[offset + 5]!, maxX: bytes[offset + 6]!, maxY: bytes[offset + 7]! };
  });
  return { junctions, horizontalSegments: readSegments(horizontalOffset, counts.horizontalCount), verticalSegments: readSegments(verticalOffset, counts.verticalCount) };
}

/** Decode the fixed-size junction/segment arrays written by the GMP editor.
 *
 * Retail RGEN records use the source-sized 16-byte junction layout, including
 * packed Link_2 values. The legacy compact layout is retained for existing
 * synthetic fixtures and older callers; it has no enabled/length bits, so the
 * routing helper treats its numeric links as enabled unit-cost edges.
 */
export function parseRoadGraph(bytes?: Uint8Array, options: ParseRoadGraphOptions = {}): Pick<TrafficMapMetadata, 'junctions' | 'horizontalSegments' | 'verticalSegments'> {
  if (!bytes) return { junctions: [], horizontalSegments: [], verticalSegments: [] };
  if (options.layout === 'source') return parseSourceRoadGraph(bytes);
  if (options.layout === 'legacy') return parseLegacyRoadGraph(bytes);

  const sourceCountsOffset = SOURCE_ROAD_GRAPH.junctionCapacity * SOURCE_ROAD_GRAPH.junctionBytes
    + SOURCE_ROAD_GRAPH.segmentCapacity * SOURCE_ROAD_GRAPH.segmentBytes * 2;
  const legacyCountsOffset = GTA2RoadGraphLimits.JunctionCapacity * GTA2RoadGraphLimits.JunctionBytes
    + GTA2RoadGraphLimits.SegmentCapacity * GTA2RoadGraphLimits.SegmentBytes * 2;
  const sourceCounts = readRoadGraphCounts(bytes, sourceCountsOffset, SOURCE_ROAD_GRAPH.junctionCapacity, SOURCE_ROAD_GRAPH.segmentCapacity);
  const legacyCounts = readRoadGraphCounts(bytes, legacyCountsOffset, GTA2RoadGraphLimits.JunctionCapacity, GTA2RoadGraphLimits.SegmentCapacity);
  const sourceHasRecords = sourceCounts !== undefined && (sourceCounts.junctionCount > 0 || sourceCounts.horizontalCount > 0 || sourceCounts.verticalCount > 0);
  if (sourceHasRecords || (sourceCounts !== undefined && legacyCounts === undefined)) return parseSourceRoadGraph(bytes);
  return parseLegacyRoadGraph(bytes);
}

export function parseMap(bytes: Uint8Array): GameMap {
  const { chunks } = readChunks(bytes, GTA2MapChunk.Root);
  const decodeBlock = (reader: BinaryReader): Block => {
    const Left = decodeFace(reader.u16()), Right = decodeFace(reader.u16());
    const Top = decodeFace(reader.u16()), Bottom = decodeFace(reader.u16()), Lid = decodeFace(reader.u16());
    const arrows = reader.u8(), slope = reader.u8();
    return { Left, Right, Top, Bottom, Lid, arrows, slopeType: slope >>> GTA2MapEncoding.SlopeTypeShift, groundType: slope & GTA2MapEncoding.GroundTypeMask };
  };
  const decodeCompressed = (bytes: Uint8Array, format: GTA2MapFormat.WideCompressed | GTA2MapFormat.Compressed) => {
    const reader = new BinaryReader(bytes), wide = format === GTA2MapFormat.WideCompressed;
    const readIndex = () => {
      if (wide) return reader.u32();
      return reader.u16();
    };
    const offsets = Array.from({ length: GTA2MapLimits.Width * GTA2MapLimits.Height }, readIndex);
    const columnCount = readIndex();
    let indexBytes = 2;
    if (wide) indexBytes = 4;
    if (columnCount > (reader.length - reader.offset) / indexBytes) throw new Error(`Invalid ${format} column count`);
    const columns = Array.from({ length: columnCount }, readIndex);
    const blockCount = readIndex();
    if (blockCount > (reader.length - reader.offset) / GTA2MapLimits.BlockBytes) throw new Error(`Invalid ${format} block count`);
    const blocks = Array.from({ length: blockCount }, () => decodeBlock(reader));
    return Array.from({ length: GTA2MapLimits.Width }, (_, x) => Array.from({ length: GTA2MapLimits.Height }, (_, y) => {
      const index = offsets[y * GTA2MapLimits.Width + x]!;
      if (index >= columns.length) throw new Error(`Invalid ${format} column offset`);
      const packed = columns[index]!;
      const height = packed & 0xff, base = (packed >>> 8) & 0xff;
      if (height > GTA2MapLimits.Layers || base > height || index + height - base >= columns.length) throw new Error(`Invalid ${format} column height`);
      const column: (Block | undefined)[] = [];
      for (let z = base; z < height; z++) {
        const block = blocks[columns[index + z - base + 1]!];
        if (!block) throw new Error(`Invalid ${format} block index`);
        column[z] = block;
      }
      return column;
    }));
  };
  const decodeUncompressed = (bytes: Uint8Array) => {
    const reader = new BinaryReader(bytes), map = Array.from({ length: GTA2MapLimits.Width }, () => Array.from({ length: GTA2MapLimits.Height }, () => [] as (Block | undefined)[]));
    if (reader.length !== GTA2MapLimits.Width * GTA2MapLimits.Height * GTA2MapLimits.Layers * GTA2MapLimits.BlockBytes) throw new Error('Invalid UMAP size');
    for (let z = 0; z < GTA2MapLimits.Layers; z++) for (let y = 0; y < GTA2MapLimits.Height; y++) for (let x = 0; x < GTA2MapLimits.Width; x++) map[x]![y]![z] = decodeBlock(reader);
    return map;
  };
  let format: GTA2MapFormat | undefined;
  if (chunks.has(GTA2MapChunk.WideCompressedMap)) format = GTA2MapFormat.WideCompressed;
  else if (chunks.has(GTA2MapChunk.CompressedMap)) format = GTA2MapFormat.Compressed;
  else if (chunks.has(GTA2MapChunk.UncompressedMap)) format = GTA2MapFormat.Uncompressed;
  if (!format) throw new Error('Missing DMAP, CMAP, or UMAP chunk');
  let map: (Block | undefined)[][][];
  if (format === GTA2MapFormat.Uncompressed) map = decodeUncompressed(requiredChunk(chunks, format));
  else map = decodeCompressed(requiredChunk(chunks, format), format);
  const objectBytes = chunks.get(GTA2MapChunk.Objects);
  const objects: MapObject[] = [];
  if (objectBytes) {
    if (objectBytes.length % 6 !== 0) throw new Error('Invalid MOBJ chunk size');
    const objectReader = new BinaryReader(objectBytes);
    while (objectReader.offset < objectReader.length) {
      const rawX = objectReader.u16(), rawY = objectReader.u16();
      let x = rawX;
      if (rawX & 0x8000) x = rawX - 0x10000;
      let y = rawY;
      if (rawY & 0x8000) y = rawY - 0x10000;
      objects.push({ x: x / GTA2MapEncoding.ObjectCoordinateScale, y: y / GTA2MapEncoding.ObjectCoordinateScale, rotation: objectReader.u8() * Math.PI * 2 / GTA2MapEncoding.ObjectRotationSteps, type: objectReader.u8() });
    }
  }
  const zones: MapZone[] = [];
  const zoneBytes = chunks.get(GTA2MapChunk.Zones);
  if (zoneBytes) {
    const zoneReader = new BinaryReader(zoneBytes);
    while (zoneReader.offset < zoneReader.length) {
      const type = zoneReader.u8(), x = zoneReader.u8(), y = zoneReader.u8(), w = zoneReader.u8(), h = zoneReader.u8(), nameLength = zoneReader.u8();
      if (zoneReader.offset + nameLength > zoneReader.length) throw new Error('Invalid ZONE chunk');
      zones.push({ type, typeName: zoneTypeNames[type] ?? 'unused', x, y, w, h, name: zoneReader.text(nameLength) });
    }
  }
  const animations: TileAnimation[] = [];
  const animationBytes = chunks.get(GTA2MapChunk.Animations);
  if (animationBytes) {
    const animationReader = new BinaryReader(animationBytes);
    while (animationReader.offset < animationReader.length) {
      const base = animationReader.u16(), frameRate = animationReader.u8(), repeat = animationReader.u8(), length = animationReader.u8(); animationReader.u8();
      if (length > 255 || animationReader.offset + length * 2 > animationReader.length) throw new Error('Invalid ANIM chunk');
      animations.push({ base, frameRate, repeat, tiles: Array.from({ length }, () => animationReader.u16()) });
    }
  }
  const lights: MapLight[] = [];
  const lightBytes = chunks.get(GTA2MapChunk.Lights);
  if (lightBytes) {
    if (lightBytes.length % 16 !== 0) throw new Error('Invalid LGHT chunk size');
    const lightReader = new BinaryReader(lightBytes);
    while (lightReader.offset < lightReader.length) {
      const argb = lightReader.u32();
      const fixed = () => lightReader.i16() / GTA2MapEncoding.LightFixedPointScale;
      lights.push({ argb, x: fixed(), y: fixed(), z: fixed(), radius: fixed(), intensity: lightReader.u8(), shape: lightReader.u8(), onTime: lightReader.u8(), offTime: lightReader.u8() });
    }
  }
  const psxBytes = chunks.get(GTA2MapChunk.PsxMapping);
  let psxMapping: Uint8Array | undefined;
  if (psxBytes) psxMapping = new Uint8Array(psxBytes);
  const roads: RoadNode[] = [], roadIndex = new Map<string, number>();
  for (let x = GTA2MapLimits.InteriorMinTile; x < GTA2MapLimits.InteriorMaxTileExclusive; x++) for (let y = GTA2MapLimits.InteriorMinTile; y < GTA2MapLimits.InteriorMaxTileExclusive; y++) for (let z = 0; z < GTA2MapLimits.Layers; z++) {
    const block = map[x]?.[y]?.[z];
    if (!block || !(block.arrows & (GTA2RoadArrowBits.GreenMask | GTA2RoadArrowBits.RedMask))) continue;
    const arrows = decodeRoadArrows(block.arrows);
    roadIndex.set(`${x},${y},${z}`, roads.length); roads.push({ x, y, z, arrows: block.arrows, ...arrows, next: [], specialNext: [] });
  }
  const directions = [[0, -1, GTA2Direction.Up], [0, 1, GTA2Direction.Down], [-1, 0, GTA2Direction.Left], [1, 0, GTA2Direction.Right]] as const;
  for (const road of roads) for (const [dx, dy, direction] of directions) {
    const next = roadIndex.get(`${road.x + dx},${road.y + dy},${road.z}`);
    if (next === undefined) continue;
    if (road.green[direction]) road.next.push(next);
    if (road.red[direction]) road.specialNext.push(next);
  }
  const junctionData = chunks.get(GTA2MapChunk.RoadGraph);
  const roadGraph = parseRoadGraph(junctionData);
  const traffic: TrafficMapMetadata = { roadNodes: roads, ...roadGraph, trafficLightZones: zones.filter(zone => zone.type === GTA2MapZoneType.TrafficLight), arrowBlockerZones: zones.filter(zone => zone.type === GTA2MapZoneType.ArrowBlocker), busStopZones: zones.filter(zone => zone.type === GTA2MapZoneType.BusStop) };
  return { map, objects, zones, animations, lights, roads, traffic, format, psxMapping, junctionData };
}

export function tileNumbers(level: GameMap) {
  const numbers = new Set<number>();
  for (const row of level.map) for (const column of row) for (const block of column) {
    if (block) for (const key of ['Left', 'Right', 'Top', 'Bottom', 'Lid'] as const) {
      if (block[key].tileNumber) numbers.add(block[key].tileNumber);
    }
  }
  for (const animation of level.animations) { numbers.add(animation.base); for (const tile of animation.tiles) numbers.add(tile); }
  return [...numbers];
}
