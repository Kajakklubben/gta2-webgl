import type { Input } from '../../protocol/types';
import type { CollisionContact, CollisionStart } from '../physics/collision-world';
import type { ProjectileObject } from '../effects/projectile';

/** Transitional name retained for phase APIs; projectiles are now owned by
 * their GameObject rather than a parallel raw-state registry. */
export type PendingProjectile = ProjectileObject;

export interface WorldStepOptions {
  /** Advance only the local player's movement and driven vehicle. */
  readonly playerOnly?: boolean;
  /** Override the normal fixed-step duration for slow-motion/debug sessions. */
  readonly stepSeconds?: number;
}

export interface WorldTickState {
  readonly inputs: ReadonlyMap<string, number | Input>;
  readonly playerOnly: boolean;
  reactivated: ReadonlySet<number>;
  vehicleStarts: ReadonlyMap<number, { x: number; y: number; rotation: number }>;
  entityStarts: ReadonlyMap<string, CollisionStart>;
  contacts: readonly CollisionContact[];
}

/** Kept here so systems that only need the NPC collection do not import the
 * full GameWorld orchestrator. */
