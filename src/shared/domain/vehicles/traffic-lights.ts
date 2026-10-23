import type { MapZone } from '../../engine/loader/models/map';

export type TrafficApproachDirection = 'up' | 'down' | 'left' | 'right';
export type TrafficLightSignal = 'green' | 'red';
export type TrafficLightGreenAxis = 'north-south' | 'east-west' | 'all-red';

export interface TrafficLightPhase {
  readonly index: number;
  readonly elapsed: number;
  readonly remaining: number;
  readonly greenAxis: TrafficLightGreenAxis;
}

/**
 * Source TrafficLights_194 owns one global phase and services every authored
 * traffic-light zone from that phase. Keep the exact source tick durations so
 * the service is independent of rendering and can be shared by server/local
 * worlds. Amber, pedestrian-crossing, and all-red phases are all stopping
 * phases for cars; only the two green phases permit the matching axis.
 */
const SOURCE_PHASES: readonly { duration: number; greenAxis: TrafficLightGreenAxis }[] = [
  { duration: 100, greenAxis: 'north-south' },
  { duration: 24, greenAxis: 'all-red' },
  { duration: 24, greenAxis: 'all-red' },
  { duration: 100, greenAxis: 'east-west' },
  { duration: 24, greenAxis: 'all-red' },
  { duration: 24, greenAxis: 'all-red' },
  { duration: 150, greenAxis: 'all-red' },
  { duration: 80, greenAxis: 'all-red' },
];

const CYCLE_TICKS = SOURCE_PHASES.reduce((sum, phase) => sum + phase.duration, 0);

function phaseForTick(tick: number, offset: number): TrafficLightPhase {
  const normalized = ((tick + offset) % CYCLE_TICKS + CYCLE_TICKS) % CYCLE_TICKS;
  let cursor = 0;
  for (let index = 0; index < SOURCE_PHASES.length; index++) {
    const phase = SOURCE_PHASES[index]!;
    const end = cursor + phase.duration;
    if (normalized < end) return { index, elapsed: normalized - cursor, remaining: end - normalized, greenAxis: phase.greenAxis };
    cursor = end;
  }
  const last = SOURCE_PHASES[SOURCE_PHASES.length - 1]!;
  return { index: SOURCE_PHASES.length - 1, elapsed: last.duration - 1, remaining: 1, greenAxis: last.greenAxis };
}

function isNorthSouth(direction: TrafficApproachDirection) {
  return direction === 'up' || direction === 'down';
}

/**
 * Authoritative traffic-light phase lookup.  The controller deliberately does
 * not know about vehicle ids or choose an independent timer per car.
 */
export class TrafficLightSystem {
  constructor(readonly zones: readonly MapZone[]) {}

  phase(zone: MapZone, tick: number): TrafficLightPhase {
    // `zone` is intentionally accepted so callers can use the same API as
    // `signal`; retail TrafficLights_194 applies the global phase to every
    // registered zone and does not offset intersections independently.
    void zone;
    return phaseForTick(tick, 0);
  }

  signal(zone: MapZone, direction: TrafficApproachDirection, tick: number): TrafficLightSignal {
    const axis = this.phase(zone, tick).greenAxis;
    if (axis === 'all-red') return 'red';
    return (axis === 'north-south') === isNorthSouth(direction) ? 'green' : 'red';
  }

  zoneAt(tileX: number, tileY: number): MapZone | undefined {
    return this.zones.find(zone => tileX >= zone.x && tileX < zone.x + zone.w && tileY >= zone.y && tileY < zone.y + zone.h);
  }

  shouldStop(zone: MapZone | undefined, direction: TrafficApproachDirection, tick: number) {
    return zone !== undefined && this.signal(zone, direction, tick) === 'red';
  }
}

export const trafficLightPhaseDurations = SOURCE_PHASES.map(phase => phase.duration);
