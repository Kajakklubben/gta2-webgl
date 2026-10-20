import { WORLD } from '../world/world';

export type PedestrianImpactTarget = 'player' | 'npc';

/**
 * Source Char_B4::HandleCarImpact_5538A0 clamps the impulse before selecting
 * the knockdown/death branch.  The collision adapter measures a world-space
 * incoming speed, so this function is the single conversion point for that
 * source rule.
 */
export function sourcePedestrianImpact(impact: number) {
  return Math.max(WORLD.vehicle.pedestrianImpact.minimum, Math.max(0, impact));
}

/**
 * Return the source lethal branch for a car impact.
 *
 * Ordinary peds take the lethal branch at kFpPoint1. Players have the special
 * middle band from dword_6FD82C to kFpPoint3: a player-driven car kills there,
 * while an AI or empty car only knocks the player down. Above kFpPoint3 every
 * non-invulnerable player is killed.
 */
export function isLethalPedestrianImpact(
  impact: number,
  target: PedestrianImpactTarget,
  driverIsPlayer = false,
  alreadyDown = false,
) {
  if (alreadyDown) return true;
  const value = sourcePedestrianImpact(impact);
  if (target === 'npc') return value >= WORLD.vehicle.pedestrianImpact.npcLethal;
  return value >= WORLD.vehicle.pedestrianImpact.playerLethal ||
    (driverIsPlayer && value >= WORLD.vehicle.pedestrianImpact.playerDriverLethal);
}
