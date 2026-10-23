import type {
  RoadJunction,
  RoadLink,
  RoadNode,
  RoadSegment,
  TrafficMapMetadata,
} from '../../engine/loader/models/map';

/** Arrow/link permissions used by the retail RouteFinder. */
export type RoadRouteMode = 'ordinary' | 'special' | 'green-or-red';
export type RoadDirection = 'up' | 'down' | 'left' | 'right';
export type RoadSegmentOrientation = 'horizontal' | 'vertical' | 'unknown';
type RoadLinkDirection = 'north' | 'south' | 'east' | 'west';

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
}

export interface RoadBlockMatch {
  index: number;
  node: RoadNode;
}

export interface RoadSegmentMatch {
  index: number;
  orientation: Exclude<RoadSegmentOrientation, 'unknown'>;
  segment: RoadSegment;
  direction: RoadDirection;
  junction: number;
  endpoint: 'start' | 'destination';
}

export interface RoadArrowTarget {
  index: number;
  node: RoadNode;
  direction: RoadDirection;
}

export interface RoadRouteSegment {
  fromJunction: number;
  toJunction: number;
  length: number;
  orientation: RoadSegmentOrientation;
  segmentIndex?: number;
  segment?: RoadSegment;
}

export interface RoadRouteQuery {
  start: RoadPoint;
  destination: RoadPoint;
  mode?: RoadRouteMode;
}

export interface RoadRoute {
  mode: RoadRouteMode;
  startJunction: number;
  destinationJunction: number;
  junctions: number[];
  segments: RoadRouteSegment[];
  firstArrow?: RoadArrowTarget;
}

export interface RoadRoutingMetadata extends Pick<TrafficMapMetadata, 'roadNodes' | 'junctions' | 'horizontalSegments' | 'verticalSegments'> {}

const DIRECTIONS: readonly RoadDirection[] = ['up', 'down', 'left', 'right'];
const LINK_DIRECTIONS: readonly RoadLinkDirection[] = ['north', 'south', 'west', 'east'];

function directionForLink(direction: RoadLinkDirection): RoadDirection {
  if (direction === 'north') return 'up';
  if (direction === 'south') return 'down';
  if (direction === 'west') return 'left';
  return 'right';
}

function orientationForDirection(direction: RoadDirection): Exclude<RoadSegmentOrientation, 'unknown'> {
  return direction === 'up' || direction === 'down' ? 'vertical' : 'horizontal';
}

function linkDirectionForArrow(direction: RoadDirection): RoadLinkDirection {
  if (direction === 'up') return 'north';
  if (direction === 'down') return 'south';
  if (direction === 'left') return 'west';
  return 'east';
}

/** Decode a retail Link_2 value: 9-bit index, 6-bit cost, high-bit enabled. */
export function decodeRoadLink(rawValue: number): RoadLink {
  const raw = rawValue & 0xffff;
  return { raw, index: raw & 0x1ff, length: (raw >>> 9) & 0x3f, enabled: !!(raw & 0x8000) };
}

function roadLinkFromLegacyIndex(index: number): RoadLink | undefined {
  if (index <= 0) return undefined;
  return { raw: index, index, length: 1, enabled: true };
}

function hasArrow(node: RoadNode, direction: RoadDirection, mode: RoadRouteMode): boolean {
  if (mode === 'ordinary') return node.green[direction];
  if (mode === 'special') return node.red[direction];
  return node.green[direction] || node.red[direction];
}

function contains(segment: RoadSegment, point: RoadPoint): boolean {
  return point.x >= segment.minX && point.x <= segment.maxX && point.y >= segment.minY && point.y <= segment.maxY;
}

/**
 * Environment-neutral lookup and routing over the decoded GMP road graph.
 *
 * `RoadJunction.links` remains compatible with the existing compact loader
 * shape. Source-sized RGEN records also provide `linkData`, which supplies
 * enabled bits and authored link lengths. When that metadata is absent, a
 * legacy link is treated as an enabled unit-cost edge.
 */
export class RoadRouter {
  private readonly junctionById = new Map<number, RoadJunction>();

  constructor(readonly metadata: RoadRoutingMetadata) {
    for (const junction of metadata.junctions) this.junctionById.set(junction.index, junction);
  }

  findJunction(index: number): RoadJunction | undefined {
    return this.junctionById.get(index);
  }

  findBlock(point: RoadPoint, mode: RoadRouteMode = 'green-or-red'): RoadBlockMatch | undefined {
    const matches = this.metadata.roadNodes
      .map((node, index) => ({ index, node }))
      .filter(({ node }) => node.x === point.x && node.y === point.y && node.z === point.z && DIRECTIONS.some(direction => hasArrow(node, direction, mode)))
      .sort((left, right) => left.index - right.index);
    return matches[0];
  }

