import type { CarPhysics } from '../../engine/loader/gci';
import type { CarInfo } from '../../engine/loader/style-parser';
import { arrowAllows, type GameMap, type RoadNode } from '../../engine/loader/map-parser';
import { rotationFromDirection, type Vector2, directionFromRotation } from '../physics/motion-vector';
import { vehicleForwardSpeed, type VehicleControl } from '../physics/vehicle-kinematics';
import { trafficCruiseSpeedFor } from '../physics/vehicle-integration';
import { WORLD, tileToWorld } from '../world/world';
import type { TrafficState } from '../../protocol/types';
import { TrafficLightSystem, type TrafficApproachDirection } from './traffic-lights';
import { RoadRouter, type RoadRoute } from './road-routing';
import { scanTrafficObstacles } from './traffic-obstacles';

/** The original TrafficSpawner refuses to allocate a 17th recycled car. */
export const RECYCLED_TRAFFIC_LIMIT = 16;
// Source car_model_enum values. Keep the metadata fallback below for custom
// styles, but do not confuse taxi/for-hire lights with a public bus.
const BUS_MODELS = new Set([11, 86]);
const TRAIN_MODELS = new Set([6, 59, 60, 61]);

type Direction = 'up' | 'down' | 'left' | 'right';

const directionFor = (from: RoadNode, to: RoadNode): Direction => {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  throw new Error(`Road nodes (${from.x},${from.y},${from.z}) and (${to.x},${to.y},${to.z}) have no direction`);
};

const directionVector: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
};

function isBusModel(model: number) { return BUS_MODELS.has(model); }
function isTrainModel(model: number) { return TRAIN_MODELS.has(model); }

function cardinalFromRotation(rotation: number): Direction {
  const forward = directionFromRotation(rotation);
  if (Math.abs(forward.x) > Math.abs(forward.y)) return forward.x >= 0 ? 'right' : 'left';
  return forward.y >= 0 ? 'up' : 'down';
}

function turnDirection(from: Direction, to: Direction): 'straight' | 'clockwise' | 'anticlockwise' | 'reverse' {
  if (from === to) return 'straight';
  const order: Direction[] = ['up', 'right', 'down', 'left'];
  const delta = (order.indexOf(to) - order.indexOf(from) + order.length) % order.length;
  if (delta === 1) return 'clockwise';
  if (delta === 3) return 'anticlockwise';
  return 'reverse';
}

function trafficDirection(direction: Direction): NonNullable<TrafficState['currentDirection']> {
  if (direction === 'up') return 'north';
  if (direction === 'down') return 'south';
  if (direction === 'left') return 'west';
  return 'east';
}

function trafficTurn(from: Direction, to: Direction): NonNullable<TrafficState['plannedTurn']> {
  const turn = turnDirection(from, to);
  if (turn === 'clockwise') return 'right';
  if (turn === 'anticlockwise') return 'left';
  if (turn === 'reverse') return 'u-turn';
  return 'none';
}

/**
 * The retail spawner works from the current camera bounds, not from a radius
 * around the player. The browser camera is presentation-only, so the server
 * uses the source-sized gameplay viewport as its deterministic approximation.
 */
const TRAFFIC_CAMERA_HALF_WIDTH_TILES = 6;
const TRAFFIC_CAMERA_HALF_HEIGHT_TILES = 4;
const TRAFFIC_EDGE_BUFFER_TILES = 5;
/** Leave room for the authored car footprint before it reaches the view. */
const TRAFFIC_SPAWN_MARGIN_TILES = 2;
const TRAFFIC_ROAD_SCAN_LENGTH = 5;

type SpawnEdge = 'top' | 'bottom' | 'left' | 'right';

interface RoadRun {
  nodeIndex: number;
  direction: Direction;
  run: number[];
}

interface SpawnRoad extends RoadRun {
  edge: SpawnEdge;
}

function cameraTileBounds(x: number, y: number) {
  const centerX = Math.round(x / WORLD.tileSize), centerY = Math.round(-y / WORLD.tileSize);
  return {
    minX: centerX - TRAFFIC_CAMERA_HALF_WIDTH_TILES,
    maxX: centerX + TRAFFIC_CAMERA_HALF_WIDTH_TILES,
    minY: centerY - TRAFFIC_CAMERA_HALF_HEIGHT_TILES,
    maxY: centerY + TRAFFIC_CAMERA_HALF_HEIGHT_TILES,
  };
}

