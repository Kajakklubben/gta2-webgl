import { describe, expect, it } from 'vitest';
import { PedestrianNavigation } from '../../shared/domain/pedestrians/pedestrian-navigation';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { createGameplayScenarioLevel, gameplayTile, GAMEPLAY_SCENARIOS } from '../../client/tools/scenarios/gameplay-scenario-lab-layout';
import { scenarioTileOrigin } from '../../client/tools/scenarios/scenario-view';
import { TINY_TOWN_RENDERING_ROOM, TINY_TOWN_RENDERING_TILE, TINY_TOWN_ROAD_TILE, TINY_TOWN_WATER_AREA, TINY_TOWN_WATER_TILE } from '../../client/tools/scenarios/scenario-view';
import { mapFixture } from './fixtures';

describe('debug gameplay scenario levels', () => {
  it('uses the source map at the authored road, water, and rendering anchors', () => {
    const source = parseMap(mapFixture());
    const road = createGameplayScenarioLevel(source, 'road');
    const water = createGameplayScenarioLevel(source, 'water');
    const rendering = createGameplayScenarioLevel(source, 'tiny-town');
    const navigation = new PedestrianNavigation(water.level);

    expect(road.water).toBeUndefined();
    expect(road.level).toBe(source);
    expect(water.level).toBe(source);
    expect(road.origin).toMatchObject(scenarioTileOrigin(TINY_TOWN_ROAD_TILE, 2));
    expect(water.origin).toMatchObject(scenarioTileOrigin(TINY_TOWN_WATER_TILE, 1));
    expect(rendering.origin).toMatchObject(scenarioTileOrigin(TINY_TOWN_RENDERING_TILE, 2));
    expect(rendering.room).toEqual(TINY_TOWN_RENDERING_ROOM);
    expect(water.water).toEqual(TINY_TOWN_WATER_AREA);
    expect(navigation.isWaterAt(gameplayTile(TINY_TOWN_WATER_TILE.x, TINY_TOWN_WATER_TILE.y))).toBe(true);
    expect(navigation.isWaterAt(gameplayTile(TINY_TOWN_WATER_TILE.x - 2, TINY_TOWN_WATER_TILE.y))).toBe(false);
    expect(navigation.isPavementAt(gameplayTile(TINY_TOWN_ROAD_TILE.x, TINY_TOWN_ROAD_TILE.y, 2))).toBe(false);
    expect(source.map[TINY_TOWN_ROAD_TILE.x]?.[TINY_TOWN_ROAD_TILE.y]?.[1]?.groundType).toBe(1);
  });

  it('keeps every added gameplay path selectable', () => {
    expect(GAMEPLAY_SCENARIOS.map(scenario => scenario.id)).toEqual([
      'jump-over-car', 'npc-jump-over-car', 'player-car-impact', 'npc-car-impact',
      'player-water', 'driver-water', 'npc-water', 'tiny-town-rendering',
    ]);
    const tinyTown = GAMEPLAY_SCENARIOS.find(scenario => scenario.id === 'tiny-town-rendering');
    expect(tinyTown?.arrange.actors.filter(actor => actor.kind === 'vehicle').map(actor => ({
      label: actor.label,
      x: actor.placement.x,
      y: actor.placement.y,
      z: actor.placement.z,
    }))).toEqual([
      { label: 'Slope', x: -132.04, y: -62.54, z: 2.47 },
      { label: 'Under bridge · left', x: -411.88, y: 5.83, z: 2 },
      { label: 'Over bridge · left', x: -240.82, y: 37.05, z: 4 },
      { label: 'Under solid', x: 362.27, y: 88.54, z: 4 },
      { label: 'Captured position', x: -65.74, y: -135.39, z: 2.99 },
    ]);
    expect(tinyTown?.arrange.actors.find(actor => actor.id === 'solid-under-car')?.placement.rotation).toBe(0);
    expect(tinyTown?.arrange.actors.find(actor => actor.id === 'bridge-under-car')?.placement.rotation).toBe(0);
  });
});
