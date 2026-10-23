import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import { mapFixture, npcDefaults } from '../unit/fixtures';
import type { NpcState } from '../../shared/protocol/types';

it('exposes the complete GTA2 weapon roster with finite starting ammunition', () => {
  expect(WEAPONS.map(weapon => weapon.name)).toEqual([
    'Pistol', 'Machine gun', 'Flamethrower', 'Rocket launcher', 'Molotov cocktail',
    'Silenced gun', 'Oil slicks', 'Machine gun car', 'Grenade', 'Stun gun',
    'Shotgun', 'Land mines', 'Electro-shock', 'Dual shot pistol',
    'Car bomb', 'Tank cannon', 'Fire truck gun', 'Fire truck flamethrower',
    'Army jeep gun', 'Special car bomb',
  ]);
  expect(WEAPONS.every(weapon => weapon.ammo > 0 && weapon.range > 0)).toBe(true);
});

it('starts with only the base pistol loaded', () => {
  const combat = new GameWorld(parseMap(mapFixture())).addPlayer('one').combat!;
  expect(combat.weapon).toBe(0);
  expect(combat.ammo[0]).toBe(WEAPONS[0]!.ammo);
  expect(combat.ammo.slice(1)).toEqual(new Array(WEAPONS.length - 1).fill(0));
});

it('does not invent pickup locations or autonomous traffic', () => {
  const first = new GameWorld(parseMap(mapFixture())), second = new GameWorld(parseMap(mapFixture()));
  expect(first.gameState.pickupStates).toHaveLength(0);
  expect(first.gameState.vehicleStates).toHaveLength(0);
  expect(first.gameState.pickupStates).toEqual(second.gameState.pickupStates);
  expect(first.gameState.vehicleStates).toEqual(second.gameState.vehicleStates);
  first.step(new Map());
  expect(first.gameState.vehicleStates).toHaveLength(0);
});

it('does not let police attack players', () => {
  const game = new GameWorld(parseMap(mapFixture()));
  const player = game.addPlayer('player');
  player.wanted = 5;
  const police: NpcState = {
    ...npcDefaults(),
    id: 1,
    x: player.x + 32,
    y: player.y,
    z: player.z,
    rotation: Math.PI,
    vx: 0,
    vy: 0,
    health: 100,
    kind: 'police',
    state: 'walk',
    animation: 'walking',
    weapon: 5,
    weaponAmmo: 100,
    weaponCooldown: 0,
  };
  game.restoreWorld([], [], [], [police]);

  game.runCombatPhase({ state: { playerOnly: false, inputs: new Map() } });

  expect(game.events.some(event => event.type === 'shot' && event.actor === 'npc:1')).toBe(false);
  expect(player.combat.health).toBe(100);
});

it('allows the police attack debug toggle to be enabled per world', () => {
  const game = new GameWorld(parseMap(mapFixture()));
  const player = game.addPlayer('player');
  player.wanted = 5;
  const police: NpcState = {
    ...npcDefaults(),
    id: 1,
    x: player.x,
    y: player.y + 32,
    z: player.z,
    rotation: Math.PI,
    vx: 0,
    vy: 0,
    health: 100,
    kind: 'police',
    state: 'walk',
    animation: 'walking',
    weapon: 5,
    weaponAmmo: 100,
    weaponCooldown: 0,
  };
  game.restoreWorld([], [], [], [police]);

  game.setPoliceAttackPlayer(true);
  game.runCombatPhase({ state: { playerOnly: false, inputs: new Map() } });

  expect(game.events.some(event => event.type === 'shot' && event.actor === 'npc:1')).toBe(true);
  expect(game.gameState.npcStates[0]?.state).toBe('attack');

  game.setPoliceAttackPlayer(false);
  expect(game.gameState.npcStates[0]?.state).toBe('walk');
  expect(game.gameState.npcStates[0]?.target).toBeUndefined();
});