/**
 * Return the authored road-node point used for a traffic spawn. Road nodes and
 * map blocks share the same centered tile coordinate convention as players and
 * pickups. The travel direction determines the parked car's heading; it does
 * not move the car to a tile edge.
 */
function lanePoint(node: RoadNode, _direction: Direction): Vector2 {
  return { x: tileToWorld(node.x), y: -tileToWorld(node.y) };
}

function headingFor(direction: Direction) {
  const vector = directionVector[direction];
  // Road metadata is in map coordinates; world Y is inverted by the renderer.
  return rotationFromDirection(vector.dx, -vector.dy);
}

function hash(seed: number) {
  let value = seed | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}

/**
 * Server-owned implementation of the source traffic spawner.
 *
 * Cars are spawned from authored road metadata and then follow the same compact
 * route cursor used by CarAI_78. The first snapshot remains parked-compatible;
 * the authoritative AI claims the cursor on its first update.
 */
export class CarTrafficSpawner {
  private readonly spawnedIds = new Set<number>();
  private readonly nodeById = new Map<number, RoadNode>();
  private readonly nodeAtCoordinate = new Map<string, number>();
  private readonly nodesAtCoordinate = new Map<string, number[]>();
  private readonly trafficModelPool: number[];
  private readonly trafficLights: TrafficLightSystem;
  private readonly roadRouter: RoadRouter;
  private readonly routes = new Map<number, RoadRoute>();

  constructor(readonly level: GameMap, readonly physics: ReadonlyMap<number, CarPhysics>, readonly models: readonly number[], readonly info: ReadonlyMap<number, CarInfo> = new Map()) {
    this.trafficLights = new TrafficLightSystem(level.traffic.trafficLightZones);
    this.roadRouter = new RoadRouter(level.traffic);
    level.traffic.roadNodes.forEach((node, index) => {
      this.nodeById.set(index, node);
      this.nodeAtCoordinate.set(`${node.x},${node.y},${node.z}`, index);
      const coordinate = `${node.x},${node.y}`;
      const nodes = this.nodesAtCoordinate.get(coordinate) ?? [];
      nodes.push(index); this.nodesAtCoordinate.set(coordinate, nodes);
    });
    // DistributeCarsByRating_444980 expands the authored rating digit into
    // weighted bad/average/good pools. Keep that source weighting here while
    // retaining the exact RECY model set supplied by the style loader.
    this.trafficModelPool = [];
    for (const model of models) {
      const rating = this.info.get(model)?.rating;
      if (rating === 99) continue;
      let weight = 1;
      if (rating !== undefined) weight = Math.max(1, rating % 10);
      for (let index = 0; index < weight; index++) this.trafficModelPool.push(model);
    }
    if (!this.trafficModelPool.length) this.trafficModelPool.push(...models);
  }

  private nodeAt(x: number, y: number, z: number) {
    const index = this.nodeAtCoordinate.get(`${x},${y},${z}`);
    if (index === undefined) return undefined;
    const node = this.nodeById.get(index);
    if (!node) return undefined;
    return { index, node };
  }

  private nodesAt(x: number, y: number, preferredZ: number) {
    const nodes: { index: number; node: RoadNode }[] = [];
    for (const index of this.nodesAtCoordinate.get(`${x},${y}`) ?? []) {
      const node = this.nodeById.get(index);
      if (node) nodes.push({ index, node });
    }
    return nodes.sort((a, b) => Math.abs(a.node.z - preferredZ) - Math.abs(b.node.z - preferredZ));
  }

  private isFlatRoad(node: RoadNode) {
    // RoadNodes are normally produced from arrow-bearing map blocks. Tests
    // and compact fixtures may provide only the authored graph, so an absent
    // backing block is trusted; when present, enforce the source flat-road
    // requirement and reject gradient blocks.
    const block = this.level.map[node.x]?.[node.y]?.[node.z];
    return !block || (block.groundType === 1 && block.slopeType === 0);
  }

