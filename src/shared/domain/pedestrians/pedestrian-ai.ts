import type { NpcState, PedestrianPathGoal, PlayerState, TrafficState } from '../../protocol/types';
import { isVehicleWeapon, WeaponId } from '../combat/weapons';
import { directionFromRotation, normalizeRotation, rotationFromDirection, sourceAngleToRadians } from '../physics/motion-vector';
import { GTA2GroundType } from '../world/gta2-enums';
import { sourceFixedRawPerTickToWorld, WORLD } from '../world/world';
import { PedestrianNavigation, type PedestrianNavNode } from './pedestrian-navigation';
import { PED_DEATH_ANIMATION_TICKS } from '../animation';

const PATH_REACH_DISTANCE = 14;
const PATH_REPLAN_DISTANCE = WORLD.tileSize * 1.5;
/** Char_B4::GetNextRotationToward_550F60 turn limits, in source Ang16 units. */
const PEDESTRIAN_WALK_TURN_ANG16 = 96;
const PEDESTRIAN_RUN_TURN_ANG16 = 48;
/** Char_B4 switches from the walking turn limit to the running turn limit
 * above the 2 * 256 raw Fix16 collision-repulsion speed. */
const PEDESTRIAN_RUN_TURN_SPEED = sourceFixedRawPerTickToWorld(0x200);
/** Source Threat_Reaction_AI uses a four-tile max-axis search for a nearby
 * threatening ped, then lets the flee objective run until six tiles away. */
const CIVILIAN_SCARE_RADIUS = WORLD.tileSize * 4;
const CIVILIAN_SAFE_RADIUS = WORLD.tileSize * 6;
/** CarPhysics_B0::FastCarMinVelocity_6FE1CC (Fix16(0x1EB, 0)). */
const FAST_CAR_MIN_SPEED = sourceFixedRawPerTickToWorld(0x1eb);
const KNOCKDOWN_TICKS = 34;
const CIVILIAN_BLOCKED_WAIT_TICKS = 30;
const PEDESTRIAN_RADIUS = 12;
/** Replan a flee objective after half a second without getting closer. */
const FLEE_REPLAN_TICKS = 15;
const FLEE_PROGRESS_EPSILON = .25;
/** Ang16(64), used to retry a blocked car heading. */
const OBSTACLE_RETRY_TURN = Math.PI * 2 * 64 / 2048;

export interface PedestrianVehicleBounds {
  readonly width: number;
  readonly height: number;
}

interface PedestrianAvoidanceContext {
  readonly vehicles: readonly TrafficState[];
  readonly vehicleBounds: (vehicle: TrafficState) => PedestrianVehicleBounds;
}

interface ActiveAvoidance {
  readonly blockerKey: string;
  readonly rotation: number;
}

interface FleeProgress {
  readonly threatId: string;
  readonly goalId: number;
  bestDistance: number;
  stalledTicks: number;
}

const activeAvoidances = new WeakMap<NpcState, ActiveAvoidance>();
const fleeProgress = new WeakMap<NpcState, FleeProgress>();

export interface PedestrianAiContext {
  readonly npcs: Iterable<NpcState>;
  readonly players: Iterable<PlayerState>;
  readonly navigation: PedestrianNavigation;
  /** Vehicles are optional for small, isolated AI tests and preview worlds. */
  readonly traffic?: Iterable<TrafficState>;
  readonly vehicleBounds?: (vehicle: TrafficState) => PedestrianVehicleBounds;
  readonly vehicleCanJumpOver?: (vehicle: TrafficState) => boolean;
  readonly dt: number;
  readonly tick: number;
}

function startJumpOver(npc: NpcState, vehicle: TrafficState) {
  if (npc.jump || npc.vehicleId !== undefined || npc.health <= 0) return false;
  let vx = vehicle.vx, vy = vehicle.vy;
  if (Math.hypot(vx, vy) < 1e-3) { vx = npc.x - vehicle.x; vy = npc.y - vehicle.y; }
  const length = Math.hypot(vx, vy);
  if (length < 1e-3) return false;
  const speed = Math.max(WORLD.player.jumpSpeed, length);
  npc.jump = { phase: 'rising', progress: 0, height: 0, baseZ: Math.max(npc.z, vehicle.z), vx: vx / length * speed, vy: vy / length * speed, vehicleCollision: false };
  npc.z = npc.jump.baseZ;
  npc.vx = npc.jump.vx; npc.vy = npc.jump.vy;
  npc.rotation = rotationFromDirection(npc.vx, npc.vy, npc.rotation);
  npc.state = 'walk'; npc.animation = 'jumping';
  return true;
}

interface PathStep {
  readonly point: { x: number; y: number; z: number };
  readonly node?: PedestrianNavNode;
  readonly reached: boolean;
}

