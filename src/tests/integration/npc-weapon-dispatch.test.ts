import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { WeaponId } from '../../shared/domain/combat/weapons';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { NpcState, TrafficState } from '../../shared/protocol/types';
import { mapFixture, npcDefaults } from '../unit/fixtures';

const vehicleState = (model: number, id = 7): TrafficState => ({
  id, model, x: 0, y: 0, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0,
  throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: ['npc:1'],
  occupants: [{ id: 'npc:1', door: 0, state: 'seated', progress: 1 }], doorStates: [], health: 100,
});

const npcState = (vehicleId: number): NpcState => ({
  ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100,
  kind: 'police', state: 'attack', animation: 'armed', target: 'target', vehicleId,
});

it('keeps mounted NPC firing server-authoritative while replicating the shot to a client', () => {
  const server = new GameWorld(parseMap(mapFixture()));
  const target = server.addPlayer('target');
  target.wanted = 5;
  server.restore({ ...target, y: target.y + 256 });
  const vehicle = vehicleState(54);
  vehicle.x = target.x;
  vehicle.y = target.y - 256;
  vehicle.z = target.z;
  const npc = npcState(vehicle.id);
  npc.x = vehicle.x;
  npc.y = vehicle.y;
  npc.z = vehicle.z;
  server.restoreWorld([], [vehicle], [], [npc]);
  server.setPoliceAttackPlayer(true);

  server.step(new Map());

  expect(server.gameState.npcStates[0]?.weapon).toBe(WeaponId.TankMainGun);
  expect(server.gameObjects.projectiles.some(projectile => projectile.state.actor === 'npc:1')).toBe(true);
  const playerSnapshot = server.snapshot().find(player => player.id === target.id);
  expect(playerSnapshot).toBeDefined();
  const worldSnapshot = server.snapshotWorld();

  const client = new GameWorld(parseMap(mapFixture()), target.id);
  client.addPlayer(target.id);
  client.restore(playerSnapshot!);
  client.restoreWorld(worldSnapshot.pickups, worldSnapshot.traffic, worldSnapshot.hazards, worldSnapshot.npcs);
  expect(client.gameObjects.projectiles.some(projectile => projectile.state.actor === 'npc:1')).toBe(true);

  client.step(new Map());
  expect(client.events.some(event => event.type === 'shot' && event.actor === 'npc:1')).toBe(false);

  for (let tick = 0; tick < 12; tick++) server.step(new Map());
  expect(server.gameState.playerStates.get(target.id)?.combat.health).toBeLessThan(100);
});
