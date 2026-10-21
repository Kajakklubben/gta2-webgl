import type { NpcState, PedestrianPathGoal, PlayerState, TrafficState } from '../../../protocol/types';
import { sourceFixedRawPerTickToWorld, WORLD } from '../../world/world';
import { PedestrianNavigation, type PedestrianNavNode } from '../pedestrian-navigation';
import { PED_DEATH_ANIMATION_TICKS } from '../../animation';

export const PATH_REACH_DISTANCE = 14;
export const PATH_REPLAN_DISTANCE = WORLD.tileSize * 1.5;
export const PEDESTRIAN_WALK_TURN_ANG16 = 96;
export const PEDESTRIAN_RUN_TURN_ANG16 = 48;
export const PEDESTRIAN_RUN_TURN_SPEED = sourceFixedRawPerTickToWorld(0x200);
export const CIVILIAN_SCARE_RADIUS = WORLD.tileSize * 4;
export const CIVILIAN_SAFE_RADIUS = WORLD.tileSize * 6;
export const FAST_CAR_MIN_SPEED = sourceFixedRawPerTickToWorld(0x1eb);
export const KNOCKDOWN_TICKS = 34;
export const CIVILIAN_BLOCKED_WAIT_TICKS = 30;
export const PEDESTRIAN_RADIUS = 12;
export const FLEE_REPLAN_TICKS = 15;
export const FLEE_PROGRESS_EPSILON = .25;
export const OBSTACLE_RETRY_TURN = Math.PI * 2 * 64 / 2048;

export interface PedestrianVehicleBounds { readonly width: number; readonly height: number; }
export interface PedestrianAiContext {
  readonly npcs: Iterable<NpcState>;
  readonly players: Iterable<PlayerState>;
  readonly navigation: PedestrianNavigation;
  readonly traffic?: Iterable<TrafficState>;
  readonly vehicleBounds?: (vehicle: TrafficState) => PedestrianVehicleBounds;
  readonly vehicleCanJumpOver?: (vehicle: TrafficState) => boolean;
  readonly dt: number;
  readonly tick: number;
}
export interface PedestrianAvoidanceContext {
  readonly vehicles: readonly TrafficState[];
  readonly vehicleBounds: (vehicle: TrafficState) => PedestrianVehicleBounds;
}
export interface ActiveAvoidance { readonly blockerKey: string; readonly rotation: number; }
export interface FleeProgress { readonly threatId: string; readonly goalId: number; bestDistance: number; stalledTicks: number; }
export const activeAvoidances = new WeakMap<NpcState, ActiveAvoidance>();
export const fleeProgress = new WeakMap<NpcState, FleeProgress>();

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) { return distance(a, b); }
export function maxAxisDistance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
export function hash(seed: number) { let value = seed | 0; value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return value >>> 0; }
export function nodePoint(node: PedestrianNavNode): PedestrianPathGoal { return { x: node.worldX, y: node.worldY, z: node.height, nodeId: node.id }; }
export function goalMatches(current: PedestrianPathGoal | undefined, next: PedestrianPathGoal) {
  if (!current) return false;
  if (current.nodeId !== undefined || next.nodeId !== undefined) return current.nodeId === next.nodeId;
  return pointDistance(current, next) <= PATH_REPLAN_DISTANCE && Math.abs(current.z - next.z) <= 1.05;
}
export function clearPath(npc: NpcState) {
  npc.path = undefined; npc.pathPointIndex = undefined; npc.pathIndex = undefined; npc.pathGoal = undefined; npc.crossingRoad = false; fleeProgress.delete(npc);
}
export { PED_DEATH_ANIMATION_TICKS };