  private roadRun(nodeIndex: number, direction: Direction): RoadRun[] {
    const node = this.nodeById.get(nodeIndex);
    if (!node || !this.isFlatRoad(node) || !arrowAllows(node.green, direction)) return [];
    const vector = directionVector[direction], run: number[] = [];
    for (let offset = 0; offset < TRAFFIC_ROAD_SCAN_LENGTH; offset++) {
      const candidate = this.nodeAt(node.x + vector.dx * offset, node.y + vector.dy * offset, node.z);
      if (!candidate || !this.isFlatRoad(candidate.node) || !arrowAllows(candidate.node.green, direction)) break;
      run.push(candidate.index);
    }
    if (!run.length) return [];
    return [{ nodeIndex, direction, run }];
  }

  private cameraEdgeRoads(x: number, y: number, z: number, seed: number): SpawnRoad[] {
    const { minX, maxX, minY, maxY } = cameraTileBounds(x, y);
    const edges: SpawnEdge[] = ['top', 'bottom', 'left', 'right'];
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const result: SpawnRoad[] = [];
    const seen = new Set<string>();
    const shuffled = <T>(items: readonly T[], salt: number) => [...items].sort((a, b) => hash(seed + salt + items.indexOf(a) * 17) - hash(seed + salt + items.indexOf(b) * 17));

    // SpawnTrafficCar tries a randomized edge/direction order, then walks
    // inward one map tile at a time until it reaches the camera edge.
    for (const edge of shuffled(edges, 11)) {
      const edgeDirections: Direction[] = shuffled(directions, edge.charCodeAt(0));
      let alongLength = maxY - minY + 1;
      if (edge === 'top' || edge === 'bottom') alongLength = maxX - minX + 1;
      const alongOffsets = Array.from({ length: alongLength }, (_, offset) => offset)
        .sort((a, b) => hash(seed + edge.charCodeAt(0) * 31 + a * 17) - hash(seed + edge.charCodeAt(0) * 31 + b * 17));
      for (const direction of edgeDirections) {
        for (const offset of alongOffsets) {
          let outer: number, inner: number;
          if (edge === 'top') { outer = minY - TRAFFIC_EDGE_BUFFER_TILES; inner = minY - 1; }
          else if (edge === 'bottom') { outer = maxY + TRAFFIC_EDGE_BUFFER_TILES; inner = maxY + 1; }
          else if (edge === 'left') { outer = minX - TRAFFIC_EDGE_BUFFER_TILES; inner = minX - 1; }
          else { outer = maxX + TRAFFIC_EDGE_BUFFER_TILES; inner = maxX + 1; }
          let alongCoordinate = minY + offset;
          if (edge === 'top' || edge === 'bottom') alongCoordinate = minX + offset;
          let step = -1;
          if (outer <= inner) step = 1;
          for (let inward = outer; inward !== inner + step; inward += step) {
            let mapX = inward;
            let mapY = alongCoordinate;
            if (edge === 'top' || edge === 'bottom') {
              mapX = alongCoordinate;
              mapY = inward;
            }
            for (const candidate of this.nodesAt(mapX, mapY, z)) {
              for (const road of this.roadRun(candidate.index, direction)) {
                const key = `${road.nodeIndex}:${road.direction}`;
                if (!seen.has(key)) { seen.add(key); result.push({ ...road, edge }); }
              }
            }
          }
        }
      }
    }
    return result;
  }

  private selectTrafficModel(seed: number) {
    return this.trafficModelPool[hash(seed) % this.trafficModelPool.length]!;
  }

  private makeParkedVehicle(id: number, nodeIndex: number, model: number, nextIndex: number): TrafficState {
    const node = this.nodeById.get(nodeIndex), next = this.nodeById.get(nextIndex);
    if (!node || !next) throw new Error(`Traffic spawn references missing road node ${nodeIndex} -> ${nextIndex}`);
    const direction = directionFor(node, next);
    const spawn = lanePoint(node, direction);
    const carInfo = this.info.get(model);
    const state: TrafficState = {
      id,
      x: spawn.x,
      y: spawn.y,
      z: node.z,
      rotation: headingFor(direction),
      speed: 0,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
      throttle: 0,
      brakePressure: 1,
      handbrakeForce: 0,
      color: 0x9b9b9b,
      health: 100,
      damage: 0,
      damageLevel: 0,
      damagePhase: 'new',
      model, paint: 0,
      brakeLights: false, headlights: false, emergencyLights: Boolean(this.info.get(model)?.infoFlags.emergencyLights || this.info.get(model)?.infoFlags.roofLights), horn: false, doors: 0,
      routeNode: nodeIndex, passengers: [], occupants: [], doorStates: [], targetNode: nextIndex,
      aiActive: true, aiMode: 'ordinary', aiTask: 'follow-road', allowSpecialRoute: false,
      currentDirection: trafficDirection(direction), targetDirection: trafficDirection(direction), plannedTurn: 'none',
      laneTarget: 0, laneAlignment: 'center', arrowCursor: nodeIndex, arrowRun: 1,
    };
    if (isBusModel(model)) state.transport = 'bus';
    else if (isTrainModel(model)) state.transport = 'train';
    if (carInfo?.remaps.length) state.paint = id % carInfo.remaps.length;
    return state;
  }

