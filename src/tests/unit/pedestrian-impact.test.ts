import { describe, expect, it } from 'vitest';
import { isLethalPedestrianImpact, sourcePedestrianImpact } from '../../shared/domain/physics/pedestrian-impact';
import { WORLD } from '../../shared/domain/world/world';

describe('decompiled pedestrian/car impact bands', () => {
  it('clamps small moving impacts to Char_B4 run speed', () => {
    expect(sourcePedestrianImpact(0)).toBe(WORLD.vehicle.pedestrianImpact.minimum);
    expect(sourcePedestrianImpact(80)).toBe(WORLD.vehicle.pedestrianImpact.minimum);
  });

  it('kills an ordinary NPC at the source 0x666 band', () => {
    expect(isLethalPedestrianImpact(WORLD.vehicle.pedestrianImpact.npcLethal - 1, 'npc')).toBe(false);
    expect(isLethalPedestrianImpact(WORLD.vehicle.pedestrianImpact.npcLethal, 'npc')).toBe(true);
  });

  it('keeps the player middle band dependent on the car driver', () => {
    const middle = WORLD.vehicle.pedestrianImpact.playerDriverLethal;
    expect(isLethalPedestrianImpact(middle, 'player', false)).toBe(false);
    expect(isLethalPedestrianImpact(middle, 'player', true)).toBe(true);
    expect(isLethalPedestrianImpact(WORLD.vehicle.pedestrianImpact.playerLethal, 'player', false)).toBe(true);
  });
});
