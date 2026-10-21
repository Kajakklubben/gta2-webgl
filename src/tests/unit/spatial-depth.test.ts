import { describe, expect, it } from 'vitest';
import type { GameObjectDrawCommand, GameObjectSprite } from '../../shared/game/gameobjects/gameobject';
import { WORLD } from '../../shared/domain/world/world';
import { resolveRenderDepth } from '../../client/rendering/spatial-depth';
import { renderPolicy } from '../../client/rendering/sprite-engine/render-policy';

function command(kind: GameObjectDrawCommand['kind'], sprite: GameObjectSprite): GameObjectDrawCommand {
  return { kind, id: 1, key: `${kind}:1`, state: {}, sprite };
}

function sprite(renderDepth?: GameObjectSprite['renderDepth']): GameObjectSprite {
  const base: GameObjectSprite = { atlas: 'codeObjects', placement: { x: 0, y: 0, z: 4, rotation: 0 } };
  return renderDepth === undefined ? base : { ...base, renderDepth };
}

describe('renderer spatial depth adapter', () => {
  it('resolves effect elevation and pass ordering without game-owned offsets', () => {
    const actor = command('player', sprite());
    const effect = command('projectile', sprite({ band: 'effect' }));
    const actorDepth = resolveRenderDepth(actor, actor.sprite);
    const effectDepth = resolveRenderDepth(effect, effect.sprite);

    expect(effectDepth.worldZ - actorDepth.worldZ).toBe(WORLD.render.projectileZOffset);
    expect(effectDepth.sortKey).toBeLessThan(actorDepth.sortKey);
  });

  it('resolves semantic occlusion and authored map layers in the renderer', () => {
    const behind = command('player', sprite({ relation: 'behind-vehicle' }));
    const vehicle = command('vehicle', sprite());
    const mapObject = command('map-object', sprite({ band: 'map', sourceLayer: 10 }));

    expect(renderPolicy(behind.sprite, behind).renderOrder).toBeLessThan(renderPolicy(vehicle.sprite, vehicle).renderOrder);
    expect(renderPolicy(mapObject.sprite, mapObject).renderOrder).toBe(10);
    expect(resolveRenderDepth(behind, behind.sprite).worldZ).toBe(resolveRenderDepth(command('player', sprite()), sprite()).worldZ - 1);
  });
});
