import { describe, expect, it } from 'vitest';
import { selectSpriteFrames, spriteFrameBlend } from '../../shared/engine/assets/animation';
import type { PixelFrame } from '../../shared/engine/assets/pixels';
import type { SpriteAssetResolver } from '../../shared/engine/assets/sprites';
import type { TileMapAsset } from '../../shared/engine/assets/tile-map';

describe('neutral asset contracts', () => {
  it('selects sprite frames without importing a game or renderer', () => {
    expect(spriteFrameBlend(150, 100, 4)).toEqual({ frameIndex: 1, nextFrameIndex: 2, mix: .5 });
    expect(selectSpriteFrames(75, [50, 100, 25], false)).toEqual({ frameIndex: 1, nextFrameIndex: 2, mix: .25 });
  });

  it('supports a game-specific resolver behind the neutral sprite port', () => {
    const frame: PixelFrame = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
    let cleared = false;
    const resolver: SpriteAssetResolver<{ readonly id: string }, { readonly tick: number }> = {
      resolve(request, context) {
        expect(request.id).toBe('player');
        expect(context.tick).toBe(4);
        return { frames: [frame], sourceKey: 'test:player', paletteKey: 'default' };
      },
      clear() { cleared = true; },
    };
    expect(resolver.resolve({ id: 'player' }, { tick: 4 })).toMatchObject({ sourceKey: 'test:player' });
    resolver.clear();
    expect(cleared).toBe(true);
  });

  it('accepts layered map data without requiring a GTA2 map model', () => {
    const map: TileMapAsset<{ readonly tile: number }> = {
      map: [[[{ tile: 1 }]]],
      animations: [{ base: 1, frameRate: 2, repeat: 0, tiles: [1, 2] }],
    };
    expect(map.map[0]?.[0]?.[0]?.tile).toBe(1);
    expect(map.animations[0]?.tiles).toEqual([1, 2]);
  });
});
