import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap, decodeFace } from '../../shared/engine/loader/map-parser';
import { mapFixture } from './fixtures';
import { WeaponId } from '../../shared/domain/combat/weapons';

function setup() {
  const sim = new GameWorld(parseMap(mapFixture()));
  const shooter = sim.addPlayer('shooter'); const target = sim.addPlayer('target');
  sim.restore({ ...shooter, z: 4 });
  sim.restore({ ...target, y: shooter.y + 100, z: 4 });
  return { sim, shooter, target };
}
it('fires in facing direction, consumes ammo, respects cooldown, and respawns a defeated player', () => {
  const { sim, shooter, target } = setup();
  sim.step(new Map([['shooter', 16]]));
  expect(target.combat!.health).toBe(80);
  expect(shooter.combat!.ammo[0]).toBe(59);
  sim.step(new Map([['shooter', 16]]));
  expect(target.combat!.health).toBe(80);
  for (let i = 0; i < 90; i++) sim.step(new Map([['shooter', 16]]));
  expect(target.combat!.health).toBe(0);
  for (let i = 0; i < 90; i++) sim.step(new Map());
  expect(target.combat!.health).toBe(100);
  expect(target.combat!.respawn).toBe(0);
});
it('switches once per press and cannot fire with empty ammunition', () => {
  const { sim, shooter } = setup();
  sim.step(new Map([['shooter', 64]])); sim.step(new Map([['shooter', 64]]));
  expect(shooter.combat!.weapon).toBe(WeaponId.None);
  shooter.combat!.ammo[1] = 0;
  sim.step(new Map([['shooter', 16]]));
  expect(shooter.combat!.shots).toHaveLength(0);
});
it('stops shots at walls and ignores players on another floor', () => {
  const { sim, shooter, target } = setup();
  // World ray starts at the same spawn and points toward decreasing map Y.
  sim.level.map[85]![189]![4] = { ...sim.level.map[85]![190]![3]!, Bottom: decodeFace(1024) };
  const blocked = new GameWorld(sim.level);
  blocked.addPlayer('shooter', shooter); blocked.addPlayer('target', target);
  blocked.step(new Map([['shooter', 16]]));
  expect(blocked.gameState.playerStates.get('target')!.combat!.health).toBe(100);
  expect(blocked.gameState.playerStates.get('shooter')!.combat!.shots![0]!.endY - shooter.y).toBeLessThan(40);
  sim.restore({ ...target, z: 6 }); sim.step(new Map([['shooter', 16]]));
  expect(target.combat!.health).toBe(100);
});
it('applies authoritative snapshots without local replay', () => {
  const { sim, shooter, target } = setup();
  sim.step(new Map([[shooter.id, 16]]));
  const authoritative = sim.snapshot();
  const client = new GameWorld(sim.level, shooter.id);
  for (const state of authoritative) client.addPlayer(state.id, state);
  expect(client.gameState.playerStates.get(shooter.id)!.combat!.ammo[0]).toBe(59);
  expect(client.gameState.playerStates.get(target.id)!.combat!.health).toBe(80);
  authoritative.find(state => state.id === shooter.id)!.combat!.ammo[0] = 0;
  expect(shooter.combat!.ammo[0]).toBe(59);
});
