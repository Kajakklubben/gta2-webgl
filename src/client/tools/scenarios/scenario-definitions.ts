export const VEHICLE_ENTRY_SCENARIO_IDS = [
  'clear',
  'left-blocked',
  'right-blocked',
  'both-blocked',
  'front-blocked',
  'rear-blocked',
  'driver-occupied',
  'full',
  'locked',
] as const;

export const VEHICLE_EXIT_SCENARIO_IDS = ['exit-clear', 'exit-blocked', 'exit-all-blocked'] as const;
export const GAMEPLAY_SCENARIO_IDS = [
  'jump-over-car',
  'npc-jump-over-car',
  'player-car-impact',
  'npc-car-impact',
  'player-water',
  'driver-water',
  'npc-water',
  'tiny-town-rendering',
] as const;

export type VehicleEntryScenarioId = typeof VEHICLE_ENTRY_SCENARIO_IDS[number];
export type VehicleExitScenarioId = typeof VEHICLE_EXIT_SCENARIO_IDS[number];
export type GameplayScenarioId = typeof GAMEPLAY_SCENARIO_IDS[number];
export type ScenarioId = VehicleEntryScenarioId | VehicleExitScenarioId | GameplayScenarioId;
export type ScenarioKind = 'vehicle-entry' | 'vehicle-exit' | 'gameplay';
export type ScenarioLevelId = 'entry' | 'road' | 'water' | 'tiny-town';
export type ScenarioActorKind = 'player' | 'npc' | 'vehicle' | 'blockade';
export type ScenarioInput = 'none' | 'jump-right' | 'drive-right';
export type VehicleEntryCompletion = 'vehicle-entry-succeeds' | 'vehicle-entry-rejected';
export type VehicleExitCompletion = 'vehicle-exit-succeeds' | 'vehicle-exit-rejected';
export type GameplayScenarioCompletion =
  | 'jump-over-car'
  | 'npc-jump-over-car'
  | 'player-car-impact'
  | 'npc-car-impact'
  | 'player-water'
  | 'driver-water'
  | 'npc-water'
  | 'tiny-town-rendering';
export type ScenarioCompletion = VehicleEntryCompletion | VehicleExitCompletion | GameplayScenarioCompletion;

export interface ScenarioPlacement {
  /** World-pixel offset from the scenario origin. */
  readonly x: number;
  readonly y: number;
  /** Optional authored support height in continuous map-layer units. */
  readonly z?: number;
  readonly rotation?: number;
}

export interface ScenarioVelocity {
  readonly x: number;
  readonly y: number;
}

export interface ScenarioActorDefinition {
  readonly id: string;
  readonly kind: ScenarioActorKind;
  readonly placement: ScenarioPlacement;
  readonly runtimeId?: number;
  readonly model?: number | 'selected';
  readonly label?: string;
  readonly velocity?: ScenarioVelocity;
  /** Initial vehicle control state for a replayed moving chassis. */
  readonly throttle?: number;
  readonly brakePressure?: number;
  readonly handbrakeForce?: number;
  readonly driver?: string;
  readonly vehicleId?: number;
}

export interface ScenarioArrange {
  /** Default actor setup. Alternate setups are listed in `variants`. */
  readonly actors: readonly ScenarioActorDefinition[];
  readonly variants?: readonly ScenarioVariantDefinition[];
  /** Use the authored vehicle catalog instead of the replay fallback chassis. */
  readonly vehicleCatalog?: boolean;
  readonly occupiedSeats?: readonly number[] | 'all';
  readonly locked?: boolean;
}

export interface ScenarioAct {
  readonly action?: 'enter' | 'exit';
  readonly exitSeat?: number;
  readonly input?: ScenarioInput;
  readonly inputActor?: string;
  readonly maxTicks: number;
}

export interface ScenarioAssert {
  readonly expected: string;
  readonly completion?: ScenarioCompletion;
}

export interface ScenarioVariantDefinition {
  readonly id: string;
  readonly actors: readonly ScenarioActorDefinition[];
}

export interface ScenarioDefinitionBase {
  readonly title: string;
  readonly description: string;
  readonly level: ScenarioLevelId;
  readonly arrange: ScenarioArrange;
  readonly act: ScenarioAct;
  readonly assert: ScenarioAssert;
}

export interface VehicleEntryScenarioDefinition extends ScenarioDefinitionBase {
  readonly id: VehicleEntryScenarioId;
  readonly kind: 'vehicle-entry';
  readonly level: 'entry';
  readonly act: ScenarioAct & { readonly action: 'enter' };
  readonly assert: ScenarioAssert & { readonly completion: VehicleEntryCompletion };
}

export interface VehicleExitScenarioDefinition extends ScenarioDefinitionBase {
  readonly id: VehicleExitScenarioId;
  readonly kind: 'vehicle-exit';
  readonly level: 'entry';
  readonly act: ScenarioAct & { readonly action: 'exit'; readonly exitSeat: number };
  readonly assert: ScenarioAssert & { readonly completion: VehicleExitCompletion };
}

export interface GameplayScenarioDefinition extends ScenarioDefinitionBase {
  readonly id: GameplayScenarioId;
  readonly kind: 'gameplay';
  readonly level: 'road' | 'water' | 'tiny-town';
  readonly assert: ScenarioAssert & { readonly completion: GameplayScenarioCompletion };
}

export type ScenarioDefinition = VehicleEntryScenarioDefinition | VehicleExitScenarioDefinition | GameplayScenarioDefinition;

export {
  GAMEPLAY_SCENARIO_DEFINITIONS,
  SCENARIO_DEFINITIONS,
  VEHICLE_ENTRY_SCENARIO_DEFINITIONS,
  VEHICLE_EXIT_SCENARIO_DEFINITIONS,
  scenarioDefinition,
} from './scenario-definition-data';