  /** Find the RGEN segment containing a road block and select its source/destination endpoint. */
  findSegment(point: RoadPoint, mode: RoadRouteMode = 'ordinary', endpoint: 'start' | 'destination' = 'start'): RoadSegmentMatch | undefined {
    const blocks = this.metadata.roadNodes
      .map((node, index) => ({ index, node }))
      .filter(({ node }) => node.x === point.x && node.y === point.y && node.z === point.z)
      .sort((left, right) => left.index - right.index);

    for (const block of blocks) {
      for (const direction of DIRECTIONS) {
        if (!hasArrow(block.node, direction, mode)) continue;
        const orientation = orientationForDirection(direction);
        const segments = orientation === 'horizontal' ? this.metadata.horizontalSegments : this.metadata.verticalSegments;
        for (let index = 0; index < segments.length; index++) {
          const segment = segments[index]!;
          if (!contains(segment, point)) continue;
          const sourceJunction = direction === 'up' || direction === 'left' ? segment.junction2 : segment.junction1;
          const destinationJunction = direction === 'up' || direction === 'left' ? segment.junction1 : segment.junction2;
          return {
            index,
            orientation,
            segment,
            direction,
            junction: endpoint === 'start' ? sourceJunction : destinationJunction,
            endpoint,
          };
        }
      }
    }
    return undefined;
  }

  /** Resolve the first authored arrow block in a junction, matching source scan order. */
  resolveFirstArrow(junctionIndex: number, direction: RoadDirection, mode: RoadRouteMode = 'ordinary'): RoadArrowTarget | undefined {
    const junction = this.findJunction(junctionIndex);
    if (!junction) return undefined;
    const blocks = this.metadata.roadNodes
      .map((node, index) => ({ index, node }))
      .filter(({ node }) => node.x >= junction.minX && node.x <= junction.maxX && node.y >= junction.minY && node.y <= junction.maxY)
      .sort((left, right) => left.node.y - right.node.y || left.node.x - right.node.x || left.node.z - right.node.z || left.index - right.index);
    const exact = blocks.find(block => hasArrow(block.node, direction, mode));
    if (exact) return { ...exact, direction };
    const fallback = blocks.find(block => DIRECTIONS.some(candidate => hasArrow(block.node, candidate, mode)));
    if (!fallback) return undefined;
    const fallbackDirection = DIRECTIONS.find(candidate => hasArrow(fallback.node, candidate, mode));
    if (!fallbackDirection) return undefined;
    return { ...fallback, direction: fallbackDirection };
  }

  findRoute(query: RoadRouteQuery): RoadRoute | undefined {
    const mode = query.mode ?? 'ordinary';
    const start = this.findSegment(query.start, mode, 'start');
    const destination = this.findSegment(query.destination, mode, 'destination');
    if (!start || !destination) return undefined;
    if (!this.findJunction(start.junction) || !this.findJunction(destination.junction)) return undefined;

    const junctionPath = this.search(start.junction, destination.junction, mode);
    if (!junctionPath) return undefined;
    const segments = junctionPath.slice(0, -1).map((fromJunction, index) => {
      const toJunction = junctionPath[index + 1]!;
      const edge = this.edgeBetween(fromJunction, toJunction);
      const routeSegment: RoadRouteSegment = {
        fromJunction,
        toJunction,
        length: edge?.link.length || 1,
        orientation: edge ? orientationForDirection(directionForLink(edge.direction)) : 'unknown',
      };
      const segment = edge ? this.segmentBetween(fromJunction, toJunction, orientationForDirection(directionForLink(edge.direction))) : undefined;
      if (segment) {
        routeSegment.segmentIndex = segment.index;
        routeSegment.segment = segment.segment;
      }
      return routeSegment;
    });
    const route: RoadRoute = {
      mode,
      startJunction: start.junction,
      destinationJunction: destination.junction,
      junctions: junctionPath,
      segments,
    };
    const firstEdge = this.edgeBetween(start.junction, junctionPath[1] ?? destination.junction);
    const firstArrow = firstEdge
      ? this.resolveFirstArrow(start.junction, directionForLink(firstEdge.direction), mode)
      : this.resolveFirstArrow(start.junction, start.direction, mode);
    if (firstArrow) route.firstArrow = firstArrow;
    return route;
  }

  private linkFor(junction: RoadJunction, direction: RoadDirection): RoadLink | undefined {
    const linkDirection = linkDirectionForArrow(direction);
    const sourceLink = junction.linkData?.[linkDirection];
    if (sourceLink) return sourceLink.index > 0 && sourceLink.enabled ? sourceLink : undefined;
    const legacyIndex = junction.links[linkDirection];
    if (legacyIndex > 0x1ff || legacyIndex & 0x8000) {
      const decoded = decodeRoadLink(legacyIndex);
      return decoded.index > 0 && decoded.enabled ? decoded : undefined;
    }
    return roadLinkFromLegacyIndex(legacyIndex);
  }

