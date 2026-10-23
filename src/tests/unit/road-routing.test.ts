import { describe, expect, it } from 'vitest';
import { RoadRouter, decodeRoadLink } from '../../shared/domain/vehicles/road-routing';
import { binary, chunk } from './fixtures';
import { parseMap, parseRoadGraph } from '../../shared/engine/loader/map-parser';
import type { RoadJunction, RoadLink, RoadNode, TrafficMapMetadata } from '../../shared/engine/loader/models/map';

function sourceLink(index: number, length: number, enabled = true): RoadLink {
  const raw = (enabled ? 0x8000 : 0) | ((length & 0x3f) << 9) | (index & 0x1ff);
  return { raw, index, length, enabled };
}

function linkSet(overrides: Partial<Record<'north' | 'south' | 'east' | 'west', RoadLink>> = {}) {
  const empty = sourceLink(0, 0, false);
  return { north: overrides.north ?? empty, south: overrides.south ?? empty, east: overrides.east ?? empty, west: overrides.west ?? empty };
}

function junction(index: number, x: number, y: number, links: ReturnType<typeof linkSet>, searchType = 0): RoadJunction {
  return { index, links: { north: links.north.index, south: links.south.index, east: links.east.index, west: links.west.index }, linkData: links, searchType, minX: x, minY: y, maxX: x, maxY: y };
}

function roadNode(x: number, y: number, green: Partial<RoadNode['green']> = {}, red: Partial<RoadNode['red']> = {}): RoadNode {
  const greenSet = { left: false, right: false, up: false, down: false, ...green };
  const redSet = { left: false, right: false, up: false, down: false, ...red };
  let arrows = 0;
  if (greenSet.left) arrows |= 1;
  if (greenSet.right) arrows |= 2;
  if (greenSet.up) arrows |= 4;
  if (greenSet.down) arrows |= 8;
  if (redSet.left) arrows |= 16;
  if (redSet.right) arrows |= 32;
  if (redSet.up) arrows |= 64;
  if (redSet.down) arrows |= 128;
  return { x, y, z: 0, arrows, green: greenSet, red: redSet, next: [], specialNext: [] };
}

function routeFixture(): TrafficMapMetadata {
  const junctions = [
    junction(1, 10, 10, linkSet({ south: sourceLink(3, 2), east: sourceLink(2, 2) })),
    junction(2, 20, 10, linkSet({ south: sourceLink(4, 2), west: sourceLink(1, 2) })),
    junction(3, 10, 20, linkSet({ north: sourceLink(1, 2), east: sourceLink(4, 2) })),
    junction(4, 20, 20, linkSet({ north: sourceLink(2, 2), west: sourceLink(3, 2) })),
  ];
  const roadNodes = [
    roadNode(10, 10, { right: true, down: true }),
    roadNode(20, 10, { down: true }),
    roadNode(10, 20, { right: true }),
    roadNode(20, 20, { down: true }),
  ];
  return {
    roadNodes,
    junctions,
    horizontalSegments: [
      { junction1: 1, junction2: 2, minX: 10, minY: 10, maxX: 20, maxY: 10 },
      { junction1: 3, junction2: 4, minX: 10, minY: 20, maxX: 20, maxY: 20 },
    ],
    verticalSegments: [
      { junction1: 1, junction2: 3, minX: 10, minY: 10, maxX: 10, maxY: 20 },
      { junction1: 2, junction2: 4, minX: 20, minY: 10, maxX: 20, maxY: 20 },
    ],
    trafficLightZones: [], arrowBlockerZones: [], busStopZones: [],
  };
}

describe('road routing data', () => {
  it('keeps red-only arrow blocks in the parsed road graph', () => {
    const umap = new Uint8Array(256 * 256 * 8 * 12);
    const blockOffset = (5 * 256 + 5) * 12;
    umap[blockOffset + 10] = 0x40;
    const level = parseMap(binary('GBMP', [chunk('UMAP', umap)]));
    expect(level.traffic.roadNodes).toHaveLength(1);
    expect(level.traffic.roadNodes[0]).toMatchObject({ x: 5, y: 5, z: 0, green: { up: false }, red: { up: true }, next: [], specialNext: [] });
  });

  it('decodes source RGEN link index, length, and enabled state', () => {
    const bytes = new Uint8Array(17446);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x8000 | (17 << 9) | 23, true);
    view.setUint32(8, 0, true);
    bytes.set([10, 11, 12, 13], 12);
    view.setUint16(17440, 1, true);
    const graph = parseRoadGraph(bytes, { layout: 'source' });
    expect(graph.junctions[0]?.linkData?.north).toEqual({ raw: 0xa217, index: 23, length: 17, enabled: true });
    expect(graph.junctions[0]?.links.north).toBe(23);
    expect(decodeRoadLink(0x0017)).toEqual({ raw: 23, index: 23, length: 0, enabled: false });
  });

  it('finds a deterministic length-aware route and resolves its first arrow block', () => {
    const router = new RoadRouter(routeFixture());
    const query = { start: { x: 10, y: 10, z: 0 }, destination: { x: 20, y: 20, z: 0 }, mode: 'ordinary' as const };
    const first = router.findRoute(query);
    const second = router.findRoute(query);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ startJunction: 1, destinationJunction: 4, junctions: [1, 3, 4], firstArrow: { index: 0, direction: 'down' } });
    expect(first?.segments).toMatchObject([
      { fromJunction: 1, toJunction: 3, length: 2, orientation: 'vertical', segmentIndex: 0 },
      { fromJunction: 3, toJunction: 4, length: 2, orientation: 'horizontal', segmentIndex: 1 },
    ]);
  });

  it('does not route ordinary traffic over red-only blocks, while special mode can', () => {
    const redNodeStart = roadNode(30, 30, {}, { right: true });
    const redNodeDestination = roadNode(31, 30, {}, { right: true });
    const links = [
      junction(5, 30, 30, linkSet({ east: sourceLink(6, 1) })),
      junction(6, 31, 30, linkSet({ west: sourceLink(5, 1) })),
    ];
    const metadata: TrafficMapMetadata = {
      roadNodes: [redNodeStart, redNodeDestination],
      junctions: links,
      horizontalSegments: [{ junction1: 5, junction2: 6, minX: 30, minY: 30, maxX: 31, maxY: 30 }],
      verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [],
    };
    const router = new RoadRouter(metadata);
    const query = { start: { x: 30, y: 30, z: 0 }, destination: { x: 31, y: 30, z: 0 } };
    expect(router.findRoute({ ...query, mode: 'ordinary' })).toBeUndefined();
    expect(router.findRoute({ ...query, mode: 'special' })).toMatchObject({ junctions: [5, 6], mode: 'special' });
  });
});