  /** Spawn at most one source-style traffic car for the current camera. */
  spawnAround(x: number, y: number, startId: number, occupied: readonly { x: number; y: number; z: number }[] = [], tick = 0, z = 0): TrafficState[] {
    if (this.spawnedIds.size >= RECYCLED_TRAFFIC_LIMIT || !this.models.length) return [];
    const candidates = this.cameraEdgeRoads(x, y, z, startId + tick * 31);
    const bounds = cameraTileBounds(x, y);
    const outside = (index: number) => {
      const node = this.nodeById.get(index);
      return Boolean(node && (node.x < bounds.minX - TRAFFIC_SPAWN_MARGIN_TILES || node.x > bounds.maxX + TRAFFIC_SPAWN_MARGIN_TILES
        || node.y < bounds.minY - TRAFFIC_SPAWN_MARGIN_TILES || node.y > bounds.maxY + TRAFFIC_SPAWN_MARGIN_TILES));
    };
    for (const candidate of candidates) {
      const model = this.selectTrafficModel(startId + tick * 31 + candidate.nodeIndex);
      const physics = this.physics.get(model);
      const maxSpeed = physics?.maxSpeed ?? 0;
      const speedBands = WORLD.traffic.gciSpeedBands;
      let speedKind = 0;
      if (maxSpeed >= speedBands.medium[0]) speedKind = 1;
      if (maxSpeed >= speedBands.fast[0]) speedKind = 2;
      const random = hash(startId * 13 + tick * 7 + candidate.nodeIndex) % 100;
      // GetRandomTrafficSpeed_583750 chooses front/middle/back positions from
      // the same five-tile run according to the car's speed band.
      // A run can point inward from the edge. Filter the source position
      // choices before selecting one so the chosen chassis centre never
      // crosses into the camera rectangle on its first frame.
      const outsideRun = candidate.run.filter(outside);
      if (!outsideRun.length) continue;
      let runOffset = outsideRun.length - 1;
      if (speedKind === 2 && random > 2) {
        if (random > 33) runOffset = 0;
        else runOffset = Math.floor(outsideRun.length / 2);
      } else if (speedKind === 1 && random > 1) {
        runOffset = Math.floor(outsideRun.length / 2);
      }
      const nodeIndex = outsideRun[Math.max(0, Math.min(outsideRun.length - 1, runOffset))];
      if (nodeIndex === undefined) continue;
      const spawnNode = this.nodeById.get(nodeIndex);
      if (!spawnNode) continue;
      const nextNode = this.nodeAt(spawnNode.x + directionVector[candidate.direction].dx, spawnNode.y + directionVector[candidate.direction].dy, spawnNode.z);
      if (!nextNode) continue;
      const state = this.makeParkedVehicle(startId, nodeIndex, model, nextNode.index);
      const forward = directionFromRotation(state.rotation);
      const modelInfo = this.info.get(model);
      const halfLength = tileToWorld(Math.max(1.1, (modelInfo?.height ?? 128) / 64 / 2));
      const halfWidth = tileToWorld(Math.max(.45, (modelInfo?.width ?? 64) / 64 / 2));
      const tooClose = occupied.some(other => other.z === state.z && Math.hypot(other.x - state.x, other.y - state.y) < tileToWorld(2.5));
      if (tooClose) continue;
      // The final source rectangle test is represented by a swept, oriented
      // footprint. A rejected candidate is discarded and the edge search can
      // continue to the next authored road run.
      const blocked = occupied.some(other => {
        const dx = other.x - state.x, dy = other.y - state.y;
        const along = dx * forward.x + dy * forward.y;
        const across = Math.abs(dx * forward.y - dy * forward.x);
        return Math.abs(along) < halfLength && across < halfWidth;
      });
      if (blocked) continue;
      this.spawnedIds.add(state.id);
      return [state];
    }
    return [];
  }