type PathResult = PathStep[];

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hash(seed: number) {
  let value = seed | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}

function threatFor(player: PlayerState) {
  return player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact);
}

function activePlayer(player: PlayerState) {
  return player.combat.respawn <= 0 && player.combat.health > 0;
}

/**
 * CarPhysics_B0 only adds the driver to the source's threatening-ped list when
 * the car is moving fast enough or its horn is sounding, and only when the car
 * is on pavement or field. A road is deliberately excluded: normal driving
 * on a road must not make nearby civilians flee.
 */
function fastCarThreatFor(player: PlayerState, traffic: readonly TrafficState[], navigation: PedestrianNavigation) {
  if (player.vehicleId === undefined) return false;
  const vehicle = traffic.find(item => item.id === player.vehicleId);
  if (!vehicle) return false;
  const groundType = navigation.groundTypeAt(vehicle);
  if (groundType !== GTA2GroundType.Pavement && groundType !== GTA2GroundType.Field) return false;
  const speed = Math.max(Math.abs(vehicle.speed), Math.hypot(vehicle.vx, vehicle.vy));
  return speed > FAST_CAR_MIN_SPEED || vehicle.horn === true;
}

/**
 * This is the browser equivalent of the source's selected weapon/car check in
 * Threat_Reaction_AI. A civilian reacts to a visible weapon before the first
 * bullet is fired; a car is a threat only when the source fast-car reaction
 * has added its driver to the threatening-ped list. Empty weapon slots and
 * vehicle weapons carried on foot are not visible threats.
 */
function civilianThreatFor(player: PlayerState, traffic: readonly TrafficState[], navigation: PedestrianNavigation) {
  if (!activePlayer(player)) return false;
  if (player.vehicleId !== undefined) return fastCarThreatFor(player, traffic, navigation) || threatFor(player);
  if (threatFor(player)) return true;
  const combat = player.combat;
  const weapon = combat.weapon;
  if (weapon === WeaponId.None) return false;
  return (combat.ammo[weapon] ?? 0) > 0 && !isVehicleWeapon(weapon);
}

function maxAxisDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function nearestCivilianThreat(npc: NpcState, players: readonly PlayerState[], traffic: readonly TrafficState[], navigation: PedestrianNavigation): PlayerState | undefined {
  let selected: PlayerState | undefined;
  let selectedDistance = CIVILIAN_SCARE_RADIUS;
  for (const player of players) {
    if (!civilianThreatFor(player, traffic, navigation) || Math.abs(player.z - npc.z) > 1.05) continue;
    const currentDistance = maxAxisDistance(npc, player);
    if (currentDistance < selectedDistance) {
      selected = player;
      selectedDistance = currentDistance;
    }
  }
  return selected;
}

