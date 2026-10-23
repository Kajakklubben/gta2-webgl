import { describe, expect, it } from 'vitest';
import type { GameObjectDrawCommand, GameObjectSprite } from '../../shared/game/gameobjects/gameobject';
import { WORLD } from '../../shared/domain/world/world';
import { mapLevelFromGameObjectState, resolveRenderDepth } from '../../client/rendering/spatial-depth';
import { renderPolicy } from '../../client/rendering/sprite-engine/render-policy';

function command(kind: GameObjectDrawCommand['kind'], sprite: GameObjectSprite): GameObjectDrawCommand {
  return { kind, id: 1, key: `${kind}:1`, state: {}, sprite };
}

function sprite(presentation?: GameObjectSprite['presentation']): GameObjectSprite {
  const base: GameObjectSprite = { atlas: 'codeObjects', placement: { x: 0, y: 0, z: 4, rotation: 0 } };
  return presentation === undefined ? base : { ...base, presentation };
}

describe('renderer spatial depth adapter', () => {
  it('promotes grounded road-slope objects to the surface level', () => {
    expect(mapLevelFromGameObjectState('vehicle', 2.47, 3, true)).toBe(3);
    expect(mapLevelFromGameObjectState('vehicle', 2, 2, true)).toBe(1);
    expect(mapLevelFromGameObjectState('vehicle', 2.47, 3, false)).toBe(2);
    expect(mapLevelFromGameObjectState('projectile', 2.47, 3)).toBe(2);
  });

  it('resolves effect elevation and pass ordering without game-owned offsets', () => {
    const actor = command('player', sprite());
    const effect = command('projectile', sprite({ band: 'overlay' }));
    const actorDepth = resolveRenderDepth(actor, actor.sprite);
    const effectDepth = resolveRenderDepth(effect, effect.sprite);

    expect(effectDepth.worldZ - actorDepth.worldZ).toBe(WORLD.render.projectileZOffset);
    expect(effectDepth.sortKey).toBeGreaterThan(actorDepth.sortKey);
  });

  it('resolves semantic occlusion and authored map layers in the renderer', () => {
    const behind = command('player', sprite({ band: 'underlay' }));
    const vehicle = command('vehicle', sprite());
    const mapObject = command('map-object', sprite({ priority: 10, band: 'object' }));

    expect(renderPolicy(behind.sprite, behind).presentation.mapLevel).toBe(renderPolicy(vehicle.sprite, vehicle).presentation.mapLevel);
    expect(renderPolicy(behind.sprite, behind).presentation.band).toBe('underlay');
    expect(renderPolicy(mapObject.sprite, mapObject).presentation.mapLevel).toBe(3);
    expect(renderPolicy(mapObject.sprite, mapObject).presentation.priority).toBe(10);
    expect(resolveRenderDepth(behind, behind.sprite).sortKey).toBeLessThan(resolveRenderDepth(vehicle, vehicle.sprite).sortKey);
  });
});