  remove(id: number) { this.spawnedIds.delete(id); }

  private zoneContains(zone: { x: number; y: number; w: number; h: number }, vehicle: TrafficState) {
    const x = Math.round(vehicle.x / WORLD.tileSize), y = Math.round(-vehicle.y / WORLD.tileSize);
    return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
  }

  /** Compute one deterministic AI control packet for an unoccupied chassis. */
  controlFor(vehicle: TrafficState, traffic: readonly TrafficState[], tick: number, actors: readonly { id: string; x: number; y: number; z: number }[] = []): VehicleControl {
    if (vehicle.wrecked || vehicle.aiState === 'wrecked') return { throttle: 0, steer: 0, brake: true, ai: true };
    const pursuit = vehicle.pursuitTarget === undefined ? undefined : actors.find(actor => actor.id === vehicle.pursuitTarget && Math.abs(actor.z - vehicle.z) <= WORLD.interaction.sameFloor);
    if (vehicle.pursuitTarget !== undefined && !pursuit) delete vehicle.pursuitTarget;
    if (vehicle.aiActive === false) return { throttle: 0, steer: 0, brake: true, ai: true };
    vehicle.aiActive = true;
    if (vehicle.aiMode === undefined || vehicle.aiMode === 'inactive') vehicle.aiMode = pursuit ? 'chase' : vehicle.transport ? 'service' : 'ordinary';
    if (vehicle.aiTask === undefined || vehicle.aiTask === 'none') vehicle.aiTask = pursuit ? 'chase' : vehicle.transport ? 'service' : 'follow-road';
    const allowSpecial = vehicle.allowSpecialRoute ?? (pursuit !== undefined || vehicle.aiMode === 'chase' || vehicle.aiMode === 'emergency' || Boolean(vehicle.emergencyLights));
    vehicle.allowSpecialRoute = allowSpecial;
    const mapX = Math.round(vehicle.x / WORLD.tileSize), mapY = Math.round(-vehicle.y / WORLD.tileSize);
    const currentEntry = this.nodesAt(mapX, mapY, vehicle.z)[0];
    vehicle.offRoadTimer = currentEntry ? 0 : (vehicle.offRoadTimer ?? 0) + 1;
    const storedRoute = this.nodeById.get(vehicle.routeNode ?? -1);
    let route = currentEntry?.node;
    if (!route && storedRoute && Math.hypot(vehicle.x - tileToWorld(storedRoute.x), vehicle.y + tileToWorld(storedRoute.y)) < tileToWorld(1.25)) route = storedRoute;
    if (currentEntry && (!route || Math.hypot(vehicle.x - tileToWorld(route.x), vehicle.y + tileToWorld(route.y)) < tileToWorld(1.25))) {
      route = currentEntry.node;
      vehicle.routeNode = currentEntry.index;
    }

    // A car that has left the arrow network must first recover a nearby road;
    // aiming at an arbitrary graph node makes the original AI orbit forever.
    if (!route) {
      const nearby = [...this.nodeById.entries()]
        .map(([index, node]) => ({ index, node, distance: Math.hypot(node.x - mapX, node.y - mapY) }))
        .filter(item => item.distance <= 2.5 && this.isFlatRoad(item.node))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearby) { route = nearby.node; vehicle.routeNode = nearby.index; }
    }
    if (!route) {
      vehicle.aiState = 'stuck'; vehicle.brakeLights = true;
      return { throttle: 0, steer: 0, brake: true, handbrake: true, ai: true };
    }

    const currentDirection = cardinalFromRotation(vehicle.rotation);
    vehicle.currentDirection = trafficDirection(currentDirection);
    const candidateIds = [...route.next, ...(allowSpecial ? route.specialNext : [])]
      .filter(index => this.nodeById.has(index));
    let target = this.nodeById.get(vehicle.targetNode ?? -1);

