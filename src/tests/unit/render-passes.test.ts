import { describe, expect, it } from 'vitest';
import { RENDER_PASS_BANDS, RENDER_PASS_LEVELS, spriteRenderPassBand } from '../../client/rendering/render-passes';

describe('explicit GTA2 render pipeline', () => {
  it('keeps the authored pass order stable', () => {
    expect(RENDER_PASS_BANDS).toEqual([
      'map-wall', 'map-surface', 'underlay', 'map-object', 'pickup',
      'npc', 'vehicle', 'player', 'overlay',
    ]);
    expect(RENDER_PASS_LEVELS).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('maps sprite categories to controlled passes', () => {
    expect(spriteRenderPassBand('map-object', 'object')).toBe('map-object');
    expect(spriteRenderPassBand('pickup', 'object')).toBe('pickup');
    expect(spriteRenderPassBand('npc', 'object')).toBe('npc');
    expect(spriteRenderPassBand('vehicle', 'object')).toBe('vehicle');
    expect(spriteRenderPassBand('player', 'object')).toBe('player');
    expect(spriteRenderPassBand('hazard', 'underlay')).toBe('underlay');
    expect(spriteRenderPassBand('projectile', 'overlay')).toBe('overlay');
  });
});
