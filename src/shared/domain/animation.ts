import { TICK_RATE } from '../protocol/constants';

/**
 * The animation state numbers used by Char_B4::UpdateAnimState.  Keeping the
 * offsets here makes the relationship between the decoded STY sprite bank and
 * the decompiled state machine explicit instead of scattering magic frame
 * numbers through the renderer.
 */
export type SourcePedAnimation =
  | 'walking'
  | 'running'
  | 'armedWalking'
  | 'armedRunning'
  | 'idle'
  | 'firing'
  | 'throwing'
  | 'throwingIdle'
  | 'jumping'
  | 'entering'
  | 'exiting'
  | 'pulledOut'
  | 'falling'
  | 'dead'
  | 'lying'
  | 'lyingReverse'
  | 'electrocuted';

export interface SourcePedAnimationDefinition {
  /** Char_B4 animation state in the original executable. */
  readonly state: number;
  /** Frame offsets relative to the decoded character graphic base. */
  readonly offsets: readonly number[];
  /** Source frame delay: the frame advances when timer > delay. */
  readonly frameTicks: number;
  /** Optional per-frame delays used by lying and door transitions. */
  readonly frameTicksByFrame?: readonly number[];
  readonly loop: boolean;
}

const range = (start: number, count: number) => Array.from({ length: count }, (_, index) => start + index);

/**
 * Authoritative ped sequences from char.cpp.  The source has a special landing
 * frame at base + 23; it is the last frame of the jump sequence here so the
 * renderer never displays the unused base + 24 frame.
 */
export const SOURCE_PED_ANIMATIONS: Readonly<Record<SourcePedAnimation, SourcePedAnimationDefinition>> = {
  walking: { state: 0, offsets: range(0, 8), frameTicks: 3, loop: true },
  running: { state: 1, offsets: range(8, 8), frameTicks: 2, loop: true },
  armedWalking: { state: 0, offsets: range(37, 8), frameTicks: 3, loop: true },
  armedRunning: { state: 1, offsets: range(45, 8), frameTicks: 2, loop: true },
  idle: { state: 2, offsets: range(53, 4), frameTicks: 9, loop: true },
  firing: { state: 3, offsets: [139], frameTicks: 0, loop: false },
  throwing: { state: 4, offsets: range(123, 8), frameTicks: 3, loop: true },
  throwingIdle: { state: 4, offsets: range(115, 8), frameTicks: 3, loop: true },
  jumping: { state: 5, offsets: [...range(16, 7), 23], frameTicks: 3, loop: false },
  entering: { state: 6, offsets: [...range(24, 4), ...range(32, 4)], frameTicks: 3, frameTicksByFrame: [6, 4, 4, 4, 2, 2, 2, 2], loop: false },
  exiting: { state: 7, offsets: [36, 35, 34, 33, 28, 29, 30, 31], frameTicks: 3, frameTicksByFrame: [4, 4, 4, 4, 2, 2, 2, 2], loop: false },
  pulledOut: { state: 8, offsets: [36], frameTicks: 0, loop: false },
  falling: { state: 11, offsets: range(81, 17), frameTicks: 2, loop: false },
  dead: { state: 10, offsets: [72], frameTicks: 0, loop: false },
  lying: { state: 15, offsets: range(65, 8), frameTicks: 4, frameTicksByFrame: [4, 4, 4, 4, 4, 4, 3, 3], loop: false },
  lyingReverse: { state: 16, offsets: range(73, 8), frameTicks: 4, frameTicksByFrame: [4, 4, 4, 4, 4, 4, 3, 3], loop: false },
  electrocuted: { state: 17, offsets: range(151, 5), frameTicks: 4, loop: true },
};

export function sourceAnimationDefinition(animation: SourcePedAnimation) {
  return SOURCE_PED_ANIMATIONS[animation];
}

/** The source runs animation timers in the same fixed tick as gameplay. */
export function sourceFrameMs(frameTicks: number) {
  if (frameTicks > 0) return frameTicks * 1000 / TICK_RATE;
  return 0;
}

/** Total fixed ticks in a non-looping source sequence. */
export function sourceAnimationTicks(animation: SourcePedAnimation) {
  const definition = sourceAnimationDefinition(animation);
  return definition.frameTicksByFrame?.reduce((sum, ticks) => sum + Math.max(1, ticks), 0)
    ?? Math.max(1, definition.offsets.length * Math.max(1, definition.frameTicks));
}

/** Fixed ticks used by a pedestrian's authored lethal fall before the corpse pose. */
export const PED_DEATH_ANIMATION_TICKS = sourceAnimationTicks('falling');

/**
 * Resolve a normalized transition progress using the same per-frame timer
 * boundaries as Char_B4.  Most sequences have one delay, while car entry and
 * exit deliberately shorten the final alignment poses.
 */
export function sourceAnimationFrame(animation: SourcePedAnimation, normalizedProgress: number) {
  const definition = sourceAnimationDefinition(animation);
  if (!definition.offsets.length) return 0;
  const progress = Math.max(0, Math.min(1, normalizedProgress));
  if (progress >= 1) return definition.offsets.length - 1;
  const durations = definition.frameTicksByFrame;
  if (!durations?.length) return Math.min(definition.offsets.length - 1, Math.floor(progress * definition.offsets.length));
  const total = sourceAnimationTicks(animation);
  let tick = progress * total;
  for (let frame = 0; frame < definition.offsets.length; frame++) {
    const duration = Math.max(1, durations[frame] ?? durations[durations.length - 1] ?? 1);
    if (tick < duration) return frame;
    tick -= duration;
  }
  return definition.offsets.length - 1;
}

/** Resolve a source sequence to a fractional frame for presentation-only
 * interpolation. Gameplay and door alignment continue using the discrete
 * sourceAnimationFrame() value above. */
export function sourceAnimationPosition(animation: SourcePedAnimation, normalizedProgress: number) {
  const definition = sourceAnimationDefinition(animation);
  if (!definition.offsets.length) return 0;
  const progress = Math.max(0, Math.min(1, normalizedProgress));
  if (progress >= 1) return definition.offsets.length - 1;
  const durations = definition.frameTicksByFrame;
  if (!durations?.length) return Math.min(definition.offsets.length - 1, progress * definition.offsets.length);
  const total = sourceAnimationTicks(animation);
  let tick = progress * total;
  for (let frame = 0; frame < definition.offsets.length; frame++) {
    const duration = Math.max(1, durations[frame] ?? durations[durations.length - 1] ?? 1);
    if (tick < duration) return Math.min(definition.offsets.length - 1, frame + tick / duration);
    tick -= duration;
  }
  return definition.offsets.length - 1;
}
