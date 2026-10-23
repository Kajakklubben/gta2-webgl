import { expect, it } from 'vitest';
import { WeaponId } from '../../shared/domain/combat/weapons';
import { WeaponSystem } from '../../shared/domain/combat/weapon-system';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { projectileCollisionGeometry } from '../../shared/domain/combat/projectile-geometry';
import { GameWorld } from '../../shared/game/game-world';
import { BulletObject, RocketObject } from '../../shared/game/effects/projectile';
import { ExplosionObject } from '../../shared/game/effects/hazard';
import { ProjectileController, explosionTypeForDiagonalWall, explosionTypeForWallSide } from '../../shared/game/runtime/projectile-controller';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture } from './fixtures';
import type { CollisionBody } from '../../shared/game/physics/collision-world';
import type { HazardState, TrafficState } from '../../shared/protocol/types';

const makeGame = () => new GameWorld(parseMap(mapFixture()));

function projectileState(sourceModel: number) {
  return {
    actor: 'shooter', weapon: WeaponId.Pistol, x: 10, y: 0, endX: 10, endY: 0, z: 0, life: 1,
    prevX: 0, prevY: 0, sourceModel, collision: true, projectileType: 'bullet' as const,
  };
}

function targetBody(x: number, y: number, z = 0): CollisionBody {
  return {
    id: 'npc:9', objectId: 9, kind: 'npc', x, y, z, radius: 0, category: 1, mask: 0xffff,
    solid: false, active: true, object: { state: { id: 9 } },
  } as CollisionBody;
}

it('uses distinct source-model projectile footprints during swept entity collision', () => {
  expect(projectileCollisionGeometry(GTA2_SOURCE_OBJECT_MODELS.pistolBullet).radius)
    .toBeLessThan(projectileCollisionGeometry(GTA2_SOURCE_OBJECT_MODELS.rocketBullet).radius);

  const body = targetBody(5, 5);
  const makeController = (projectile: BulletObject) => new ProjectileController({
    weaponSystem: new WeaponSystem(), projectiles: () => [projectile],
    physicsWorld: { rayCast: () => 1, queryCircle: () => [body] }, tick: () => 1, register: () => undefined,
  });
  const pistol = new BulletObject('pistol', projectileState(GTA2_SOURCE_OBJECT_MODELS.pistolBullet));
  const rocketSized = new BulletObject('rocket-sized', projectileState(GTA2_SOURCE_OBJECT_MODELS.rocketBullet));
  makeController(pistol).resolveCollisions();
  makeController(rocketSized).resolveCollisions();

  expect(pistol.state.impact).toBe(false);
  expect(rocketSized.state.impact).toBe(true);
  expect(rocketSized.state.impactTarget).toEqual({ kind: 'npc', id: 9 });
});

it('dispatches source wall-side and diagonal explosion variants', () => {
  expect(explosionTypeForWallSide(0)).toBe(18);
  expect(explosionTypeForWallSide(1)).toBe(23);
  expect(explosionTypeForWallSide(2)).toBe(22);
  expect(explosionTypeForWallSide(3)).toBe(24);
  expect(explosionTypeForWallSide(4)).toBe(25);
  expect(explosionTypeForDiagonalWall(46)).toBe(22);
  expect(explosionTypeForDiagonalWall(47)).toBe(23);
});

it('carries a rocket wall terminal type into the authoritative explosion', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const rocket = new RocketObject('rocket', {
    actor: shooter.id, weapon: WeaponId.RocketLauncher, x: shooter.x, y: shooter.y,
    endX: shooter.x, endY: shooter.y, z: shooter.z, life: 1, collision: true,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet,
  });
  game.registerObject(rocket);
  rocket.impactAt(shooter.x, shooter.y, shooter.z, 'wall', { wallSide: 4, explosionType: 25 });
  rocket.detonate(game.gameObjectCombatContext());

  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ sourceExplosionType: 25, explosionType: 'small' }));
});