    const taskDriven = vehicle.aiMode === 'scripted' || vehicle.aiMode === 'chase' || vehicle.aiMode === 'emergency'
      || vehicle.aiTask === 'route' || vehicle.aiTask === 'goto' || vehicle.aiTask === 'chase';
    if (!currentEntry && (vehicle.offRoadTimer ?? 0) > 200 && !taskDriven) {
      vehicle.aiTask = 'abandoned'; vehicle.aiState = 'stuck'; vehicle.brakeLights = true;
      return { throttle: 0, steer: 0, brake: true, handbrake: true, ai: true };
    }
    const routeDestination = pursuit
      ? { x: Math.round(pursuit.x / WORLD.tileSize), y: Math.round(-pursuit.y / WORLD.tileSize), z: vehicle.z }
      : target ? { x: target.x, y: target.y, z: target.z } : undefined;
    const plannedRoute = taskDriven && routeDestination ? this.routeFor(vehicle, route, routeDestination, allowSpecial) : undefined;
    if (plannedRoute?.firstArrow) {
      target = plannedRoute.firstArrow.node;
      vehicle.targetNode = plannedRoute.firstArrow.index;
      vehicle.arrowCursor = plannedRoute.firstArrow.index;
      vehicle.targetDirection = trafficDirection(plannedRoute.firstArrow.direction);
    }
    if (!plannedRoute?.firstArrow && (!target || !candidateIds.includes(vehicle.targetNode ?? -1))) {
      const candidates = candidateIds
        .map(index => this.nodeById.get(index))
        .filter((node): node is RoadNode => node !== undefined)
        .map(node => ({ node, turn: turnDirection(currentDirection, directionFor(route!, node)) }))
        .filter(item => item.turn !== 'reverse');
      const usable = candidates.length ? candidates : candidateIds.map(index => this.nodeById.get(index)).filter((node): node is RoadNode => node !== undefined);
      if (usable.length) {
        // Prefer straight travel on a continuous road; at a junction choose a
        // deterministic turn from the remaining authored arrows.
        const straight = usable.filter(item => 'node' in item && turnDirection(currentDirection, directionFor(route!, item.node)) === 'straight');
        const pool = straight.length ? straight : usable;
        const selected = pool[hash(vehicle.id * 31 + tick + route.x * 7 + route.y) % pool.length]!;
        target = 'node' in selected ? selected.node : selected;
        vehicle.targetNode = this.nodeIndex(target);
      }
    }
    if (!target) {
      vehicle.aiState = 'stuck'; vehicle.brakeLights = true;
      return { throttle: 0, steer: 0, brake: true, handbrake: true, ai: true };
    }

    const targetDirection = directionFor(route, target);
    vehicle.targetDirection = trafficDirection(targetDirection);
    vehicle.plannedTurn = trafficTurn(currentDirection, targetDirection);
    vehicle.arrowRun = this.arrowRun(route, targetDirection, allowSpecial);
    vehicle.arrowCursor = this.nodeIndex(route) ?? vehicle.arrowCursor;
    vehicle.laneTarget = 0;
    const laneCoordinate = targetDirection === 'up' || targetDirection === 'down' ? -vehicle.y / WORLD.tileSize : vehicle.x / WORLD.tileSize;
    const laneFraction = ((laneCoordinate % 1) + 1) % 1;
    const laneCenter = laneFraction > .4 && laneFraction < .6;
    vehicle.laneAlignment = laneCenter ? 'center' : laneFraction < .5 ? 'left' : 'right';
    const targetPoint = lanePoint(target, targetDirection);
    const useDirectPursuit = pursuit !== undefined && plannedRoute === undefined;
    const targetX = useDirectPursuit ? pursuit.x : targetPoint.x, targetY = useDirectPursuit ? pursuit.y : targetPoint.y;
    let distance = Math.hypot(targetX - vehicle.x, targetY - vehicle.y);
    if (!pursuit && distance < tileToWorld(.7)) {
      vehicle.routeNode = vehicle.targetNode;
      if (plannedRoute) vehicle.routeCursor = Math.min(plannedRoute.junctions.length - 1, (vehicle.routeCursor ?? 0) + 1);
      route = target;
      const nextIds = [...route.next, ...(allowSpecial ? route.specialNext : [])].filter(index => this.nodeById.has(index));
      const nextNodes = nextIds.map(index => this.nodeById.get(index)).filter((node): node is RoadNode => node !== undefined);
      const forwardNodes = nextNodes.filter(node => turnDirection(targetDirection, directionFor(route!, node)) !== 'reverse');
      const next = (forwardNodes.length ? forwardNodes : nextNodes)[hash(vehicle.id * 31 + tick) % (forwardNodes.length ? forwardNodes.length : nextNodes.length)];
      if (next) { target = next; vehicle.targetNode = this.nodeIndex(next); }
      distance = Math.hypot(tileToWorld(target.x) - vehicle.x, -tileToWorld(target.y) - vehicle.y);
    }