function activeCivilianThreat(npc: NpcState, players: readonly PlayerState[], traffic: readonly TrafficState[], navigation: PedestrianNavigation): PlayerState | undefined {
  // FleeCharOnFootTillSafe keeps the original target until the ped is safe;
  // it does not immediately forget the threat when the weapon is lowered.
  if (npc.state === 'flee' && npc.target !== undefined) {
    const target = players.find(player => player.id === npc.target);
    if (target && activePlayer(target) && maxAxisDistance(npc, target) <= CIVILIAN_SAFE_RADIUS) return target;
  }
  return nearestCivilianThreat(npc, players, traffic, navigation);
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nodePoint(node: PedestrianNavNode): PedestrianPathGoal {
  return { x: node.worldX, y: node.worldY, z: node.height, nodeId: node.id };
}

function goalMatches(current: PedestrianPathGoal | undefined, next: PedestrianPathGoal) {
  if (!current) return false;
  if (current.nodeId !== undefined || next.nodeId !== undefined) return current.nodeId === next.nodeId;
  return pointDistance(current, next) <= PATH_REPLAN_DISTANCE && Math.abs(current.z - next.z) <= 1.05;
}

/** Clear the source-style temporary path after its objective is complete. */
function clearPath(npc: NpcState) {
  npc.path = undefined;
  npc.pathPointIndex = undefined;
  npc.pathIndex = undefined;
  npc.pathGoal = undefined;
  npc.crossingRoad = false;
  fleeProgress.delete(npc);
}

/**
 * Follow the path already stored on the ped. The original keeps a bounded
 * temporary point array on the ped and advances a pointer through it; it does
 * not ask the renderer (or a fresh random walk) to invent a route each frame.
 */
function followPath(npc: NpcState, navigation: PedestrianNavigation): PathResult {
  const path = npc.path;
  const goal = npc.pathGoal;
  if (!path?.length || !goal) return [];

  let pointIndex = Math.max(0, Math.min(npc.pathPointIndex ?? 0, path.length));
  while (pointIndex < path.length) {
    const node = navigation.node(path[pointIndex]!);
    if (!node) {
      pointIndex += 1;
      continue;
    }
    if (pointDistance(npc, { x: node.worldX, y: node.worldY }) <= PATH_REACH_DISTANCE) {
      pointIndex += 1;
      continue;
    }
    npc.pathPointIndex = pointIndex;
    npc.pathIndex = node.id;
    return [{ point: { x: node.worldX, y: node.worldY, z: node.height }, node, reached: false }];
  }

  npc.pathPointIndex = path.length;
  npc.pathIndex = path[path.length - 1];
  const lastNode = navigation.node(path[path.length - 1]!);
  // A target can be an arbitrary world coordinate (for example, a player on
  // a boat or in water). The source path ends on the nearest legal map node;
  // never continue the final approach into an AIR column.
  if (!navigation.isNonAirAt(goal)) {
    if (!lastNode) return [];
    const point = { x: lastNode.worldX, y: lastNode.worldY, z: lastNode.height };
    return [{ point, node: lastNode, reached: pointDistance(npc, point) <= PATH_REACH_DISTANCE }];
  }
  if (pointDistance(npc, goal) <= PATH_REACH_DISTANCE) return [{ point: goal, reached: true }];
  // A path ends at the nearest walkable node. The final short approach is to
  // the actual objective coordinate, just as the original movement code keeps
  // using its target fields after the path point list is exhausted.
  return [{ point: goal, reached: false }];
}

/** Compute a temporary path only when the current objective changes or ends. */
function pathToGoal(npc: NpcState, navigation: PedestrianNavigation, goal: PedestrianPathGoal, avoidRoads = false): PathResult {
  const currentPathActive = Boolean(npc.path?.length && npc.pathPointIndex !== undefined);
  if (currentPathActive && goalMatches(npc.pathGoal, goal)) return followPath(npc, navigation);

  const path = navigation.findPath({ x: npc.x, y: npc.y, z: npc.z }, goal, { avoidRoads });
  if (!path.length) {
    clearPath(npc);
    return [];
  }
  npc.path = path;
  // findPath includes the nearest current node. The movement pointer starts at
  // the next point, matching field_18C_current_path_point in the source.
  npc.pathPointIndex = 0;
  if (path.length > 1) npc.pathPointIndex = 1;
  npc.pathIndex = path[npc.pathPointIndex] ?? path[path.length - 1];
  npc.pathGoal = { ...goal };
  return followPath(npc, navigation);
}

function shortestRotationDelta(from: number, to: number) {
  let delta = normalizeRotation(to - from);
  if (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

/**
 * Char_B4 turns its heading independently from its scalar movement speed.
 * Keep the per-source-tick limit explicit, then scale it for callers that use
 * a variable-duration update rather than the normal 30 Hz fixed step.
 */
function turnToward(current: number, target: number, speed: number, dt: number) {
  let sourceTurn = PEDESTRIAN_WALK_TURN_ANG16;
  if (speed > PEDESTRIAN_RUN_TURN_SPEED) sourceTurn = PEDESTRIAN_RUN_TURN_ANG16;
  const maxTurn = sourceAngleToRadians(sourceTurn) * WORLD.tickRate * Math.max(0, dt);
  const delta = shortestRotationDelta(current, target);
  return normalizeRotation(current + Math.sign(delta) * Math.min(Math.abs(delta), maxTurn));
}

function sameFloor(a: { z: number; collisionLayer?: number | undefined }, b: { z: number; collisionLayer?: number | undefined }) {
  return Math.abs(a.z - b.z) <= WORLD.interaction.sameFloor &&
    (a.collisionLayer === undefined || b.collisionLayer === undefined || Math.abs(a.collisionLayer - b.collisionLayer) <= WORLD.interaction.sameFloor);
}

/**
 * The source Char_B4 collision pass queries cars without requiring them to be
 * stationary. Every pedestrian movement state therefore sweeps against every
 * live chassis; whether the car is parked or moving does not change collision
 * avoidance.
 */
function isVehicleObstacle(vehicle: TrafficState) {
  return vehicle.health > 0 && !vehicle.wrecked;
}

function localCarPoint(point: { x: number; y: number }, vehicle: TrafficState) {
  const dx = point.x - vehicle.x, dy = point.y - vehicle.y;
  const right = { x: Math.cos(vehicle.rotation), y: Math.sin(vehicle.rotation) };
  const forward = directionFromRotation(vehicle.rotation);
  return { x: dx * right.x + dy * right.y, y: dx * forward.x + dy * forward.y };
}

function segmentIntersectsBox(from: { x: number; y: number }, to: { x: number; y: number }, halfWidth: number, halfHeight: number) {
  let near = 0, far = 1;
  const dx = to.x - from.x, dy = to.y - from.y;
  for (const [origin, delta, extent] of [[from.x, dx, halfWidth], [from.y, dy, halfHeight]] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < -extent || origin > extent) return false;
      continue;
    }
    let first = (-extent - origin) / delta, second = (extent - origin) / delta;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

function segmentHitsVehicle(from: { x: number; y: number }, to: { x: number; y: number }, vehicle: TrafficState, bounds: PedestrianVehicleBounds) {
  const start = localCarPoint(from, vehicle), end = localCarPoint(to, vehicle);
  const halfWidth = bounds.width * .5 + PEDESTRIAN_RADIUS;
  const halfHeight = bounds.height * .5 + PEDESTRIAN_RADIUS;
  const startInside = Math.abs(start.x) <= halfWidth && Math.abs(start.y) <= halfHeight;
  const endInside = Math.abs(end.x) <= halfWidth && Math.abs(end.y) <= halfHeight;
  // Let a ped escape a stale overlap, but never enter or cross the expanded
  // chassis footprint from a clear position.
  if (startInside && !endInside) return false;
  return segmentIntersectsBox(start, end, halfWidth, halfHeight);
}

type PedestrianBlocker =
  | { readonly kind: 'vehicle'; readonly vehicle: TrafficState; readonly bounds: PedestrianVehicleBounds };

type BlockerResult = PedestrianBlocker[];
type HeadingMove = { x: number; y: number; rotation: number; vx: number; vy: number };
type HeadingMoveResult = HeadingMove[];

function blockerKey(blocker: PedestrianBlocker) {
  return `vehicle:${blocker.vehicle.id}`;
}

function movementBlocker(npc: NpcState, from: { x: number; y: number }, to: { x: number; y: number }, context: PedestrianAvoidanceContext): BlockerResult {
  for (const vehicle of context.vehicles) {
    if (!isVehicleObstacle(vehicle) || !sameFloor(npc, vehicle)) continue;
    const bounds = context.vehicleBounds(vehicle);
    if (segmentHitsVehicle(from, to, vehicle, bounds)) return [{ kind: 'vehicle', vehicle, bounds } satisfies PedestrianBlocker];
  }
  return [];
}

/** Keep the selected side while the ped is still beside the same obstacle. */
function nearbyBlocker(npc: NpcState, context: PedestrianAvoidanceContext, key: string): BlockerResult {
  for (const vehicle of context.vehicles) {
    if (key !== `vehicle:${vehicle.id}` || !isVehicleObstacle(vehicle) || !sameFloor(npc, vehicle)) continue;
    const bounds = context.vehicleBounds(vehicle), local = localCarPoint(npc, vehicle);
    if (Math.abs(local.x) <= bounds.width * .5 + PEDESTRIAN_RADIUS + 10 && Math.abs(local.y) <= bounds.height * .5 + PEDESTRIAN_RADIUS + 10) {
      return [{ kind: 'vehicle', vehicle, bounds } satisfies PedestrianBlocker];
    }
  }
  return [];
}

function moveWithHeading(npc: NpcState, rotation: number, speed: number, dt: number, context: PedestrianAvoidanceContext): HeadingMoveResult {
  const heading = directionFromRotation(rotation);
  const next = { x: npc.x + heading.x * speed * dt, y: npc.y + heading.y * speed * dt };
  if (movementBlocker(npc, { x: npc.x, y: npc.y }, next, context).length) return [];
  return [{ ...next, rotation: normalizeRotation(rotation), vx: heading.x * speed, vy: heading.y * speed }];
}

function avoidanceMove(npc: NpcState, point: { x: number; y: number }, speed: number, dt: number, blocker: PedestrianBlocker, context: PedestrianAvoidanceContext, preferredRotation: number): HeadingMoveResult {
  const desiredRotation = rotationFromDirection(point.x - npc.x, point.y - npc.y, npc.rotation);
  const localPed = localCarPoint(npc, blocker.vehicle);
  const localTarget = localCarPoint(point, blocker.vehicle);
  const halfWidth = blocker.bounds.width * .5 + PEDESTRIAN_RADIUS;
  const halfHeight = blocker.bounds.height * .5 + PEDESTRIAN_RADIUS;
  // Walk along the long axis when the ped hit a side of the chassis, and
  // along the short/right axis when it hit the front or rear. This is the
  // source's "which side of the obstacle" calculation expressed in the
  // runtime's world-heading convention.
  const xInside = Math.abs(localPed.x) <= halfWidth, yInside = Math.abs(localPed.y) <= halfHeight;
  let alongForward = false;
  if (yInside) alongForward = true;
  else if (!xInside) alongForward = Math.abs(localPed.x) / halfWidth >= Math.abs(localPed.y) / halfHeight;
  let axisRotation = blocker.vehicle.rotation - Math.PI / 2;
  if (alongForward) axisRotation = blocker.vehicle.rotation;
  let targetCoordinate = localTarget.x;
  if (alongForward) targetCoordinate = localTarget.y;
  // Keep a stable side when the target is aligned with the car; using the
  // current coordinate here would make the ped oscillate on both sides of
  // the same parked chassis one update at a time.
  let sign = -1;
  if (npc.id & 1) sign = 1;
  if (Math.abs(targetCoordinate) > 1) sign = Math.sign(targetCoordinate);
  let firstAxisRotation = axisRotation;
  if (sign < 0) firstAxisRotation += Math.PI;
  let secondAxisRotation = axisRotation + Math.PI;
  if (sign < 0) secondAxisRotation = axisRotation;
  const rotations = [
    preferredRotation,
    firstAxisRotation,
    secondAxisRotation,
    desiredRotation + Math.PI,
    desiredRotation + Math.PI / 2,
  ];
  for (const rotation of rotations) {
    const result = moveWithHeading(npc, rotation, speed, dt, context);
    if (result.length) return result;
  }
  return [];
}

function skipBlockedPathPoint(npc: NpcState, node: PedestrianNavNode | undefined, blocker: PedestrianBlocker) {
  if (blocker.kind !== 'vehicle' || !node || !npc.path?.length || npc.pathPointIndex === undefined) return;
  if (npc.path[npc.pathPointIndex] !== node.id || npc.pathPointIndex + 1 >= npc.path.length) return;
  // A chassis can occupy the centre of a temporary graph waypoint.
  // The source keeps the objective but advances its temporary point cursor
  // after the local collision retry, instead of rebuilding the whole route.
  npc.pathPointIndex += 1;
  npc.pathIndex = npc.path[npc.pathPointIndex];
}

function moveToward(npc: NpcState, point: { x: number; y: number }, node: PedestrianNavNode | undefined, speed: number, dt: number, state: 'walk' | 'flee' | 'attack', avoidance?: PedestrianAvoidanceContext) {
  const dx = point.x - npc.x;
  const dy = point.y - npc.y;
  const length = Math.hypot(dx, dy);
  if (length <= PATH_REACH_DISTANCE) {
    npc.vx = 0;
    npc.vy = 0;
    return true;
  }
  const previousRotation = npc.rotation;
  const desiredRotation = rotationFromDirection(dx, dy, npc.rotation);
  // The source does not accelerate vx/vy toward a new vector here. It turns
  // the Char_B4 heading by a small, speed-dependent angle and then rebuilds
  // the planar velocity from the scalar walk/run speed.
  npc.rotation = turnToward(npc.rotation, desiredRotation, speed, dt);
  const heading = directionFromRotation(npc.rotation);
  npc.vx = heading.x * speed;
  npc.vy = heading.y * speed;
  // Road travel is a property of the active movement objective. It is not a
  // permanent classification of the civilian and is never set while idle.
  npc.crossingRoad = node?.isRoad ?? false;
  const intended = { x: npc.x + npc.vx * dt, y: npc.y + npc.vy * dt };
  if (avoidance) {
    const active = activeAvoidances.get(npc);
    let activeBlocker: BlockerResult = [];
    if (active) activeBlocker = nearbyBlocker(npc, avoidance, active.blockerKey);
    const blocker = movementBlocker(npc, { x: npc.x, y: npc.y }, intended, avoidance);
    if (active && activeBlocker.length && !blocker.length) {
      const continued = moveWithHeading(npc, active.rotation, speed, dt, avoidance);
      const continuedPose = continued[0];
      if (continuedPose) {
        npc.x = continuedPose.x;
        npc.y = continuedPose.y;
        npc.rotation = continuedPose.rotation;
        npc.vx = continuedPose.vx;
        npc.vy = continuedPose.vy;
        activeAvoidances.set(npc, { blockerKey: active.blockerKey, rotation: continuedPose.rotation });
        npc.state = state;
        npc.animation = movementAnimation(state);
        return false;
      }
    }
    if (blocker.length) {
      const currentBlocker = blocker[0]!;
      skipBlockedPathPoint(npc, node, currentBlocker);
      const avoided = avoidanceMove(npc, point, speed, dt, currentBlocker, avoidance, active?.rotation ?? previousRotation);
      const avoidedPose = avoided[0];
      if (avoidedPose) {
        npc.x = avoidedPose.x;
        npc.y = avoidedPose.y;
        npc.rotation = avoidedPose.rotation;
        npc.vx = avoidedPose.vx;
        npc.vy = avoidedPose.vy;
        activeAvoidances.set(npc, { blockerKey: blockerKey(currentBlocker), rotation: avoidedPose.rotation });
      } else {
        // The source keeps the saved pose when both side attempts remain
        // blocked. Rotate a small amount so the next update retries a new
        // local heading instead of sliding through the obstacle.
        npc.rotation = normalizeRotation(desiredRotation + OBSTACLE_RETRY_TURN);
        npc.vx = 0;
        npc.vy = 0;
        activeAvoidances.set(npc, { blockerKey: blockerKey(currentBlocker), rotation: npc.rotation });
      }
    } else {
      npc.x = intended.x;
      npc.y = intended.y;
      activeAvoidances.delete(npc);
    }
  } else {
    npc.x = intended.x;
    npc.y = intended.y;
  }
  npc.state = state;
  npc.animation = movementAnimation(state);
  return false;
}

function movementAnimation(state: 'walk' | 'flee' | 'attack'): NpcState['animation'] {
  if (state === 'attack') return 'armedRunning';
  if (state === 'flee') return 'running';
  return 'walking';
}

function stop(npc: NpcState, state: NpcState['state'], animation: NpcState['animation']) {
  npc.vx = 0;
  npc.vy = 0;
  npc.crossingRoad = false;
  npc.state = state;
  npc.animation = animation;
}

/**
 * The ordinary dummy does not receive a permanent patrol route in GTA2. Its
 * Char_B4 walking state advances one legal neighbouring tile at a time,
 * nudges its heading when the current tile is blocked, and occasionally
 * stops through the lower-level idle state machine. Keep that separate from
 * objective paths: a free stroll has no goal to expose in the debug overlay.
 */
function localCivilianTarget(npc: NpcState, navigation: PedestrianNavigation, tick: number): PedestrianNavNode[] {
  if ((npc.waitTimer ?? 0) > 0) {
    npc.waitTimer = Math.max(0, (npc.waitTimer ?? 0) - 1);
    return [];
  }

  if (!navigation.nodes.length) return [];
  let current: PedestrianNavNode;
  try {
    current = navigation.nearest({ x: npc.x, y: npc.y, z: npc.z });
  } catch {
    return [];
  }
  const heading = directionFromRotation(npc.rotation);
  const candidates = navigation.neighborsOf(current.id)
    // Char_B4's ordinary tile step is cardinal. Diagonal movement belongs to
    // the pathfinder's explicit objective handling, not free dummy walking.
    .filter(candidate => Math.abs(candidate.x - current.x) + Math.abs(candidate.y - current.y) === 1)
    .filter(candidate => candidate.isPavement);
  if (!candidates.length) {
    npc.waitTimer = CIVILIAN_BLOCKED_WAIT_TICKS;
    return [];
  }

  const selected = candidates
    .map(candidate => {
      const dx = candidate.worldX - current.worldX;
      const dy = candidate.worldY - current.worldY;
      const length = Math.hypot(dx, dy) || 1;
      const alignment = (dx / length) * heading.x + (dy / length) * heading.y;
      // Preserve the current direction whenever possible, while making equal
      // turns deterministic per ped rather than synchronising every civilian.
      const tieBreak = hash(npc.id * 131 + candidate.id * 977 + Math.floor(tick / 30)) % 100;
      return { candidate, score: alignment * 1000 + tieBreak };
    })
    .sort((a, b) => b.score - a.score)[0];
  if (!selected) return [];
  return [selected.candidate];
}

function localCivilianStep(npc: NpcState, navigation: PedestrianNavigation, tick: number): PathResult {
  const target = localCivilianTarget(npc, navigation, tick)[0];
  if (!target) return [];
  return [{ point: { x: target.worldX, y: target.worldY, z: target.height }, node: target, reached: false } satisfies PathStep];
}

/** Follow an explicitly authored patrol list, if one is supplied by a script. */
function patrolTarget(npc: NpcState, navigation: PedestrianNavigation): PathResult {
  const route = npc.patrolRoute;
  if (!route?.length) return [];
  const pointIndex = Math.min(Math.max(npc.patrolPointIndex ?? 0, 0), route.length - 1);
  const targetId = route[pointIndex];
  let target: PedestrianNavNode | undefined;
  if (targetId !== undefined) target = navigation.node(targetId);
  if (!target) throw new Error(`Pedestrian ${npc.id} references missing patrol node ${targetId}`);

  const step = pathToGoal(npc, navigation, nodePoint(target), true);
  const currentStep = step[0];
  if (!currentStep) return [];
  if (currentStep.reached) {
    npc.patrolPointIndex = pointIndex;
    if (route.length > 1) npc.patrolPointIndex = (pointIndex + 1) % route.length;
    clearPath(npc);
    return [];
  }
  return step;
}

function fleeTarget(npc: NpcState, threat: PlayerState, navigation: PedestrianNavigation, excludedGoalId?: number): PathResult {
  if (excludedGoalId === undefined && npc.state === 'flee' && npc.pathGoal && npc.path?.length) {
    const current = followPath(npc, navigation);
    if (current[0] && !current[0].reached) return current;
    clearPath(npc);
  }

  if (!navigation.nodes.length) return [];
  let origin: PedestrianNavNode;
  try {
    origin = navigation.nearest({ x: npc.x, y: npc.y, z: npc.z });
  } catch {
    return [];
  }
  const candidates = navigation.neighborsOf(origin.id);
  // The source PathFinder_2FD4 checks movement geometry and air/water
  // surfaces, but does not apply the ordinary civilian pavement restriction
  // to a flee objective. A fleeing ped may therefore cross a road to get
  // farther from the threat; only free wandering stays on pavement.
  if (!candidates.length) return pathToGoal(npc, navigation, nodePoint(origin), false);
  const safeCandidates = candidates.filter(candidate => candidate.groundType !== GTA2GroundType.Air && candidate.id !== excludedGoalId);
  if (!safeCandidates.length) return [];
  const rankedCandidates = safeCandidates.slice().sort((a, b) => {
    const distanceDelta = distance({ x: b.worldX, y: b.worldY }, threat) - distance({ x: a.worldX, y: a.worldY }, threat);
    return distanceDelta || a.id - b.id;
  });
  for (const candidate of rankedCandidates) {
    const step = pathToGoal(npc, navigation, nodePoint(candidate), false);
    if (step.length) return step;
  }
  return [];
}

function fleeGoalStalled(npc: NpcState, threat: PlayerState, goal: { x: number; y: number }, beforeDistance: number) {
  const goalId = npc.pathGoal?.nodeId;
  if (goalId === undefined) {
    fleeProgress.delete(npc);
    return false;
  }
  const afterDistance = pointDistance(npc, goal);
  let progress = fleeProgress.get(npc);
  if (!progress || progress.threatId !== threat.id || progress.goalId !== goalId) {
    progress = { threatId: threat.id, goalId, bestDistance: Math.min(beforeDistance, afterDistance), stalledTicks: 0 };
    fleeProgress.set(npc, progress);
    return false;
  }
  if (afterDistance + FLEE_PROGRESS_EPSILON < progress.bestDistance) {
    progress.bestDistance = afterDistance;
    progress.stalledTicks = 0;
    return false;
  }
  progress.stalledTicks += 1;
  return progress.stalledTicks >= FLEE_REPLAN_TICKS;
}

function recoverOrStop(npc: NpcState) {
  if (npc.drowningTimer !== undefined) {
    stop(npc, 'knockdown', 'idle');
    return true;
  }
  if (npc.health <= 0 || npc.state === 'dead') {
    npc.health = Math.max(0, npc.health);
    npc.target = undefined;
    npc.panicTimer = undefined;
    clearPath(npc);
    if (npc.deathTimer === undefined && !(npc.state === 'dead' && npc.animation === 'dead')) npc.deathTimer = PED_DEATH_ANIMATION_TICKS;
    // Keep the corpse inert while the source lethal-fall sequence plays. The
    // client receives this countdown in the snapshot, so remote peds do not
    // jump directly to the terminal dead pose.
    const deathTimer = npc.deathTimer ?? 0;
    if (deathTimer > 0) {
      npc.deathTimer = deathTimer - 1;
      stop(npc, 'dead', 'falling');
    } else {
      npc.deathTimer = undefined;
      stop(npc, 'dead', 'dead');
    }
    return true;
  }
  if (npc.shockCounter > 0) {
    npc.shockCounter = Math.max(0, npc.shockCounter - 1);
    stop(npc, 'panic', 'electrocuted');
    return true;
  }
  if (npc.animation === 'electrocuted') npc.animation = 'walking';
  if (npc.state === 'knockdown') {
    npc.panicTimer = Math.max(0, (npc.panicTimer ?? KNOCKDOWN_TICKS) - 1);
    stop(npc, 'knockdown', 'knockdown');
    if (npc.panicTimer > 0) return true;
    npc.panicTimer = undefined;
    npc.state = 'panic';
    npc.animation = 'walking';
    // Source peds recover into a short standing/idle interval before their
    // ordinary walking state resumes.
    npc.waitTimer = Math.max(npc.waitTimer ?? 0, CIVILIAN_BLOCKED_WAIT_TICKS);
  }
  return false;
}

function speedFor(running: boolean) {
  if (running) return sourceFixedRawPerTickToWorld(WORLD.player.source.runSpeed);
  return WORLD.traffic.civilianSpeed * WORLD.tileSize;
}

/**
 * Server-side pedestrian state machine. Explicit objectives use the bounded
 * temporary path stored on the NPC; an ordinary dummy with no objective uses
 * Char_B4-style local pavement walking instead of a generated patrol route.
 */
export function updatePedestrianAi(context: PedestrianAiContext) {
  const players = [...context.players];
  const npcs = [...context.npcs].sort((a, b) => a.id - b.id);
  const traffic = [...(context.traffic ?? [])];
  const avoidance: PedestrianAvoidanceContext = {
    vehicles: traffic,
    vehicleBounds: context.vehicleBounds ?? (() => ({ width: 36, height: 66 })),
  };
  const vehicleCanJumpOver = context.vehicleCanJumpOver ?? (() => false);
  for (const npc of npcs) {
    if (recoverOrStop(npc) || npc.vehicleId !== undefined) continue;
    if (npc.jump) {
      npc.vx = npc.jump.vx; npc.vy = npc.jump.vy; npc.animation = 'jumping'; npc.state = 'walk';
      continue;
    }

    if (npc.state !== 'flee') fleeProgress.delete(npc);
    // Police use the same ordinary walking/turning locomotion as civilians;
    // their weapon response is dispatched by the combat phase instead of the
    // civilian fear state machine.
    let threat: PlayerState | undefined;
    if (npc.kind === 'civilian' && !((npc.faction ?? 0) > 0 && npc.target !== undefined)) threat = activeCivilianThreat(npc, players, traffic, context.navigation);
    if (threat) {
      npc.target = threat.id;
      npc.waitTimer = 0;
      const before = { x: npc.x, y: npc.y };
      const step = fleeTarget(npc, threat, context.navigation);
      const currentStep = step[0];
      if (currentStep) {
        const blocker = movementBlocker(npc, { x: npc.x, y: npc.y }, currentStep.point, avoidance);
        if (blocker[0]?.kind === 'vehicle' && vehicleCanJumpOver(blocker[0].vehicle) && startJumpOver(npc, blocker[0].vehicle)) continue;
        const beforeDistance = pointDistance(before, currentStep.point);
        const reached = moveToward(npc, currentStep.point, currentStep.node, speedFor(true), context.dt, 'flee', avoidance);
        if (reached || currentStep.reached) {
          fleeProgress.delete(npc);
        } else if (fleeGoalStalled(npc, threat, currentStep.point, beforeDistance)) {
          const blockedGoalId = npc.pathGoal?.nodeId;
          clearPath(npc);
          activeAvoidances.delete(npc);
          let alternate: PathResult = [];
          if (blockedGoalId !== undefined) alternate = fleeTarget(npc, threat, context.navigation, blockedGoalId);
          const alternateStep = alternate[0];
          if (alternateStep) {
            moveToward(npc, alternateStep.point, alternateStep.node, speedFor(true), context.dt, 'flee', avoidance);
            const alternateGoalId = npc.pathGoal?.nodeId;
            if (alternateGoalId !== undefined) {
              fleeProgress.set(npc, { threatId: threat.id, goalId: alternateGoalId, bestDistance: pointDistance(npc, alternateStep.point), stalledTicks: 0 });
            }
          } else {
            stop(npc, 'panic', 'running');
          }
        }
      } else {
        fleeProgress.delete(npc);
        stop(npc, 'panic', 'running');
      }
      continue;
    }

    if ((npc.kind === 'police' || (npc.kind === 'civilian' && (npc.faction ?? 0) > 0)) && npc.target !== undefined) {
      const target = players.find(player => player.id === npc.target);
      if (target && activePlayer(target) && Math.abs(target.z - npc.z) <= 1.05) {
        const step = pathToGoal(npc, context.navigation, { x: target.x, y: target.y, z: target.z })[0];
        if (step) moveToward(npc, step.point, step.node, speedFor(true), context.dt, 'attack', avoidance);
        else stop(npc, 'attack', 'armedWalking');
        continue;
      }
      npc.target = undefined;
    }

    npc.target = undefined;
    if (npc.state === 'flee') {
      clearPath(npc);
      npc.waitTimer = Math.max(npc.waitTimer ?? 0, CIVILIAN_BLOCKED_WAIT_TICKS);
    } else {
      fleeProgress.delete(npc);
    }
    let steps: PathResult;
    if (npc.patrolRoute?.length) steps = patrolTarget(npc, context.navigation);
    else steps = localCivilianStep(npc, context.navigation, context.tick);
    const step = steps[0];
    if (step) {
      const blocker = movementBlocker(npc, { x: npc.x, y: npc.y }, step.point, avoidance);
      if (blocker[0]?.kind === 'vehicle' && vehicleCanJumpOver(blocker[0].vehicle) && startJumpOver(npc, blocker[0].vehicle)) continue;
      moveToward(npc, step.point, step.node, speedFor(false), context.dt, 'walk', avoidance);
    }
    else {
      clearPath(npc);
      stop(npc, 'idle', 'idle');
    }
  }
}
