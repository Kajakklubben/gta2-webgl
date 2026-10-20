import type { GameObjectDrawCommand, GameObjectPlacement } from '../../shared/game/gameobjects/gameobject';

export interface RenderObjectFrame {
  pose: GameObjectPlacement;
  worldPose: GameObjectPlacement;
  vx: number;
  vy: number;
  angularVelocity: number;
}

interface Sample extends RenderObjectFrame {
  sampledAt: number;
}

interface Track {
  from: Sample;
  to: Sample;
  startedAt: number;
  duration: number;
  lastTargetAt: number;
}

const MIN_DURATION_MS = 1000 / 30;
const MAX_DURATION_MS = 100;
const TELEPORT_DISTANCE = 96;
const TELEPORT_HEIGHT = 24;

function sample(command: GameObjectDrawCommand, now: number): Sample {
  const state = command.state as { x?: number; y?: number; z?: number; rotation?: number; collisionLayer?: number; vx?: number; vy?: number; angularVelocity?: number };
  const hasWorldPose = typeof state.x === 'number' && typeof state.y === 'number' && typeof state.z === 'number' && typeof state.rotation === 'number';
  let worldPose: GameObjectPlacement;
  if (!hasWorldPose) {
    worldPose = { ...command.sprite.placement };
  } else {
    worldPose = { x: state.x!, y: state.y!, z: state.z!, rotation: state.rotation! };
    if (state.collisionLayer !== undefined) worldPose.layer = state.collisionLayer;
  }
  return {
    pose: { ...command.sprite.placement },
    worldPose,
    vx: state.vx ?? 0,
    vy: state.vy ?? 0,
    angularVelocity: state.angularVelocity ?? 0,
    sampledAt: now,
  };
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function blend(from: Sample, to: Sample, amount: number, now: number): Sample {
  const pose: GameObjectPlacement = {
    x: from.pose.x + (to.pose.x - from.pose.x) * amount,
    y: from.pose.y + (to.pose.y - from.pose.y) * amount,
    z: from.pose.z + (to.pose.z - from.pose.z) * amount,
    rotation: from.pose.rotation + angleDelta(from.pose.rotation, to.pose.rotation) * amount,
  };
  if (to.pose.layer !== undefined) pose.layer = to.pose.layer;
  const worldPose: GameObjectPlacement = {
    x: from.worldPose.x + (to.worldPose.x - from.worldPose.x) * amount,
    y: from.worldPose.y + (to.worldPose.y - from.worldPose.y) * amount,
    z: from.worldPose.z + (to.worldPose.z - from.worldPose.z) * amount,
    rotation: from.worldPose.rotation + angleDelta(from.worldPose.rotation, to.worldPose.rotation) * amount,
  };
  if (to.worldPose.layer !== undefined) worldPose.layer = to.worldPose.layer;
  return {
    pose,
    worldPose,
    vx: from.vx + (to.vx - from.vx) * amount,
    vy: from.vy + (to.vy - from.vy) * amount,
    angularVelocity: from.angularVelocity + (to.angularVelocity - from.angularVelocity) * amount,
    sampledAt: now,
  };
}

function current(track: Track, now: number) {
  const amount = Math.max(0, Math.min(1, (now - track.startedAt) / track.duration));
  return blend(track.from, track.to, amount, now);
}

function shouldSnap(from: Sample, to: Sample) {
  return Math.hypot(to.worldPose.x - from.worldPose.x, to.worldPose.y - from.worldPose.y) > TELEPORT_DISTANCE || Math.abs(to.worldPose.z - from.worldPose.z) > TELEPORT_HEIGHT;
}

/** Interpolates only the presentation frame; authoritative GameObjects remain unchanged. */
export class RenderInterpolation {
  private readonly tracks = new Map<string, Track>();

  update(commands: readonly GameObjectDrawCommand[], now: number): ReadonlyMap<string, RenderObjectFrame> {
    const active = new Set<string>();
    const result = new Map<string, RenderObjectFrame>();
    for (const command of commands) {
      active.add(command.key);
      const target = sample(command, now);
      const track = this.tracks.get(command.key);
      if (!track) {
        this.tracks.set(command.key, { from: target, to: target, startedAt: now, duration: MIN_DURATION_MS, lastTargetAt: now });
      } else if (target.worldPose.x !== track.to.worldPose.x || target.worldPose.y !== track.to.worldPose.y || target.worldPose.z !== track.to.worldPose.z || target.worldPose.rotation !== track.to.worldPose.rotation || target.vx !== track.to.vx || target.vy !== track.to.vy || target.angularVelocity !== track.to.angularVelocity) {
        const displayed = current(track, now);
        const snap = shouldSnap(displayed, target);
        let from = displayed;
        if (snap) from = target;
        let duration = now - track.lastTargetAt;
        if (snap) duration = MIN_DURATION_MS;
        else duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, duration));
        this.tracks.set(command.key, {
          from,
          to: target,
          startedAt: now,
          duration,
          lastTargetAt: now,
        });
      }
      result.set(command.key, current(this.tracks.get(command.key)!, now));
    }
    for (const key of this.tracks.keys()) if (!active.has(key)) this.tracks.delete(key);
    return result;
  }
}
