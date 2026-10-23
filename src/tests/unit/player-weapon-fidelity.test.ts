import { expect, it } from 'vitest';
import { LagCompensation } from '../../shared/domain/combat/lag-compensation';
import { GTA2_DUAL_PISTOL_SPREAD, newCombat, sourceWeaponAngleToRadians, WEAPONS, WeaponId } from '../../shared/domain/combat/weapons';
import { WeaponRaycaster, type WeaponRayActor } from '../../shared/domain/combat/weapon-raycaster';
import { WeaponSystem } from '../../shared/domain/combat/weapon-system';
import type { TrafficState } from '../../shared/protocol/types';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture } from './fixtures';
import { HitscanImpactObject } from '../../shared/game/effects/projectile';

function setupPlayers() {
  const game = new GameWorld(parseMap(mapFixture()));
  const shooter = game.addPlayer('shooter');
  const target = game.addPlayer('target');
  game.restore({ ...shooter, z: 4 });
  game.restore({ ...target, y: shooter.y + 100, z: 4 });
  return { game, shooter, target };
}

it('keeps source pickup defaults and the intentional opening pistol inventory distinct', () => {
  expect(newCombat().ammo[WeaponId.Pistol]).toBe(60);
  expect(WEAPONS[WeaponId.Pistol]!.sourceDefaultAmmo).toBe(100);
  expect(WEAPONS[WeaponId.TankMainGun]!.sourceDefaultAmmo).toBe(500);
  expect(WEAPONS[WeaponId.ArmyGunJeep]!.sourceDefaultAmmo).toBe(500);
  expect(WEAPONS[WeaponId.SpecialVehicleBomb]!.maxAmmo).toBe(10);
  expect(WEAPONS[WeaponId.RocketLauncher]!.playerDamage).toBe(10);
  expect(WEAPONS[WeaponId.Molotov]!.playerDamage).toBe(10);
  expect(GTA2_DUAL_PISTOL_SPREAD).toEqual([-48, 48]);
});

it('consumes one source armor charge and absorbs a direct player bullet hit', () => {
  const { game, shooter, target } = setupPlayers();
  target.armor = 1;
  game.step(new Map([[shooter.id, 16]]));
  expect(target.combat!.health).toBe(100);
  expect(target.armor).toBe(0);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', actor: shooter.id, target: target.id, damage: 0, lethal: false }));
});

it('applies the full authoritative pistol damage when the player has no armor charge', () => {
  const { game, shooter, target } = setupPlayers();
  game.step(new Map([[shooter.id, 16]]));
  expect(target.combat!.health).toBe(80);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', actor: shooter.id, target: target.id, damage: 20, lethal: false }));
});

it('consumes armor for a direct NPC-style projectile hit as well as player fire', () => {
  const { game, target } = setupPlayers();
  target.armor = 1;
  const impact = new HitscanImpactObject('npc-pistol-hit', {
    actor: 'npc:7', weapon: WeaponId.Pistol, x: target.x, y: target.y - 100,
    endX: target.x, endY: target.y, z: target.z, life: 1, rotation: 0,
    impact: true, impactTarget: { kind: 'player', id: target.id }, projectileType: 'shock',
  });
  game.registerObject(impact);
  impact.resolveHitscan(game.gameObjectCombatContext());
  expect(target.combat!.health).toBe(100);
  expect(target.armor).toBe(0);
});

it('fires dual pistols from one quarter-forward origin at two source angles', () => {
  const { game, shooter, target } = setupPlayers();
  const angle = sourceWeaponAngleToRadians(48), originX = shooter.x, originY = shooter.y + 16;
  game.restore({ ...target, x: originX - Math.sin(angle) * 100, y: originY + Math.cos(angle) * 100, z: 4 });
  shooter.combat!.weapon = WeaponId.DualShotPistol;
  shooter.combat!.ammo[WeaponId.DualShotPistol] = 2;

  game.step(new Map([[shooter.id, 16]]));

  expect(target.combat!.health).toBe(80);
  expect(shooter.combat!.ammo[WeaponId.DualShotPistol]).toBe(1);
  expect(shooter.wanted).toBe(1);
  expect(shooter.combat!.shots).toHaveLength(2);
  expect(shooter.combat!.shots[0]!.endX).not.toBeCloseTo(shooter.combat!.shots[1]!.endX);
});

const rayActor: WeaponRayActor = { id: 'shooter', x: 0, y: 0, z: 4, vx: 0, vy: 0, rotation: 0, team: 0 };
const rayVehicle: TrafficState = {
  id: 7, x: 0, y: 100, z: 4, rotation: 0, speed: 0, color: 0, health: 100,
  vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0,
  passengers: [], occupants: [], doorStates: [],
};

function raycaster(rayCast: (start: { x: number; y: number }, end: { x: number; y: number }) => number, vehicles: readonly TrafficState[]) {
  return new WeaponRaycaster({
    weaponSystem: new WeaponSystem(), players: () => [], npcs: () => [], vehicles: () => vehicles,
    history: new LagCompensation(new Map(), new Map()), mapFixtureMatches: () => true, rayCast,
  });
}

it('lets dual-pistol rays select a vehicle collider, while a nearer wall wins over a target', () => {
  const vehicleHit = raycaster(() => 1, [rayVehicle]).trace(rayActor, WeaponId.DualShotPistol, 0, 0, sourceWeaponAngleToRadians(-48));
  expect(vehicleHit.targets).toEqual([{ kind: 'vehicle', state: rayVehicle }]);
  const vehicleAngle = sourceWeaponAngleToRadians(-48);
  expect(vehicleHit.distance).toBeCloseTo(100 * Math.cos(vehicleAngle) - Math.sqrt(34 ** 2 - (100 * Math.sin(vehicleAngle)) ** 2));

  const behindWall = { ...rayVehicle, y: 300 };
  const blocked = raycaster(() => .25, [behindWall]).trace(rayActor, WeaponId.DualShotPistol, 0, 0, 0);
  expect(blocked.targets).toHaveLength(0);
  expect(blocked.distance).toBeCloseTo(WEAPONS[WeaponId.DualShotPistol]!.range * .25);
});
