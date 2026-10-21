import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { resolveMapObjectPlacement } from '../../shared/domain/physics/map-object-placement';
import { authoredLocationToWorld } from '../../shared/domain/world/world';
import { mapFixture } from './fixtures';
import { parseMap } from '../../shared/loader/map-parser';
import { DEFAULT_MAP_OBJECT_DEFINITIONS } from '../../shared/loader/map-object-definitions';

it('places and blocks an MOBJ from its authored cube coordinate and floor', () => {
  const level = parseMap(mapFixture());
  const object = { x: 85.5, y: 190.5, rotation: 0, type: 7 };
  level.objects.push(object);
  const placement = resolveMapObjectPlacement(level, object);
  expect(placement).toMatchObject({ x: 85 * 64, y: -190 * 64, z: 4, collisionLayer: 4, grounded: true });

  const game = new GameWorld(level, undefined, [], new Map(), [], new Map(), new Map(), DEFAULT_MAP_OBJECT_DEFINITIONS);
  const center = authoredLocationToWorld(object.x, object.y);
  const staticObject = game.gameState.mapObjects[0];
  expect(staticObject).toBeDefined();
  expect(staticObject?.kind).toBe('map-object');
  expect(staticObject?.state).toMatchObject({ id: 0, model: 7, x: center.x, y: center.y, z: 4, collisionLayer: 4, grounded: true });
  expect(staticObject?.getSprite(0)).toMatchObject({ atlas: 'objects', model: 7, frame: 0 });
  expect(staticObject?.getCollider()[0]).toMatchObject({ blockingWeight: 0, solid: true, box: { width: 30, height: 26 } });
  let hit = false;
  game.physics.physicsWorld.rayCast(
    { x: center.x - 64, y: center.y },
    { x: center.x + 64, y: center.y },
    fixture => {
      if (((fixture as { getUserData?: () => unknown }).getUserData?.() as { kind?: string } | undefined)?.kind === 'map-object') hit = true;
      return true;
    },
  );
  expect(hit).toBe(true);
});

it('uses the source ground type when an authored support has no lid tile', () => {
  const level = parseMap(mapFixture());
  const block = level.map[85]![190]![3]!;
  block.groundType = 1;
  block.Lid = { ...block.Lid, tileNumber: 0 };
  const placement = resolveMapObjectPlacement(level, { x: 85.5, y: 190.5, rotation: 0, type: 7 });
  expect(placement).toMatchObject({ x: 85 * 64, y: -190 * 64, z: 4, collisionLayer: 4, grounded: true });
});
