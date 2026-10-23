import type { PresentationBand, PresentationSlot } from '../../engine/presentation-order';
import { GTA2SlopeType } from './gta2-enums';

/**
 * The authored map has eight vertical layers. A slope belongs to the map
 * group below its block layer because its visible ramp surface starts at that
 * lower support plane.
 */
export const GTA2_MAP_LAYER_COUNT = 8;

export function gta2MapDrawLevel(blockLayer: number, slopeType: number) {
  const slopeOffset = slopeType === GTA2SlopeType.Flat ? 0 : 1;
  return Math.max(0, Math.min(GTA2_MAP_LAYER_COUNT - 1, blockLayer - slopeOffset));
}

export const GTA2_PRESENTATION_PRIORITIES = {
  mapObject: 0,
  ground: 2,
  pickup: 4,
  water: 5,
  fire: 6,
  fireTrail: 7,
  impact: 8,
  behindVehicle: 13,
  npc: 14,
  vehicle: 15,
  vehicleFire: 16,
  effect: 18,
  explosion: 20,
  player: 23,
  overlay: 50,
} as const;

export interface Gta2PresentationInput {
  readonly kind: string;
  readonly mapLevel?: number | undefined;
  readonly animation?: string | undefined;
  readonly sourceSequence?: string | undefined;
  readonly slot?: PresentationSlot | undefined;
}

export interface ResolvedGta2PresentationSlot {
  readonly mapLevel: number;
  readonly band: PresentationBand;
  readonly priority: number;
  readonly elevation: number;
}

const SOURCE_SEQUENCE_PRIORITIES: Readonly<Record<string, number>> = {
  'rocket-trail': GTA2_PRESENTATION_PRIORITIES.effect,
  'electric-arc': GTA2_PRESENTATION_PRIORITIES.effect,
  'fire-trail': GTA2_PRESENTATION_PRIORITIES.fireTrail,
  'water-splash': GTA2_PRESENTATION_PRIORITIES.water,
  'blood-burst': GTA2_PRESENTATION_PRIORITIES.impact,
  'impact-burst': GTA2_PRESENTATION_PRIORITIES.impact,
  'explosion-small': GTA2_PRESENTATION_PRIORITIES.explosion,
  'explosion-large': GTA2_PRESENTATION_PRIORITIES.explosion,
  'car-fire-small': GTA2_PRESENTATION_PRIORITIES.vehicleFire,
  'car-fire-large': GTA2_PRESENTATION_PRIORITIES.vehicleFire,
  'car-fire-wreck': GTA2_PRESENTATION_PRIORITIES.vehicleFire,
  'ped-fire': GTA2_PRESENTATION_PRIORITIES.fire,
};

function defaultPriority(input: Gta2PresentationInput) {
  if (input.sourceSequence !== undefined) {
    const sequencePriority = SOURCE_SEQUENCE_PRIORITIES[input.sourceSequence];
    if (sequencePriority !== undefined) return sequencePriority;
  }
  if (input.kind === 'map' || input.kind === 'map-object') return GTA2_PRESENTATION_PRIORITIES.mapObject;
  if (input.kind === 'pickup') return GTA2_PRESENTATION_PRIORITIES.pickup;
  if (input.kind === 'vehicle') return GTA2_PRESENTATION_PRIORITIES.vehicle;
  if (input.kind === 'npc') return GTA2_PRESENTATION_PRIORITIES.npc;
  if (input.kind === 'player') return GTA2_PRESENTATION_PRIORITIES.player;
  if (input.kind === 'hazard') {
    if (input.animation === 'fire') return GTA2_PRESENTATION_PRIORITIES.fire;
    if (input.animation === 'water') return GTA2_PRESENTATION_PRIORITIES.water;
    if (input.animation === 'skid' || input.animation === 'slick' || input.animation === 'mine') return GTA2_PRESENTATION_PRIORITIES.ground;
    return GTA2_PRESENTATION_PRIORITIES.effect;
  }
  if (input.kind === 'projectile') return GTA2_PRESENTATION_PRIORITIES.effect;
  return GTA2_PRESENTATION_PRIORITIES.ground;
}

function defaultBand(input: Gta2PresentationInput): PresentationBand {
  if (input.slot?.band !== undefined) return input.slot.band;
  if (input.kind === 'hazard' && (input.animation === 'skid' || input.animation === 'slick' || input.animation === 'mine')) return 'underlay';
  if (input.kind === 'projectile' || input.kind === 'hazard') return 'overlay';
  if (input.kind === 'map') return 'map';
  return 'object';
}

function defaultMapLevel(input: Gta2PresentationInput) {
  return Math.max(0, Math.min(GTA2_MAP_LAYER_COUNT - 1, Math.floor(input.mapLevel ?? 0)));
}

/** Resolve GTA2 semantic presentation intent before a rendering backend runs. */
export function resolveGta2Presentation(input: Gta2PresentationInput): ResolvedGta2PresentationSlot {
  return {
    mapLevel: Math.max(0, Math.min(GTA2_MAP_LAYER_COUNT - 1, Math.floor(input.slot?.mapLevel ?? defaultMapLevel(input)))),
    band: defaultBand(input),
    priority: input.slot?.priority ?? defaultPriority(input),
    elevation: input.slot?.elevation ?? 0,
  };
}
