import type { Block, GameMap } from '../../engine/loader/map-parser';
import { blockFloor } from '../physics/map-surface';
import { GTA2GroundType, GTA2SlopeType } from '../world/gta2-enums';
import { WORLD, tileToWorld } from '../world/world';

export interface PedestrianNavNode {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly height: number;
  readonly collisionLayer: number;
  /** Actual GMP ground type, retained for crossing/debug state only. */
  readonly groundType: number;
  /** The source's top non-air surface is pedestrian pavement at this column. */
  readonly isPavement: boolean;
  /** Actual GMP road classification, retained for crossing/debug state only. */
  readonly isRoad: boolean;
  /** A legal one-tile move in the source-style local pathfinder. */
  readonly neighbors: readonly number[];
}

export interface PedestrianNavPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number | undefined;
}

export interface PedestrianPathDebug {
  readonly start: number;
  readonly goal: number;
  readonly visited: readonly number[];
  readonly path: readonly number[];
}

export interface PedestrianPathOptions {
  /** Keep non-pavement blocks out of ordinary civilian movement unless an objective explicitly permits crossing. */
  readonly avoidRoads?: boolean;
}

export type PedestrianPath = number[];

const SEARCH_RADIUS = 16;
const MAX_SEARCH_NODES = 398;
const MAX_WAYPOINTS = 100;
const GTA2_WATER_LID_TILE = 608;

const directions = [
  { dx: 0, dy: -1, face: 'Top' as const, opposite: 'Bottom' as const, diagonal: false },
  { dx: 0, dy: 1, face: 'Bottom' as const, opposite: 'Top' as const, diagonal: false },
  { dx: -1, dy: 0, face: 'Left' as const, opposite: 'Right' as const, diagonal: false },
  { dx: 1, dy: 0, face: 'Right' as const, opposite: 'Left' as const, diagonal: false },
  { dx: -1, dy: -1, diagonal: true },
  { dx: 1, dy: -1, diagonal: true },
  { dx: -1, dy: 1, diagonal: true },
  { dx: 1, dy: 1, diagonal: true },
] as const;

function walkable(block: Block | undefined): block is Block {
  // Water/open space is encoded as AIR. A lid can still be present for the
  // rendered surface, so the lid alone is not a valid pedestrian surface.
  return block !== undefined && Boolean(block.Lid.tileNumber) && block.groundType !== GTA2GroundType.Air;
}

function nodeHeight(block: Block, z: number) {
  const floor = blockFloor(block, z, .5, .5);
  return floor + 1;
}

function collisionLayer(height: number) {
  return Math.max(0, Math.min(7, Math.ceil(height)));
}

