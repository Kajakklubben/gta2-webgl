import { describe, expect, it } from 'vitest';
import { SOURCE_AUDIO_PAN_HALF_WIDTH, SOURCE_WEAPON_AUDIO_MAX_DISTANCE, sourceAudioMix } from '../../client/app/audio-spatial';

const listener = { x: 0, y: 0, z: 0 };

describe('source audio spatial mix', () => {
  it('keeps an emitter at the listener full-volume and centered', () => {
    expect(sourceAudioMix({ source: listener, listener })).toEqual({ volume: 1, pan: 0, distance: 0 });
  });

  it('uses the source squared falloff and cuts off at the weapon radius', () => {
    const halfRange = sourceAudioMix({
      source: { x: SOURCE_WEAPON_AUDIO_MAX_DISTANCE / 2, y: 0, z: 0 }, listener,
    });
    const outside = sourceAudioMix({
      source: { x: SOURCE_WEAPON_AUDIO_MAX_DISTANCE, y: 0, z: 0 }, listener,
    });
    expect(halfRange.volume).toBeCloseTo(.25);
    expect(outside.volume).toBe(0);
  });

  it('pans from listener-relative x while y only affects attenuation', () => {
    const left = sourceAudioMix({ source: { x: -SOURCE_AUDIO_PAN_HALF_WIDTH, y: 0, z: 0 }, listener });
    const right = sourceAudioMix({ source: { x: SOURCE_AUDIO_PAN_HALF_WIDTH, y: 0, z: 0 }, listener });
    const above = sourceAudioMix({ source: { x: 0, y: SOURCE_AUDIO_PAN_HALF_WIDTH, z: 0 }, listener });
    expect(left.pan).toBe(-1);
    expect(right.pan).toBe(1);
    expect(above.pan).toBe(0);
    expect(above.volume).toBeLessThan(1);
  });
});