it('dispatches the nearest cardinal wall fixture through the projectile controller', () => {
  const game = makeGame();
  const shooter = game.addPlayer('wall-shooter');
  const rocket = new RocketObject('wall-rocket', {
    actor: shooter.id, weapon: WeaponId.RocketLauncher, x: shooter.x + 10, y: shooter.y,
    prevX: shooter.x, prevY: shooter.y, endX: shooter.x + 20, endY: shooter.y, z: shooter.z, life: 1,
    collision: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet, rotation: 0,
  });
  game.registerObject(rocket);
  const fixture = { getUserData: () => ({ kind: 'map-wall', layer: 0, bullet: true, movement: true, orientation: 'horizontal' as const }) };
  new ProjectileController({
    weaponSystem: new WeaponSystem(), projectiles: () => [rocket],
    physicsWorld: { rayCast: () => 1, rayCastHit: () => ({ fraction: .5, fixture }), queryCircle: () => [] },
    tick: () => 1, register: () => undefined,
  }).resolveCollisions();
  expect(rocket.state.impact).toBe(true);
  rocket.detonate(game.gameObjectCombatContext());
  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ sourceExplosionType: 24 }));
});

it('applies explosion height and wall occlusion while leaving trains immune', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const visible = game.addPlayer('visible');
  const hidden = game.addPlayer('hidden');
  game.restore({ ...visible, x: shooter.x + 8, y: shooter.y, team: 1 });
  game.restore({ ...hidden, x: shooter.x + 16, y: shooter.y, team: 1 });
  const train: TrafficState = {
    id: 22, model: 11, x: shooter.x + 10, y: shooter.y + 4, z: shooter.z, rotation: 0,
    speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0,
    color: 0, passengers: [], occupants: [], doorStates: [], health: 100, transport: 'train',
  };
  game.restoreWorld([], [train]);
  game.syncCollisionWorld();
  const explosion = new ExplosionObject({
    id: 10, x: shooter.x, y: shooter.y, z: shooter.z, kind: 'fire', life: 26,
    effect: 'explosion', explosionType: 'small', sourceExplosionType: 18,
  });
  explosion.armBlast({ actor: shooter.id, weapon: WeaponId.RocketLauncher, radius: 40, damage: 30, pellets: 1, selfDamage: true, height: 2, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet });
  const context = game.gameObjectCombatContext();
  const occluded = { ...context, isExplosionOccluded: (_origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => target.x === hidden.x };
  explosion.resolveBlast(occluded);

  expect(game.gameState.playerStates.get(visible.id)?.combat.health).toBeLessThan(100);
  expect(game.gameState.playerStates.get(hidden.id)?.combat.health).toBe(100);
  expect(game.gameState.vehicleStates.find(vehicle => vehicle.id === train.id)?.health).toBe(100);
});

it('emits the first-tick flash and invokes nearby map-object reactions in the source window', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const effects: HazardState[] = [];
  const nearby: CollisionBody = {
    ...targetBody(shooter.x + 4, shooter.y, shooter.z), kind: 'map-object', objectId: 77, id: 'map-object:77',
  };
  const base = game.gameObjectCombatContext();
  let callbackCount = 0;
  const context = {
    ...base,
    spawnEffect: (effect: Omit<HazardState, 'id'>) => effects.push({ ...effect, id: effects.length }),
    queryExplosionObjects: () => [nearby],
    onExplosionNearby: () => { callbackCount++; },
  };
  const flash = new ExplosionObject({
    id: 11, x: shooter.x, y: shooter.y, z: shooter.z, kind: 'fire', life: 26,
    effect: 'explosion', explosionType: 'item', sourceExplosionType: 19, sourceTimer: 100,
  });
  flash.armBlast({ actor: shooter.id, weapon: WeaponId.RocketLauncher, radius: 40, damage: 0, pellets: 1, selfDamage: false, height: 2 });
  flash.update({ tick: 1, dt: 1 / 30, world: game.gameObjects, combat: context });
  expect(effects).toContainEqual(expect.objectContaining({ kind: 'impact', sourceModel: 342, sourceExplosionType: 19 }));

  const objectReaction = new ExplosionObject({
    id: 12, x: shooter.x, y: shooter.y, z: shooter.z, kind: 'fire', life: 26,
    effect: 'explosion', explosionType: 'small', sourceExplosionType: 18, sourceTimer: 52,
  });
  objectReaction.armBlast({ actor: shooter.id, weapon: WeaponId.RocketLauncher, radius: 40, damage: 0, pellets: 1, selfDamage: false, height: 2 });
  objectReaction.update({ tick: 1, dt: 1 / 30, world: game.gameObjects, combat: context });
  expect(callbackCount).toBe(1);
});