function key(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function xyKey(x: number, y: number) {
  return `${x},${y}`;
}

function gradientSlope(block: Block | undefined) {
  if (!block) return false;
  return (block.slopeType >= GTA2SlopeType.UpLow && block.slopeType <= GTA2SlopeType.RightHigh) ||
    (block.slopeType >= GTA2SlopeType.Up7Low && block.slopeType <= GTA2SlopeType.Right7High) ||
    (block.slopeType >= GTA2SlopeType.DiagonalFacingDown && block.slopeType <= GTA2SlopeType.DiagonalFacingRight);
}

/**
 * GTA2's pedestrian pathfinder is a bounded, local search rather than a
 * persistent world graph. The nodes remain useful as authored map samples for
 * spawning and debug rendering, while findPath/neighbor expansion mirrors the
 * source's 34x33 search window and terrain checks.
 */
export class PedestrianNavigation {
  readonly nodes: readonly PedestrianNavNode[];
  lastSearch: PedestrianPathDebug | undefined;
  private readonly nodeByKey = new Map<string, PedestrianNavNode>();
  private readonly nodesByXY = new Map<string, PedestrianNavNode[]>();
  private readonly surfaceGroundTypeByXY = new Map<string, number>();

  constructor(readonly level: GameMap) {
    const drafts: Array<Omit<PedestrianNavNode, 'neighbors'>> = [];
    for (let x = 0; x < level.map.length; x++) {
      const column = level.map[x];
      if (!column) continue;
      for (let y = 0; y < column.length; y++) {
        const layers = column[y];
        if (!layers) continue;

        // This is the same lookup used by the original pedestrian spawn path:
        // scan down from the highest map layer, skip AIR, and classify the
        // first non-air block. Only a top PAVEMENT block is a civilian spawn
        // and ordinary-walk surface. Road/field nodes are retained so the
        // debug graph and explicit crossing/objective paths remain visible.
        let topNonAirZ: number | undefined;
        for (let layer = layers.length - 1; layer >= 0; layer--) {
          const candidate = layers[layer];
          if (candidate && candidate.groundType !== GTA2GroundType.Air) {
            topNonAirZ = layer;
            break;
          }
        }
        let surfaceGroundType = GTA2GroundType.Air;
        if (topNonAirZ !== undefined) surfaceGroundType = layers[topNonAirZ]?.groundType ?? GTA2GroundType.Air;
        this.surfaceGroundTypeByXY.set(xyKey(x, y), surfaceGroundType);
        let pavementLayer: number | undefined;
        if (surfaceGroundType === GTA2GroundType.Pavement) pavementLayer = topNonAirZ;

        for (let z = 0; z < layers.length; z++) {
          const block = layers[z];
          if (!walkable(block)) continue;
          const height = nodeHeight(block, z);
          drafts.push({
            id: drafts.length, x, y, z,
            worldX: tileToWorld(x), worldY: -tileToWorld(y),
            height, collisionLayer: collisionLayer(height),
            groundType: block.groundType,
            isPavement: z === pavementLayer,
            // Green arrows describe car routing and may be authored on any
            // non-air ground. Ground type is the only road classification.
            isRoad: block.groundType === GTA2GroundType.Road,
          });
        }
      }
    }

    const baseNodes = drafts.map(node => ({ ...node, neighbors: [] as readonly number[] }));
    for (const node of baseNodes) {
      this.nodeByKey.set(key(node.x, node.y, node.z), node);
      const list = this.nodesByXY.get(xyKey(node.x, node.y)) ?? [];
      list.push(node);
      this.nodesByXY.set(xyKey(node.x, node.y), list);
    }

    this.nodes = baseNodes.map(node => ({ ...node, neighbors: this.computeNeighbors(node) }));
    this.nodeByKey.clear();
    this.nodesByXY.clear();
    for (const node of this.nodes) {
      this.nodeByKey.set(key(node.x, node.y, node.z), node);
      const list = this.nodesByXY.get(xyKey(node.x, node.y)) ?? [];
      list.push(node);
      this.nodesByXY.set(xyKey(node.x, node.y), list);
    }
  }

  node(id: number) { return this.nodes[id]; }

  private nearestNode(point: PedestrianNavPoint, maxDistance = Number.POSITIVE_INFINITY): PedestrianNavNode | undefined {
    let best: PedestrianNavNode | undefined;
    let bestDistance = maxDistance;
    for (const node of this.nodes) {
      if (point.z !== undefined && Math.abs(node.height - point.z) > 1.05) continue;
      const distance = Math.hypot(node.worldX - point.x, node.worldY - point.y);
      if (distance < bestDistance) { best = node; bestDistance = distance; }
    }
    return best;
  }

  nearest(point: PedestrianNavPoint, maxDistance = Number.POSITIVE_INFINITY): PedestrianNavNode {
    const node = this.nearestNode(point, maxDistance);
    if (!node) throw new Error(`No pedestrian navigation node near ${point.x},${point.y},${point.z ?? 'any height'}`);
    return node;
  }

  /** Return the source-style top surface classification at a world point. */
  groundTypeAt(point: PedestrianNavPoint) {
    const x = Math.round(point.x / WORLD.tileSize);
    const y = Math.round(-point.y / WORLD.tileSize);
    return this.surfaceGroundTypeByXY.get(xyKey(x, y)) ?? GTA2GroundType.Air;
  }

  isNonAirAt(point: PedestrianNavPoint) {
    return this.groundTypeAt(point) !== GTA2GroundType.Air;
  }

  /** GMP water uses the animated lid tile 608. Its packed ground type is
   * Field, so ground type alone cannot distinguish it from dry terrain. */
  isWaterAt(point: PedestrianNavPoint) {
    const x = Math.round(point.x / WORLD.tileSize), y = Math.round(-point.y / WORLD.tileSize);
    const column = this.level.map[x]?.[y];
    const floor = column?.[0];
    return floor !== undefined && floor.Lid.tileNumber === GTA2_WATER_LID_TILE;
  }

  isPavementAt(point: PedestrianNavPoint) {
    return this.groundTypeAt(point) === GTA2GroundType.Pavement;
  }

  private candidatesAt(x: number, y: number, height: number) {
    return [...(this.nodesByXY.get(xyKey(x, y)) ?? [])]
      .sort((a, b) => Math.abs(a.height - height) - Math.abs(b.height - height) || Math.abs(a.z - b.z));
  }

  private block(node: PedestrianNavNode) {
    return this.level.map[node.x]?.[node.y]?.[node.z];
  }

  private cardinalStep(from: PedestrianNavNode, to: PedestrianNavNode, dx: number, dy: number) {
    const fromBlock = this.block(from), toBlock = this.block(to);
    if (!fromBlock || !toBlock || Math.abs(from.height - to.height) > 1.05) return false;
    if (dx === 1 && (fromBlock.Right.wall || toBlock.Left.wall)) return false;
    if (dx === -1 && (fromBlock.Left.wall || toBlock.Right.wall)) return false;
    if (dy === 1 && (fromBlock.Bottom.wall || toBlock.Top.wall)) return false;
    if (dy === -1 && (fromBlock.Top.wall || toBlock.Bottom.wall)) return false;
    return true;
  }

  private targetFor(from: PedestrianNavNode, x: number, y: number) {
    return this.candidatesAt(x, y, from.height).find(candidate => Math.abs(candidate.height - from.height) <= 1.05);
  }

  private canMove(from: PedestrianNavNode, to: PedestrianNavNode, dx: number, dy: number, diagonal: boolean) {
    if (!diagonal) return this.cardinalStep(from, to, dx, dy);

    // Match CanMoveDiagonally: both cardinal legs must be legal and gradient
    // slopes cannot be cut across at either corner.
    const first = this.targetFor(from, from.x + dx, from.y);
    const second = this.targetFor(from, from.x, from.y + dy);
    if (!first || !second || gradientSlope(this.block(from)) || gradientSlope(this.block(first)) || gradientSlope(this.block(second))) return false;
    return this.cardinalStep(from, first, dx, 0) && this.cardinalStep(from, second, 0, dy) &&
      this.cardinalStep(first, to, 0, dy) && this.cardinalStep(second, to, dx, 0);
  }

  private computeNeighbors(from: PedestrianNavNode) {
    const neighbors: number[] = [];
    for (const direction of directions) {
      const target = this.targetFor(from, from.x + direction.dx, from.y + direction.dy);
      if (target && this.canMove(from, target, direction.dx, direction.dy, direction.diagonal)) neighbors.push(target.id);
    }
    return neighbors;
  }

  /** Return node ids including the start and goal. An empty path means the
   * navigation graph cannot connect the requested points. */
  findPath(start: PedestrianNavPoint, goal: PedestrianNavPoint, options: PedestrianPathOptions = {}): PedestrianPath {
    const from = this.nearestNode(start), to = this.nearestNode(goal);
    if (!from || !to) return [];
    if (Math.abs(to.x - from.x) > SEARCH_RADIUS || Math.abs(to.y - from.y) > SEARCH_RADIUS) return [];
    if (from.id === to.id) return [from.id];

    const open = new Set<number>([from.id]);
    const cameFrom = new Map<number, number>();
    const cost = new Map<number, number>([[from.id, 0]]);
    const estimate = (node: PedestrianNavNode) => Math.hypot(node.x - to.x, node.y - to.y) + Math.abs(node.height - to.height) * 2;
    const score = new Map<number, number>([[from.id, estimate(from)]]);
    const visited: number[] = [];

    while (open.size && visited.length < MAX_SEARCH_NODES) {
      let current = open.values().next().value as number;
      for (const id of open) if ((score.get(id) ?? Infinity) < (score.get(current) ?? Infinity)) current = id;
      open.delete(current);
      visited.push(current);
      if (current === to.id) {
        const path = [current];
        while (cameFrom.has(path[0]!)) path.unshift(cameFrom.get(path[0]!)!);
        this.lastSearch = { start: from.id, goal: to.id, visited, path };
        return path.slice(0, MAX_WAYPOINTS);
      }
      const currentNode = this.node(current);
      if (!currentNode) continue;
      for (const neighborId of currentNode.neighbors) {
        const neighbor = this.node(neighborId);
        if (!neighbor || Math.abs(neighbor.x - from.x) > SEARCH_RADIUS || Math.abs(neighbor.y - from.y) > SEARCH_RADIUS) continue;
        // GTA2 does not make an ordinary dummy wander across non-pavement
        // terrain: road/field movement is entered by a dedicated objective.
        // Keep the current and final nodes available for an explicit crossing
        // target, but do not use non-pavement blocks as civilian waypoints.
        if (options.avoidRoads && !neighbor.isPavement && neighbor.id !== to.id) continue;
        const distance = Math.hypot(neighbor.x - currentNode.x, neighbor.y - currentNode.y);
        const nextCost = (cost.get(current) ?? Infinity) + distance + Math.abs(neighbor.height - currentNode.height) * 2;
        if (nextCost >= (cost.get(neighborId) ?? Infinity)) continue;
        cameFrom.set(neighborId, current);
        cost.set(neighborId, nextCost);
        score.set(neighborId, nextCost + estimate(neighbor));
        open.add(neighborId);
      }
    }
    this.lastSearch = { start: from.id, goal: to.id, visited, path: [] };
    return [];
  }

  neighborsOf(id: number) {
    const node = this.node(id);
    if (!node) return [];
    const neighbors: PedestrianNavNode[] = [];
    for (const neighborId of node.neighbors) {
      const neighbor = this.node(neighborId);
      if (neighbor) neighbors.push(neighbor);
    }
    return neighbors;
  }
}

export function pedestrianNodeDistance(a: PedestrianNavNode, b: PedestrianNavNode) {
  return Math.hypot((a.x - b.x) * WORLD.tileSize, (a.y - b.y) * WORLD.tileSize);
}

export function isWalkableSlope(block: Block) {
  return block.slopeType === GTA2SlopeType.Flat || block.slopeType >= GTA2SlopeType.UpLow;
}
