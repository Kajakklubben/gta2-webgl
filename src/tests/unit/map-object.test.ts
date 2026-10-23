import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { resolveMapObjectPlacement } from '../../shared/domain/physics/map-object-placement';
import { authoredLocationToWorld } from '../../shared/domain/world/world';
import { mapFixture } from './fixtures';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { createMapObjectDefinitions, DEFAULT_MAP_OBJECT_DEFINITIONS } from '../../shared/engine/loader/map-object-definitions';
import { createStaticMapObject } from '../../shared/game/gameobjects/map-object';

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

it('plays the finite retail model-8 animation before switching to its next definition', () => {
  const pixel = (width: number, height: number) => ({ width, height, data: new Uint8Array(width * height * 4) });
  const definitions = createMapObjectDefinitions(
    [{ model: 8, sprites: 5 }, { model: 9, sprites: 1 }],
    { 8: Array.from({ length: 5 }, () => pixel(14, 14)), 9: [pixel(16, 12)] },
  );
  const object = createStaticMapObject(8, { x: 0, y: 0, z: 0, collisionLayer: 3, grounded: true }, 0, 8, definitions.get(8)!);
  expect(object.getSprite(0)).toMatchObject({ model: 8, frame: 0 });
  const context = { tick: 0, dt: 1 / 30, world: undefined as never };
  for (let tick = 1; tick <= 4; tick++) {
    object.update({ ...context, tick });
    expect(object.getSprite(tick)).toMatchObject({ model: 8, frame: tick });
  }
  object.update({ ...context, tick: 5 });
  expect(object.getSprite(5)).toMatchObject({ model: 9, frame: 0 });
  expect(object.state.model).toBe(8);
});
