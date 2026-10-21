import type { NpcState, PedestrianPathGoal } from '../../../protocol/types';
import { PedestrianNavigation, type PedestrianNavNode } from '../pedestrian-navigation';
import { clearPath, goalMatches, PATH_REACH_DISTANCE, pointDistance } from './pedestrian-ai-support';

export interface PathStep {
  readonly point: { x: number; y: number; z: number };
  readonly node?: PedestrianNavNode;
  readonly reached: boolean;
}

export type PathResult = PathStep[];
export function followPath(npc: NpcState, navigation: PedestrianNavigation): PathResult {
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
export function pathToGoal(npc: NpcState, navigation: PedestrianNavigation, goal: PedestrianPathGoal, avoidRoads = false): PathResult {
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
