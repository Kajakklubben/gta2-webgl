import { expect, it } from 'vitest';
import { trafficDebugLabelText } from '../../client/rendering/renderer-debug';
import type { TrafficState } from '../../shared/protocol/types';

const traffic: TrafficState = {
  id: 7, x: 100, y: -200, z: 1, rotation: 0, speed: 84, color: 0, health: 92,
  model: 12, vx: 84, vy: 0, angularVelocity: 0, throttle: .75, brakePressure: .25, handbrakeForce: 0,
  aiState: 'yield', routeNode: 14, targetNode: 19, junction: 3, signal: 'red', transport: 'bus',
  serviceStop: 42, pursuitTarget: 'player-1', passengers: ['npc:1'], occupants: [], doorStates: [], brakeLights: true,
};

it('formats traffic AI metadata for the traffic debug overlay', () => {
  expect(trafficDebugLabelText(traffic)).toEqual([
    'car 7 · model 12 · ai yield',
    'route 14 → target 19 · speed 84',
    'throttle 0.75 · brake 0.25 · handbrake 0.00',
    'health 92 · junction 3 · signal red · bus stop 42 · pursuit player-1 · occupants 1 · braking',
  ]);
});
