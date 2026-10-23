import type { GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import { sourceFrameMs } from '../../../shared/domain/animation';
import { selectSpriteFrames, type SpriteFrameBlend } from '../../../shared/engine/assets/animation';
import type { Pixels } from '../../../shared/engine/assets/pixels';

export interface ResolvedAnimationFrames {
  readonly current: readonly Pixels[];
  readonly next: readonly Pixels[];
  readonly mix: number;
}

interface AnimationTrack {
  stateKey: string;
  elapsed: number;
  lastNow: number;
}

/**
 * Source-style fixed-step animation state for every submitted sprite layer.
 * The renderer may interpolate the result, but the selected frame always
 * comes from the same discrete timing contract used by gameplay.
 */
export class AnimationPlayer {
  private readonly tracks = new Map<string, AnimationTrack>();

  resolve(
    sprite: GameObjectSpriteLayer,
    frames: readonly Pixels[],
    now: number,
    trackKey: string,
  ): ResolvedAnimationFrames {
    if (!frames.length) return { current: [], next: [], mix: 0 };
    if (sprite.variantIndex !== undefined) {
      const frame = frames[((sprite.variantIndex % frames.length) + frames.length) % frames.length]!;
      return { current: [frame], next: [frame], mix: 0 };
    }

    const stateKey = sprite.animationKey ?? [
      sprite.atlas,
      sprite.definition ? `${sprite.definition.bank}:${sprite.definition.sourceId}` : '',
      sprite.sourceModel ?? '',
      sprite.sourceSequence ?? '',
      sprite.model ?? '',
      sprite.animation ?? 'base',
      sprite.variant ?? '',
      sprite.variantIndex ?? '',
    ].join(':');
    let duration = sprite.frameMs ?? 90;
    if (sprite.frameTicks !== undefined) duration = sourceFrameMs(sprite.frameTicks);
    duration = Math.max(1, duration);
    let frameDurations: number[] | undefined;
    if (sprite.frameTicksByFrame?.length) {
      frameDurations = frames.map((_, index) => {
        const frameTicks = sprite.frameTicksByFrame?.[index];
        return Math.max(1, frameTicks === undefined ? duration : sourceFrameMs(frameTicks));
      });
    }

    let track = this.tracks.get(trackKey);
    if (!track || track.stateKey !== stateKey) {
      track = { stateKey, elapsed: 0, lastNow: now };
      this.tracks.set(trackKey, track);
    } else {
      // Source timers advance in fixed steps. Cap catch-up after a suspended
      // tab so a hidden browser window cannot skip an entire sequence.
      track.elapsed += Math.max(0, Math.min(250, now - track.lastNow));
      track.lastNow = now;
    }

    if (sprite.frame !== undefined) {
      const framePosition = Math.max(0, Math.min(frames.length - 1, sprite.frame));
      const frame = Math.floor(framePosition);
      const selected = frames[frame];
      if (!selected) throw new Error(`Sprite frame ${frame} is unavailable for ${stateKey}`);
      if (frameDurations?.length) track.elapsed = frameDurations.slice(0, frame).reduce((sum, value) => sum + value, 0);
      else track.elapsed = frame * duration;
      return { current: [selected], next: [selected], mix: 0 };
    }

    const selection: SpriteFrameBlend = selectSpriteFrames(track.elapsed, frameDurations ?? frames.map(() => duration), sprite.loop ?? true);
    const current = frames[selection.frameIndex], next = frames[selection.nextFrameIndex];
    if (!current || !next) throw new Error(`Sprite animation selected an unavailable frame for ${stateKey}`);
    return { current: [current], next: [next], mix: selection.mix };
  }

  forget(trackKey: string) {
    this.tracks.delete(trackKey);
  }

  clear() {
    this.tracks.clear();
  }
}
