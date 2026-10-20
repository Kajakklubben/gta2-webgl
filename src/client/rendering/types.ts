import type { HazardState, PickupState, PlayerState, TrafficState } from '../../shared/protocol/types';
import type { GameObject } from '../../shared/game/gameobjects/gameobject';

/** A named client presentation boundary; avoids positional world-state drift. */
export interface DebugDrawGroups {
  pedestrianGraph: boolean;
  traffic: boolean;
  car: boolean;
  zones: boolean;
  vehicleDoors: boolean;
  closestDoor: boolean;
}

export interface RenderFrame {
  readonly now: number;
  readonly localId: string;
  /** Freeze presentation clocks while a local match is paused. */
  readonly paused?: boolean;
  /** Additional local players rendered in split-screen mode. */
  readonly localIds?: readonly string[];
  readonly players: readonly PlayerState[];
  readonly pickups?: readonly PickupState[];
  readonly traffic?: readonly TrafficState[];
  readonly hazards?: readonly HazardState[];
  readonly objects?: Iterable<GameObject<any>>;
}
