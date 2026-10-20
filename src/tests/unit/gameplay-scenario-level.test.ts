import { describe, expect, it } from 'vitest';
import { PedestrianNavigation } from '../../shared/domain/pedestrians/pedestrian-navigation';
import { parseMap } from '../../shared/loader/map-parser';
import { createGameplayScenarioLevel, gameplayTile, GAMEPLAY_SCENARIOS } from '../../client/tools/scenarios/gameplay-scenario-lab-layout';
import { mapFixture } from './fixtures';

describe('debug gameplay scenario levels', () => {
  it('exposes a real pavement room and a known water-lid dock band', () => {
    const source = parseMap(mapFixture());
    const road = createGameplayScenarioLevel(source, 'road');
    const water = createGameplayScenarioLevel(source, 'water');
    const navigation = new PedestrianNavigation(water.level);

    expect(road.water).toBeUndefined();
    expect(water.water).toEqual({ minX: 128, maxX: 130, minY: 122, maxY: 134 });
    expect(navigation.isWaterAt(gameplayTile(129, 128))).toBe(true);
    expect(navigation.isWaterAt(gameplayTile(127, 128))).toBe(false);
    expect(navigation.isPavementAt(gameplayTile(127, 128))).toBe(true);
    expect(water.level.map[129]?.[128]?.[0]?.groundType).toBe(0);
    expect(water.level.map[127]?.[128]?.[0]?.groundType).toBe(2);
  });

  it('keeps every added gameplay path selectable', () => {
    expect(GAMEPLAY_SCENARIOS.map(scenario => scenario.id)).toEqual([
      'jump-over-car', 'npc-jump-over-car', 'player-car-impact', 'npc-car-impact',
      'player-water', 'driver-water', 'npc-water',
    ]);
  });
});
