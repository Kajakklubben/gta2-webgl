/**
 * Compatibility views for the vehicle scenario renderer.
 *
 * The authoring source for every scenario is the unified registry in
 * `domain/scenario-definitions.ts`. These views keep the vehicle editor's
 * existing door/seat code focused on vehicle-specific concerns.
 */

import { rotateVehicleLocal } from '../../../shared/domain/vehicles/vehicle-occupancy';
import {
  VEHICLE_ENTRY_SCENARIO_DEFINITIONS,
  VEHICLE_ENTRY_SCENARIO_IDS,
  VEHICLE_EXIT_SCENARIO_DEFINITIONS,
  VEHICLE_EXIT_SCENARIO_IDS,
  type ScenarioPlacement,
} from './scenario-definitions';

export const ENTRY_SCENARIO_IDS = VEHICLE_ENTRY_SCENARIO_IDS;
export type VehicleEntryScenarioId = typeof ENTRY_SCENARIO_IDS[number];
export const EXIT_SCENARIO_IDS = VEHICLE_EXIT_SCENARIO_IDS;
export type VehicleExitScenarioId = typeof EXIT_SCENARIO_IDS[number];
export const ENTRY_APPROACHES = ['left', 'right', 'front', 'rear'] as const;
export type VehicleEntryApproach = typeof ENTRY_APPROACHES[number];
export type { ScenarioPlacement };

/**
 * Keep the replay selector focused on useful combinations. The full approach
 * set remains available to the runtime and matrix tests, but the page does not
 * need to list equivalent choices for every authored scenario.
 */
export const ENTRY_SCENARIO_APPROACHES = {
  clear: ['left', 'right', 'front', 'rear'],
  'left-blocked': ['left', 'right'],
  'right-blocked': ['right', 'left'],
  'both-blocked': ['left'],
  'front-blocked': ['front', 'rear'],
  'rear-blocked': ['rear', 'front'],
  'driver-occupied': ['left'],
  full: ['left'],
  locked: ['left'],
} as const satisfies Record<VehicleEntryScenarioId, readonly VehicleEntryApproach[]>;

/** Stable value used by the single scenario selector for entry runs. */
export function scenarioOptionValue(scenario: VehicleEntryScenarioId | VehicleExitScenarioId, approach?: VehicleEntryApproach) {
  if (approach !== undefined && (ENTRY_SCENARIO_IDS as readonly string[]).includes(scenario)) return `${scenario}|${approach}`;
  return scenario;
}

export interface VehicleEntryScenario {
  readonly id: VehicleEntryScenarioId;
  readonly title: string;
  readonly description: string;
  readonly vehicle: ScenarioPlacement;
  readonly blockades: readonly ScenarioPlacement[];
  readonly player: Readonly<Record<VehicleEntryApproach, ScenarioPlacement>>;
  readonly occupiedSeats: readonly number[] | 'all';
  readonly locked?: boolean;
}

export interface VehicleExitScenario {
  readonly id: VehicleExitScenarioId;
  readonly title: string;
  readonly description: string;
  readonly vehicle: ScenarioPlacement;
  readonly blockades: readonly ScenarioPlacement[];
  /** Seat to exit; seat zero is the authored driver seat. */
  readonly exitSeat: number;
}

type ScenarioActorView = { readonly kind: string; readonly placement: ScenarioPlacement };
type ScenarioVariantView = { readonly id: string; readonly actors: readonly ScenarioActorView[] };

function variant(definition: { readonly arrange: { readonly actors: readonly ScenarioActorView[]; readonly variants?: readonly ScenarioVariantView[] } }, id: string) {
  const variants = definition.arrange.variants ?? [{ id: 'default', actors: definition.arrange.actors }];
  return variants.find(candidate => candidate.id === id) ?? variants[0]!;
}

function vehiclePlacement(actors: readonly ScenarioActorView[]) {
  return actors.find(actor => actor.kind === 'vehicle')?.placement ?? { x: 0, y: 0, rotation: 0 };
}

function blockadePlacements(actors: readonly ScenarioActorView[]) {
  return actors.filter(actor => actor.kind === 'blockade').map(actor => actor.placement);
}

function toVehicleEntryScenario(definition: (typeof VEHICLE_ENTRY_SCENARIO_DEFINITIONS)[number]): VehicleEntryScenario {
  const players = Object.fromEntries(ENTRY_APPROACHES.map(approach => {
    const actors = variant(definition, approach).actors;
    return [approach, actors.find(actor => actor.kind === 'player')?.placement ?? { x: 0, y: 0 }];
  })) as Readonly<Record<VehicleEntryApproach, ScenarioPlacement>>;
  const actors = variant(definition, ENTRY_APPROACHES[0]).actors;
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    vehicle: vehiclePlacement(actors),
    blockades: blockadePlacements(actors),
    player: players,
    occupiedSeats: definition.arrange.occupiedSeats ?? [],
    ...(definition.arrange.locked ? { locked: true } : {}),
  };
}

function toVehicleExitScenario(definition: (typeof VEHICLE_EXIT_SCENARIO_DEFINITIONS)[number]): VehicleExitScenario {
  const actors = variant(definition, 'default').actors;
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    vehicle: vehiclePlacement(actors),
    blockades: blockadePlacements(actors),
    exitSeat: definition.act.exitSeat,
  };
}

export const VEHICLE_ENTRY_SCENARIOS: readonly VehicleEntryScenario[] = VEHICLE_ENTRY_SCENARIO_DEFINITIONS.map(toVehicleEntryScenario);
export const VEHICLE_EXIT_SCENARIOS: readonly VehicleExitScenario[] = VEHICLE_EXIT_SCENARIO_DEFINITIONS.map(toVehicleExitScenario);

export function vehicleEntryScenario(id: VehicleEntryScenarioId) {
  return VEHICLE_ENTRY_SCENARIOS.find(scenario => scenario.id === id) ?? VEHICLE_ENTRY_SCENARIOS[0]!;
}

export function vehicleExitScenario(id: VehicleExitScenarioId) {
  return VEHICLE_EXIT_SCENARIOS.find(scenario => scenario.id === id) ?? VEHICLE_EXIT_SCENARIOS[0]!;
}

export function scenarioSeatSet(scenario: VehicleEntryScenario, seatCount: number) {
  if (scenario.occupiedSeats === 'all') return new Set(Array.from({ length: seatCount }, (_, index) => index));
  return new Set(scenario.occupiedSeats.filter(index => index >= 0 && index < seatCount));
}

export function scenarioWorldPlacement(origin: { x: number; y: number }, placement: ScenarioPlacement, vehicleRotation = 0) {
  const rotation = vehicleRotation + (placement.rotation ?? 0);
  const offset = rotateVehicleLocal(placement.x, placement.y, vehicleRotation);
  return {
    x: origin.x + offset.x,
    y: origin.y + offset.y,
    rotation,
  };
}
