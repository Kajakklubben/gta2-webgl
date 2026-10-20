import { describe, expect, it } from 'vitest';
import { buildPlayerInput, createPlayerInputState, queueVehicleEntryRequest } from '../../client/app/player-input';

const noTransitions = () => [];

describe('local player input', () => {
  it('keeps an explicit vehicle target on every retry pulse', () => {
    const player = createPlayerInputState('local-player', { ArrowUp: 1 });
    queueVehicleEntryRequest(player, 42);

    const inputs = [
      buildPlayerInput(player, { gamepadMask: 0, gamepadActions: 0, controlTransitions: noTransitions }),
      buildPlayerInput(player, { gamepadMask: 0, gamepadActions: 0, controlTransitions: noTransitions }),
      buildPlayerInput(player, { gamepadMask: 0, gamepadActions: 0, controlTransitions: noTransitions }),
    ];

    expect(inputs.map(input => input.vehicleId)).toEqual([42, 42, 42]);
    expect(inputs.every(input => input.action === 'enter')).toBe(true);
    expect(player.vehiclePulses).toBe(0);
    expect(player.vehicleTarget).toBeUndefined();
  });

  it('uses the same entry behavior for every local player state', () => {
    const players = ['local-player-a', 'local-player-b'].map(id => createPlayerInputState(id, { ArrowUp: 1 }));

    for (const player of players) {
      queueVehicleEntryRequest(player, 7);
      const input = buildPlayerInput(player, { gamepadMask: 0, gamepadActions: 0, controlTransitions: noTransitions });
      expect(input).toMatchObject({ action: 'enter', vehicleId: 7 });
    }
  });
});
