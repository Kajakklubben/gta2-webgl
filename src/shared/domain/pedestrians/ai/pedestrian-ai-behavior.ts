import type { NpcState, PlayerState } from '../../../protocol/types';
import { directionFromRotation } from '../../physics/motion-vector';
import { GTA2GroundType } from '../../world/gta2-enums';
import { sourceFixedRawPerTickToWorld, WORLD } from '../../world/world';
import { PED_DEATH_ANIMATION_TICKS, CIVILIAN_BLOCKED_WAIT_TICKS, FLEE_PROGRESS_EPSILON, FLEE_REPLAN_TICKS, KNOCKDOWN_TICKS, hash, distance, pointDistance, fleeProgress, clearPath, nodePoint } from './pedestrian-ai-support';
import { pathToGoal, followPath, type PathResult, type PathStep } from './pedestrian-ai-path';
import { stop } from './pedestrian-ai-avoidance';
import { PedestrianNavigation, type PedestrianNavNode } from '../pedestrian-navigation';

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

export function localCivilianStep(npc: NpcState, navigation: PedestrianNavigation, tick: number): PathResult {
  const target = localCivilianTarget(npc, navigation, tick)[0];
  if (!target) return [];
  return [{ point: { x: target.worldX, y: target.worldY, z: target.height }, node: target, reached: false } satisfies PathStep];
}

/** Follow an explicitly authored patrol list, if one is supplied by a script. */
export function patrolTarget(npc: NpcState, navigation: PedestrianNavigation): PathResult {
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

export function fleeTarget(npc: NpcState, threat: PlayerState, navigation: PedestrianNavigation, excludedGoalId?: number): PathResult {
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

export function fleeGoalStalled(npc: NpcState, threat: PlayerState, goal: { x: number; y: number }, beforeDistance: number) {
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

export function recoverOrStop(npc: NpcState) {
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

export function speedFor(running: boolean) {
  if (running) return sourceFixedRawPerTickToWorld(WORLD.player.source.runSpeed);
  return WORLD.traffic.civilianSpeed * WORLD.tileSize;
}

/**
 * Server-side pedestrian state machine. Explicit objectives use the bounded
 * temporary path stored on the NPC; an ordinary dummy with no objective uses
 * Char_B4-style local pavement walking instead of a generated patrol route.
 */
