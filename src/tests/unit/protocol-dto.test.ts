import { describe, expect, it } from 'vitest';
import { toClientPlayer, toClientTraffic } from '../../shared/protocol/client-dto';
import { newCombat } from '../../shared/domain/combat/weapons';

describe('client protocol DTOs', () => {
  it('keeps vehicle integrator state needed for client prediction in snapshots', () => {
    const dto = toClientTraffic({
      id: 4, model: 7, x: 10, y: 20, z: 0, rotation: 0, speed: 12, vx: 0, vy: 0, angularVelocity: 0, color: 3, health: 100,
      throttle: .4, brakePressure: 1, handbrakeForce: 0, damage: 12, damageLevel: 1,
      wreckTimer: 3, fireTicks: 10, collisionCooldown: 2, passengers: [], occupants: [], doorStates: [],
    });
    expect(dto).toMatchObject({ id: 4, model: 7, x: 10, y: 20, speed: 12 });
    expect(dto).toMatchObject({ throttle: .4, brakePressure: 1, handbrakeForce: 0 });
    expect(dto).not.toHaveProperty('damage');
    expect(dto).not.toHaveProperty('wreckTimer');
  });

  it('keeps client-facing player combat and animation state', () => {
    const dto = toClientPlayer({
      id: 'local', x: 1, y: 2, z: 0, rotation: 0, vx: 3, vy: 4,
      combat: { ...newCombat(), weapon: 2, ammo: [0, 10], health: 80, cooldown: 1, previousKeys: 0, respawn: 0, throwCharge: 0, throwing: false },
      animation: { kind: 'seated', progress: 1 }, name: 'Pilot', color: 0xffffff, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0,
    });
    expect(dto.combat.weapon).toBe(2);
    expect(dto.combat.ammo).toEqual([0, 10]);
    expect(dto.animation).toEqual({ kind: 'seated', progress: 1 });
  });

});
