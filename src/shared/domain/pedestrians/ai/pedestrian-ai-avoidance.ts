import type { NpcState, TrafficState } from '../../../protocol/types';
import { directionFromRotation, normalizeRotation, rotationFromDirection, sourceAngleToRadians } from '../../physics/motion-vector';
import { WORLD } from '../../world/world';
import { activeAvoidances, OBSTACLE_RETRY_TURN, PATH_REACH_DISTANCE, PEDESTRIAN_RADIUS, PEDESTRIAN_RUN_TURN_ANG16, PEDESTRIAN_RUN_TURN_SPEED, PEDESTRIAN_WALK_TURN_ANG16, type PedestrianAvoidanceContext, type PedestrianVehicleBounds } from './pedestrian-ai-support';
import type { PedestrianNavNode } from '../pedestrian-navigation';

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

export function movementBlocker(npc: NpcState, from: { x: number; y: number }, to: { x: number; y: number }, context: PedestrianAvoidanceContext): BlockerResult {
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

export function moveToward(npc: NpcState, point: { x: number; y: number }, node: PedestrianNavNode | undefined, speed: number, dt: number, state: 'walk' | 'flee' | 'attack', avoidance?: PedestrianAvoidanceContext) {
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

export function stop(npc: NpcState, state: NpcState['state'], animation: NpcState['animation']) {
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
