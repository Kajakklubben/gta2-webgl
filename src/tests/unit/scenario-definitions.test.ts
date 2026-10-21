import { describe, expect, test } from 'vitest';
import {
  GAMEPLAY_SCENARIO_DEFINITIONS,
  SCENARIO_DEFINITIONS,
  VEHICLE_ENTRY_SCENARIO_DEFINITIONS,
  VEHICLE_EXIT_SCENARIO_DEFINITIONS,
} from '../../client/tools/scenarios/scenario-definitions';

describe('unified scenario definitions', () => {
  test('stores vehicle and gameplay cases in one registry shape', () => {
    const ids = SCENARIO_DEFINITIONS.map(scenario => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCENARIO_DEFINITIONS).toHaveLength(
      VEHICLE_ENTRY_SCENARIO_DEFINITIONS.length + VEHICLE_EXIT_SCENARIO_DEFINITIONS.length + GAMEPLAY_SCENARIO_DEFINITIONS.length,
    );
    for (const scenario of SCENARIO_DEFINITIONS) {
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.arrange.actors.length).toBeGreaterThan(0);
      expect(scenario.act.maxTicks).toBeGreaterThan(0);
      expect(scenario.assert.expected.length).toBeGreaterThan(0);
      expect(scenario.assert.completion).toBeDefined();
      for (const variant of scenario.arrange.variants ?? []) {
        expect(variant.actors.length).toBeGreaterThan(0);
      }
    }
  });
});