    const desired = rotationFromDirection(targetX - vehicle.x, targetY - vehicle.y, vehicle.rotation);
    // `normalizeRotation` returns an unsigned [0, 2π) angle. Traffic needs
    // the signed shortest turn; treating a left turn as 5.8 radians made
    // every car steer right until it orbited its road target.
    const rawDelta = desired - vehicle.rotation;
    const delta = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta));
    const steer = Math.max(-1, Math.min(1, delta * 2.5));
    const forward = directionFromRotation(vehicle.rotation);
    const currentSpeed = Math.max(0, vehicle.vx * forward.x + vehicle.vy * forward.y);
    const authoredPhysics = vehicle.model === undefined ? undefined : this.physics.get(vehicle.model);
    const authoredSpeed = vehicleForwardSpeed(authoredPhysics);
    let targetSpeed = trafficCruiseSpeedFor(vehicle.id, authoredPhysics);
    if (!Number.isFinite(targetSpeed) || targetSpeed <= 0) targetSpeed = authoredSpeed * .78;
    if (vehicle.transport === 'bus') targetSpeed *= .62;
    if (pursuit) targetSpeed = Math.max(targetSpeed, authoredSpeed * .9);
    let brake = false;
    let handbrake = false;
    let state: TrafficState['aiState'] = Math.abs(delta) > .28 ? 'turn' : 'cruise';
    const obstacleScan = scanTrafficObstacles({
      vehicle,
      nearbyCars: traffic,
      nearbyActors: actors,
      arrowBlockerZones: this.level.traffic.arrowBlockerZones,
      forward,
    });
    const ahead = obstacleScan.nearestSlowerOrBlockedCar ?? obstacleScan.nearestCarAhead;
    if (ahead) {
      const aheadCar = traffic.find(other => other.id === ahead.id);
      if (aheadCar) targetSpeed = Math.min(targetSpeed, Math.max(0, aheadCar.speed - 20));
      if (obstacleScan.shouldBrake) { brake = true; state = obstacleScan.shouldYield ? 'yield' : 'brake'; }
      if (obstacleScan.shouldHandbrake) handbrake = true;
    }
    if (!pursuit && obstacleScan.nearestActorAhead) {
      targetSpeed = 0; brake = true; state = 'yield';
      if (obstacleScan.shouldHandbrake) handbrake = true;
    }
    const light = pursuit ? undefined : this.trafficLights.zoneAt(Math.round(target.x), Math.round(target.y));
    if (light) {
      const signal = this.trafficLights.signal(light, targetDirection as TrafficApproachDirection, tick);
      vehicle.signal = signal;
      if (signal === 'red' && distance < tileToWorld(1.75)) { targetSpeed = 0; brake = true; state = 'yield'; handbrake = distance < tileToWorld(.8); }
    } else vehicle.signal = 'none';
    if (obstacleScan.arrowBlockerAhead && obstacleScan.arrowBlocker?.near) { targetSpeed = 0; brake = true; state = 'yield'; }
    if (obstacleScan.sideLaneOccupied && vehicle.laneAlignment !== 'center') vehicle.laneAlignment = 'unknown';
    if (vehicle.transport === 'bus' || vehicle.transport === 'train') {
      const serviceZones = vehicle.transport === 'bus' ? this.level.traffic.busStopZones : this.level.zones.filter(zone => zone.typeName === 'railway-stop' || zone.typeName === 'railway-platform');
      const stop = serviceZones.find(zone => this.zoneContains(zone, { ...vehicle, x: targetX, y: targetY }));
      if (stop && distance < tileToWorld(1.1)) { vehicle.serviceStop = stop.x * 4096 + stop.y; targetSpeed = 0; brake = true; state = 'yield'; }
      else if (vehicle.serviceStop !== undefined) delete vehicle.serviceStop;
    }
    const sourceMaximum = authoredPhysics?.maxSpeed ?? 0;
    vehicle.speedClass = sourceMaximum >= WORLD.traffic.gciSpeedBands.fast[0]
      ? 'fast' : sourceMaximum >= WORLD.traffic.gciSpeedBands.medium[0] ? 'medium' : 'slow';
    vehicle.targetSpeed = Math.max(0, targetSpeed);
    vehicle.obstacleTimer = brake ? (vehicle.obstacleTimer ?? 0) + 1 : Math.max(0, (vehicle.obstacleTimer ?? 0) - 1);
    vehicle.yieldTimer = state === 'yield' ? (vehicle.yieldTimer ?? 0) + 1 : Math.max(0, (vehicle.yieldTimer ?? 0) - 1);
    vehicle.aiState = state;
    vehicle.brakeLights = brake || currentSpeed > targetSpeed + 12;
    vehicle.headlights = vehicle.headlights || Boolean(vehicle.transport);
    const throttle = brake || currentSpeed > targetSpeed ? 0 : Math.max(.2, Math.min(1, (targetSpeed - currentSpeed) / 80));
    return { throttle, steer, brake: brake || currentSpeed > targetSpeed + 20, handbrake, ai: true };
  }

  private nodeIndex(node: RoadNode) {
    for (const [index, candidate] of this.nodeById) if (candidate === node) return index;
    return undefined;
  }

  private arrowRun(node: RoadNode, direction: Direction, allowSpecial: boolean) {
    const vector = directionVector[direction];
    let count = 0;
    for (let offset = 0; offset < 64; offset++) {
      const candidate = this.nodeAt(node.x + vector.dx * offset, node.y + vector.dy * offset, node.z);
      if (!candidate || !this.isFlatRoad(candidate.node) || !(arrowAllows(candidate.node.green, direction) || (allowSpecial && arrowAllows(candidate.node.red, direction)))) break;
      count++;
    }
    return count;
  }

  private routeFor(vehicle: TrafficState, start: RoadNode, destination: { x: number; y: number; z: number }, allowSpecial: boolean) {
    const existing = vehicle.routeId === undefined ? undefined : this.routes.get(vehicle.routeId);
    if (existing) return existing;
    const mode = vehicle.aiMode === 'emergency' ? 'special' : allowSpecial ? 'green-or-red' : 'ordinary';
    const route = this.roadRouter.findRoute({ start, destination, mode });
    if (!route) return undefined;
    const routeId = Math.max(0, hash(vehicle.id * 7919 + start.x * 31 + start.y * 17 + destination.x * 13 + destination.y));
    this.routes.set(routeId, route);
    vehicle.routeId = routeId;
    vehicle.routeCursor = 0;
    return route;
  }

  private serviceModel(kind: 'bus' | 'train') {
    return this.models.find(model => {
      const info = this.info.get(model);
      if (kind === 'bus') return isBusModel(model) || Boolean(info?.infoFlags.roofLights && info.passengers >= 20);
      return isTrainModel(model) || Boolean(info?.infoFlags.trailer && info.doors.length === 0 && info.passengers === 0 && info.height >= 96);
    });
  }

  /** Spawn one service vehicle at an authored stop/entry when a map exposes
   * public-transport zones. The route still uses the shared road cursor, so
   * it remains safe in compact maps that omit a separate rail graph. */
  spawnServiceVehicle(kind: 'bus' | 'train', id: number, tick: number, z = 0): TrafficState[] {
    const model = this.serviceModel(kind);
    const zones = kind === 'bus' ? this.level.traffic.busStopZones : this.level.zones.filter(zone => zone.typeName === 'railway-entry' || zone.typeName === 'railway-platform');
    if (model === undefined || !zones.length || this.spawnedIds.size >= RECYCLED_TRAFFIC_LIMIT) return [];
    const zone = zones[(hash(id + tick * 13) % zones.length)]!;
    const centerX = zone.x + zone.w / 2, centerY = zone.y + zone.h / 2;
    const candidates = [...this.nodeById.entries()].sort((a, b) => {
      const da = Math.hypot(a[1].x - centerX, a[1].y - centerY), db = Math.hypot(b[1].x - centerX, b[1].y - centerY);
      return da - db;
    });
    const entry = candidates.find(([, node]) => node.z === z && [...node.next, ...node.specialNext].some(index => this.nodeById.has(index)));
    if (!entry) return [];
    const [nodeIndex, node] = entry;
    const nextIndex = [...node.next, ...node.specialNext].find(index => this.nodeById.has(index));
    if (nextIndex === undefined) return [];
    const state = this.makeParkedVehicle(id, nodeIndex, model, nextIndex);
    state.transport = kind;
    state.aiMode = 'service'; state.aiTask = 'service';
    this.spawnedIds.add(state.id);
    return [state];
  }

}
