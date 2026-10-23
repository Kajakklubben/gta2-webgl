import { describe, expect, it } from 'vitest';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { GameWorld } from '../../shared/game/game-world';
import { loadVehicleBounds } from '../../shared/engine/loader/vehicle-bounds';
import { parseInput } from '../../shared/protocol/validation';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from './fixtures';

function setup() {
  const bounds = loadVehicleBounds([{ model: 7, width: 20, height: 100 }]);
  const game = new GameWorld(parseMap(mapFixture()), 'walker', [], new Map(), [], bounds);
  const vehicle: TrafficState = { id: 1, model: 7, x: 85 * 64, y: -190 * 64, z: 3, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
  game.restoreWorld([], [vehicle]);
  const player = game.addPlayer('walker');
  game.restore({ ...player, x: vehicle.x - 60, y: vehicle.y, z: 4, rotation: -Math.PI / 2 });
  return { game, vehicle: game.gameState.vehicleStates[0]!, player };
}

describe('source-style pedestrian jumping', () => {
  it('accepts the jump action and carries a ped across a car footprint', () => {
    expect(parseInput({ type: 'input', input: { seq: 1, keys: 0, action: 'jump' } })).toMatchObject({ action: 'jump' });
    const { game, vehicle, player } = setup();
    game.step(new Map([['walker', { seq: 1, keys: 0, action: 'jump' as const, moveX: 1, moveY: 0 }]]));
    expect(player.jump?.phase).toBe('rising');
    let highest = 0;
    for (let seq = 2; seq <= 18; seq++) {
      game.step(new Map([['walker', { seq, keys: 0, moveX: 1, moveY: 0 }]]));
      highest = Math.max(highest, player.jump?.height ?? 0);
    }
    expect(highest).toBeGreaterThan(20);
    expect(player.jump).toBeUndefined();
    // The source run/jump velocity is 4 * 256 Fix16 units per tick. At the
    // fixed 30 Hz boundary this can land exactly on the far edge of this
    // compact 20-pixel fixture; touching the edge is already clear of the
    // vehicle footprint.
    expect(player.x).toBeGreaterThanOrEqual(vehicle.x + 20);
    expect(vehicle.health).toBe(100);
  });

  it('keeps a jump on foot only and ignores it while seated in a vehicle', () => {
    const { game, vehicle, player } = setup();
    game.restore({ ...player, x: vehicle.x - 40, y: vehicle.y, z: 4 });
    game.step(new Map([['walker', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
    expect(player.vehicleId).toBe(vehicle.id);
    game.step(new Map([['walker', { seq: 2, keys: 0, action: 'jump' as const }]]));
    expect(player.jump).toBeUndefined();
  });
});
