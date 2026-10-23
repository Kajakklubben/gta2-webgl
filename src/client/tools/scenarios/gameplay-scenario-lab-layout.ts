import type { GameMap } from '../../../shared/engine/loader/map-parser';
import { tileToWorld } from '../../../shared/domain/world/world';
import { GAMEPLAY_SCENARIO_DEFINITIONS, type GameplayScenarioDefinition, type GameplayScenarioId } from './scenario-definitions';
import { createScenarioLevel, type ScenarioLevel } from './scenario-view';

export type { GameplayScenarioDefinition, GameplayScenarioId } from './scenario-definitions';
export type GameplayLevelId = 'road' | 'water' | 'tiny-town';

export type GameplayScenarioLevel = ScenarioLevel;

export const GAMEPLAY_SCENARIOS: readonly GameplayScenarioDefinition[] = GAMEPLAY_SCENARIO_DEFINITIONS;

export function gameplayScenario(id: GameplayScenarioId) {
  return GAMEPLAY_SCENARIOS.find(scenario => scenario.id === id) ?? GAMEPLAY_SCENARIOS[0]!;
}

/** Place gameplay replays on authored Tiny Town road/water/rendering cells. */
export function createGameplayScenarioLevel(source: GameMap, kind: GameplayLevelId): GameplayScenarioLevel {
  return createScenarioLevel(source, kind);
}

export function gameplayTile(x: number, y: number, z = 1) {
  return { x: tileToWorld(x), y: -tileToWorld(y), z };
}