  private junctionAllows(junction: RoadJunction, mode: RoadRouteMode): boolean {
    // Junction_10::sub_588580_ limits ordinary searches to non-special
    // junctions and special searches to non-ordinary junctions. The compact
    // loader exposes the same source field as searchType.
    if (mode === 'ordinary') return junction.searchType !== 2;
    if (mode === 'special') return junction.searchType !== 1;
    return true;
  }

  private neighbors(junctionIndex: number, mode: RoadRouteMode): { direction: RoadLinkDirection; junction: RoadJunction; link: RoadLink }[] {
    const junction = this.findJunction(junctionIndex);
    if (!junction) return [];
    const result: { direction: RoadLinkDirection; junction: RoadJunction; link: RoadLink }[] = [];
    for (const direction of LINK_DIRECTIONS) {
      const arrowDirection = directionForLink(direction);
      const link = this.linkFor(junction, arrowDirection);
      if (!link) continue;
      const target = this.findJunction(link.index);
      if (!target || !this.junctionAllows(target, mode)) continue;
      if (!this.edgeUsesAllowedArrow(junctionIndex, target.index, arrowDirection, mode)) continue;
      result.push({ direction, junction: target, link });
    }
    return result;
  }

  private heuristic(from: RoadJunction, destination: RoadJunction): number {
    return Math.abs(from.minX - destination.minX) + Math.abs(from.minY - destination.minY);
  }

  private search(start: number, destination: number, mode: RoadRouteMode): number[] | undefined {
    if (start === destination) return [start];
    const destinationJunction = this.findJunction(destination);
    if (!destinationJunction) return undefined;
    interface OpenNode { index: number; cost: number; estimate: number; order: number }
    const open: OpenNode[] = [];
    const bestCost = new Map<number, number>([[start, 0]]);
    const previous = new Map<number, number>();
    let order = 0;
    const startJunction = this.findJunction(start);
    if (!startJunction) return undefined;
    open.push({ index: start, cost: 0, estimate: this.heuristic(startJunction, destinationJunction), order: order++ });
    while (open.length) {
      // The retail open list keeps equal-cost insertions stable. Preserve that
      // ordering after the authored north/south/west/east neighbor order while
      // still making the result independent of JavaScript sort stability.
      open.sort((left, right) => left.estimate - right.estimate || left.cost - right.cost || left.order - right.order || left.index - right.index);
      const current = open.shift()!;
      if (current.cost !== bestCost.get(current.index)) continue;
      if (current.index === destination) {
        const path: number[] = [destination];
        let cursor = destination;
        while (cursor !== start) {
          const parent = previous.get(cursor);
          if (parent === undefined) return undefined;
          path.push(parent);
          cursor = parent;
        }
        return path.reverse();
      }
      for (const neighbor of this.neighbors(current.index, mode)) {
        const nextCost = current.cost + (neighbor.link.length || 1);
        if (nextCost >= (bestCost.get(neighbor.junction.index) ?? Number.POSITIVE_INFINITY)) continue;
        bestCost.set(neighbor.junction.index, nextCost);
        previous.set(neighbor.junction.index, current.index);
        open.push({ index: neighbor.junction.index, cost: nextCost, estimate: nextCost + this.heuristic(neighbor.junction, destinationJunction), order: order++ });
      }
    }
    return undefined;
  }

  private edgeBetween(fromJunction: number, toJunction: number): { direction: RoadLinkDirection; link: RoadLink } | undefined {
    return this.neighbors(fromJunction, 'green-or-red').find(neighbor => neighbor.junction.index === toJunction);
  }

  private edgeUsesAllowedArrow(fromJunction: number, toJunction: number, direction: RoadDirection, mode: RoadRouteMode): boolean {
    const orientation = orientationForDirection(direction);
    const segment = this.segmentBetween(fromJunction, toJunction, orientation);
    // Compact/hand-authored fixtures may expose links without segment bounds.
    // In that case the typed metadata cannot prove an arrow restriction, so
    // retain the graph edge and let the caller's block lookup decide entry.
    if (!segment) return true;
    return this.metadata.roadNodes.some(node => node.x >= segment.segment.minX && node.x <= segment.segment.maxX
      && node.y >= segment.segment.minY && node.y <= segment.segment.maxY && hasArrow(node, direction, mode));
  }

  private segmentBetween(fromJunction: number, toJunction: number, orientation: Exclude<RoadSegmentOrientation, 'unknown'>): { index: number; segment: RoadSegment } | undefined {
    const segments = orientation === 'horizontal' ? this.metadata.horizontalSegments : this.metadata.verticalSegments;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      if ((segment.junction1 === fromJunction && segment.junction2 === toJunction) || (segment.junction1 === toJunction && segment.junction2 === fromJunction)) return { index, segment };
    }
    return undefined;
  }
}
