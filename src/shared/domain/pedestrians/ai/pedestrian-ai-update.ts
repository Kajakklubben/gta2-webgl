import type { PlayerState } from '../../../protocol/types';
import { activeCivilianThreat, activePlayer, startJumpOver } from './pedestrian-ai-threats';
import { recoverOrStop, fleeGoalStalled, fleeTarget, localCivilianStep, patrolTarget, speedFor } from './pedestrian-ai-behavior';
import { activeAvoidances, clearPath, CIVILIAN_BLOCKED_WAIT_TICKS, fleeProgress, pointDistance, type PedestrianAiContext, type PedestrianAvoidanceContext } from './pedestrian-ai-support';
import { pathToGoal, type PathResult } from './pedestrian-ai-path';
import { movementBlocker, moveToward, stop } from './pedestrian-ai-avoidance';

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
