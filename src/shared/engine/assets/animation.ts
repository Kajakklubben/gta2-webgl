export interface SpriteFrameBlend {
  readonly frameIndex: number;
  readonly nextFrameIndex: number;
  readonly mix: number;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

/** Resolve the current and next frames for a time-based sprite sequence. */
export function selectSpriteFrames(
  elapsed: number,
  frameDurations: readonly number[],
  loop: boolean,
): SpriteFrameBlend {
  if (frameDurations.length <= 1) return { frameIndex: 0, nextFrameIndex: 0, mix: 0 };

  const durations = frameDurations.map(duration => Math.max(1, duration));
  const sequenceDuration = durations.reduce((sum, duration) => sum + duration, 0);
  if (sequenceDuration <= 0) return { frameIndex: 0, nextFrameIndex: 0, mix: 0 };

  let timeline = Math.min(Math.max(0, elapsed), sequenceDuration);
  if (loop) timeline = positiveModulo(Math.max(0, elapsed), sequenceDuration);

  let remaining = timeline;
  let frameIndex = 0;
  while (frameIndex < durations.length - 1 && remaining >= durations[frameIndex]!) {
    remaining -= durations[frameIndex]!;
    frameIndex++;
  }

  const atEnd = !loop && frameIndex === durations.length - 1 && remaining >= durations[frameIndex]!;
  let nextFrameIndex = (frameIndex + 1) % durations.length;
  if (atEnd) nextFrameIndex = frameIndex;
  let mix = 0;
  if (!atEnd) mix = Math.max(0, Math.min(1, remaining / durations[frameIndex]!));
  return { frameIndex, nextFrameIndex, mix };
}

/** Return the two frames and normalized blend amount for a looping preview. */
export function spriteFrameBlend(now: number, frameMs: number, frameCount: number): SpriteFrameBlend {
  if (frameCount <= 1) return { frameIndex: 0, nextFrameIndex: 0, mix: 0 };
  const position = Math.max(0, now) / Math.max(1, frameMs);
  const frameIndex = Math.floor(position) % frameCount;
  return { frameIndex, nextFrameIndex: (frameIndex + 1) % frameCount, mix: position - Math.floor(position) };
}
