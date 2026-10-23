import { WORLD } from '../../shared/domain/world/world';

export interface AudioPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AudioSpatialization {
  readonly source: AudioPosition;
  readonly listener: AudioPosition;
  /** Maximum audible distance in browser world pixels. */
  readonly maxDistance?: number;
  /** Source-style horizontal pan half-width in browser world pixels. */
  readonly panWidth?: number;
}

export interface AudioSpatialMix {
  /** Multiplicative volume in the range 0..1. */
  readonly volume: number;
  /** StereoPanner-compatible value in the range -1..1. */
  readonly pan: number;
  readonly distance: number;
}

/** Weapon_30::ProcessType7_Weapon uses max_dist=10 and sound intensity=10.
 * Runtime positions are browser world pixels, while source distances are map
 * units, so the authored radius is ten 64-pixel map tiles. */
export const SOURCE_WEAPON_AUDIO_MAX_DISTANCE = 10 * WORLD.tileSize;

/** sound_obj::ComputePan divides the weapon intensity by 64 before applying
 * its pan table.  10 / 64 map units is ten browser world pixels. */
export const SOURCE_AUDIO_PAN_HALF_WIDTH = (10 / 64) * WORLD.tileSize;

/** Explosion and vocal event sounds use the broader source 18-unit radius. */
export const SOURCE_EVENT_AUDIO_MAX_DISTANCE = 18 * WORLD.tileSize;

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Calculate a deterministic browser-side equivalent of GTA2's 2D sound mix.
 * The source ignores vertical distance for its legacy 2D volume and pan
 * calculation, so z remains part of the API but is intentionally not used.
 */
export function sourceAudioMix(spatialization: AudioSpatialization): AudioSpatialMix {
  const source = spatialization.source;
  const listener = spatialization.listener;
  const dx = finite(source.x, 0) - finite(listener.x, 0);
  const dy = finite(source.y, 0) - finite(listener.y, 0);
  const distance = Math.hypot(dx, dy);
  const maxDistance = Math.max(0, finite(spatialization.maxDistance ?? SOURCE_WEAPON_AUDIO_MAX_DISTANCE, SOURCE_WEAPON_AUDIO_MAX_DISTANCE));
  const panWidth = Math.max(Number.EPSILON, finite(spatialization.panWidth ?? SOURCE_AUDIO_PAN_HALF_WIDTH, SOURCE_AUDIO_PAN_HALF_WIDTH));
  if (maxDistance === 0 || distance >= maxDistance) return { volume: 0, pan: clamp(dx / panWidth, -1, 1), distance };

  // sound_obj::CalcVolume_41A3F0: round((1 - dist/max)^2 * base_volume).
  const falloff = 1 - distance / maxDistance;
  return { volume: falloff * falloff, pan: clamp(dx / panWidth, -1, 1), distance };
}
