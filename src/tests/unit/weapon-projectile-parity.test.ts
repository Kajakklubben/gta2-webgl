import { expect, it } from 'vitest';
import { WeaponSystem } from '../../shared/domain/combat/weapon-system';
import { GTA2_MOLOTOV_LIGHT, WeaponId, WEAPONS } from '../../shared/domain/combat/weapons';
import { GTA2_FLAME_SEGMENT_FRAME_TICKS, GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { WORLD } from '../../shared/domain/world/world';
import { GameWorld } from '../../shared/game/game-world';
import { createHazardObject, ExplosionObject } from '../../shared/game/effects/hazard';
import { BulletObject, FlameObject, MolotovObject } from '../../shared/game/effects/projectile';
import type { ProjectileImpactContext } from '../../shared/game/gameobjects/gameobject';
import { ProjectileController } from '../../shared/game/runtime/projectile-controller';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture, npcDefaults } from './fixtures';
import type { HazardState, TrafficState } from '../../shared/protocol/types';

const makeGame = () => new GameWorld(parseMap(mapFixture()));

it('resolves a flame wall impact to the authored fire-hitting child', () => {
  const effects: Omit<HazardState, 'id'>[] = [];
  const flame = new FlameObject('flame-wall', {
    actor: 'shooter', weapon: WeaponId.Flamethrower, x: 10, y: 0, endX: 10, endY: 0, z: 0, life: 4,
    prevX: 0, prevY: 0,
    impact: false, collision: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire,
  });
  const combat = {
    authoritative: true,
    weaponSystem: new WeaponSystem(),
    findPlayer: () => undefined,
    findVehicle: () => undefined,
    findNpc: () => undefined,
    damagePlayer: () => undefined,
    damageVehicle: () => undefined,
    damageNpc: () => undefined,
    raiseWanted: () => undefined,
    emit: () => undefined,
    nextHazardId: () => 1,
    spawnEffect: (effect: Omit<HazardState, 'id'>) => effects.push(effect),
  } as unknown as ProjectileImpactContext;

  new ProjectileController({
    weaponSystem: new WeaponSystem(),
    projectiles: () => [flame],
    physicsWorld: { rayCast: () => .5, queryCircle: () => [] },
    tick: () => 1,
    register: () => undefined,
  }).resolveCollisions();
  flame.resolveImpact(combat);

  expect(effects).toContainEqual(expect.objectContaining({ kind: 'impact', sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact }));
});

it('kills a water-sensitive projectile before entity collision even without planar travel', () => {
  const weaponSystem = new WeaponSystem();
  const flame = new FlameObject('flame-water', {
    actor: 'shooter', weapon: WeaponId.Flamethrower, x: 10, y: 10, endX: 10, endY: 10, z: 0, life: 4,
    collision: true, waterDeath: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire,
  });
  const effects: Omit<HazardState, 'id'>[] = [];
  const controller = new ProjectileController({
    weaponSystem,
    projectiles: () => [flame],
    physicsWorld: { rayCast: () => 1, queryCircle: () => [] },
    tick: () => 1,
    register: () => undefined,
    isWaterAt: () => true,
    spawnEffect: effect => effects.push(effect),
  });

  controller.resolveCollisions();

  expect(flame.state.destroyedByWater).toBe(true);
  expect(effects).toContainEqual(expect.objectContaining({ kind: 'water' }));
});

it('stops a fire-truck water stream at a wall and emits water at the wall', () => {
  const game = makeGame();
  const water = new BulletObject('water-wall', {
    actor: 'shooter', weapon: WeaponId.FireTruckGun, x: 10, y: 0, endX: 10, endY: 0, z: 0, life: 4,
    prevX: 0, prevY: 0, collision: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet,
  });
  game.registerObject(water);
  new ProjectileController({
    weaponSystem: new WeaponSystem(),
    projectiles: () => [water],
    physicsWorld: { rayCast: () => .5, rayCastHit: () => ({ fraction: .5 }), queryCircle: () => [] },
    tick: () => 1,
    register: () => undefined,
  }).resolveCollisions();

  water.resolveImpact(game.gameObjectCombatContext());

  expect(water.state.impact).toBe(true);
  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ kind: 'water', owner: 'shooter' }));
});

it('uses the source water packet to extinguish and damage a pedestrian', () => {
  const game = makeGame();
  const shooter = game.addPlayer('water-shooter');
  const npcState = {
    ...npcDefaults(), id: 77, x: shooter.x + 10, y: shooter.y, z: shooter.z, rotation: 0, vx: 0, vy: 0,
    health: 100, kind: 'civilian' as const, state: 'idle' as const, animation: 'idle' as const,
  };
  game.restoreWorld([], [], [], [npcState]);
  const npc = game.gameObjects.findNpc(npcState.id)!;
  npc.setOnFire(game.gameObjectCombatContext());
  const water = new BulletObject('water-pedestrian', {
    actor: shooter.id, weapon: WeaponId.FireTruckGun, x: shooter.x, y: shooter.y, endX: npc.state.x, endY: npc.state.y,
    z: shooter.z, life: 0, impact: true, impactTarget: { kind: 'npc', id: npc.id }, sourceModel: GTA2_SOURCE_OBJECT_MODELS.impactChild,
  });

  water.resolveImpact(game.gameObjectCombatContext());

  expect(npc.state.onFire).toBe(false);
  expect(npc.state.health).toBe(95);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', target: `npc:${npc.id}`, weapon: WeaponId.FireTruckGun, damage: 5 }));
});

it('uses the small authored blast radius and leaves persistent molotov fire', () => {
  const game = makeGame();
  const shooter = game.addPlayer('molotov-shooter');
  const target = game.addPlayer('molotov-target');
  game.restore({ ...target, x: shooter.x + WORLD.projectile.sourceSmallExplosionRadius - 4, y: shooter.y, team: 1 });
  game.syncCollisionWorld();

  const molotov = new MolotovObject('molotov', {
    actor: shooter.id, weapon: WeaponId.Molotov, x: shooter.x, y: shooter.y, endX: shooter.x, endY: shooter.y,
    z: shooter.z, life: 0, impact: true, explosive: true, selfDamage: true,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingMolotov,
  });
  game.registerObject(molotov);
  molotov.detonate(game.gameObjectCombatContext());

  expect(game.gameState.playerStates.get(target.id)?.combat?.health).toBeLessThan(100);
  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ effect: 'fire', life: WORLD.projectile.molotovFireTicks, owner: shooter.id }));
  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ effect: 'explosion', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingMolotov }));
  expect(game.gameObjects.hazards.find(hazard => hazard.state.effect === 'fire' && hazard.state.owner === shooter.id)?.getSprite(0)).toMatchObject({ light: GTA2_MOLOTOV_LIGHT });
});

it('uses the source flame segment cadence and reach', () => {
  const flame = new FlameObject('flame-cadence', {
    actor: 'shooter', weapon: WeaponId.Flamethrower, x: 0, y: 0, endX: 0, endY: 1, z: 0,
    life: WORLD.projectile.flameSegmentLifetimeTicks, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire,
  });
  const sprite = flame.getSprite(0);

  expect(sprite.frameTicksByFrame).toEqual(GTA2_FLAME_SEGMENT_FRAME_TICKS);
  expect(sprite.loop).toBe(false);
  expect(WEAPONS[WeaponId.Flamethrower]!.range).toBeCloseTo(
    WORLD.projectile.flameSpeed / WORLD.tickRate * WORLD.tileSize * WORLD.projectile.flameSegmentLifetimeTicks,
  );
});

it('does not leave Molotov ground fire when the terminal transition is in water', () => {
  const game = makeGame();
  const shooter = game.addPlayer('molotov-water-shooter');
  const molotov = new MolotovObject('molotov-water', {
    actor: shooter.id, weapon: WeaponId.Molotov, x: shooter.x, y: shooter.y, endX: shooter.x, endY: shooter.y,
    z: shooter.z, life: 0, impact: true, explosive: true, selfDamage: true,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingMolotov,
  });
  game.registerObject(molotov);
  molotov.detonate({ ...game.gameObjectCombatContext(), isWaterAt: () => true });

  expect(game.gameState.hazardStates.some(hazard => hazard.effect === 'fire')).toBe(false);
  expect(game.gameState.hazardStates.some(hazard => hazard.effect === 'explosion')).toBe(true);
});

it('extinguishes a persistent Molotov fire hazard when its ground cell becomes water', () => {
  const game = makeGame();
  const fire = createHazardObject({ id: 22, x: 10, y: 10, z: 0, kind: 'fire', life: WORLD.projectile.molotovFireTicks, effect: 'fire' });
  game.registerObject(fire);
  fire.update({
    tick: 1, dt: 1 / WORLD.tickRate, world: game.gameObjects,
    combat: { ...game.gameObjectCombatContext(), isWaterAt: () => true },
  });

  expect(fire.state.life).toBe(0);
});

it('keeps trains immune to the vehicle side of a source rocket blast', () => {
  const game = makeGame();
  const shooter = game.addPlayer('rocket-shooter');
  const train: TrafficState = {
    id: 22, model: 11, x: shooter.x + 8, y: shooter.y, z: shooter.z, rotation: 0,
    speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1,
    handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100,
    transport: 'train',
  };
  game.restoreWorld([], [train]);
  game.syncCollisionWorld();

  const explosion = new ExplosionObject({
    id: 1, x: shooter.x, y: shooter.y, z: shooter.z, kind: 'fire', life: 26,
    effect: 'explosion', explosionType: 'small', sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet,
  });
  explosion.armBlast({
    actor: shooter.id, weapon: WeaponId.RocketLauncher, radius: WORLD.projectile.sourceSmallExplosionRadius,
    damage: 100, pellets: 1, selfDamage: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet,
  });
  game.registerObject(explosion);
  explosion.resolveBlast(game.gameObjectCombatContext());

  expect(game.gameState.vehicleStates.find(vehicle => vehicle.id === train.id)?.health).toBe(100);
});

it('waits for an explicit mine arming countdown before triggering', () => {
  const game = makeGame();
  const owner = game.addPlayer('mine-owner');
  const target = game.addPlayer('mine-target');
  game.restore({ ...target, x: owner.x + 10, y: owner.y, team: 1 });
  const mine = createHazardObject({
    id: 5, x: owner.x, y: owner.y, z: owner.z, kind: 'mine', life: 30,
    owner: owner.id, sourceModel: GTA2_SOURCE_OBJECT_MODELS.carMine, armingTimer: 2,
  });
  game.registerObject(mine);
  game.syncCollisionWorld();

  game.updateGameObjects();
  expect(game.events.some(event => event.type === 'explosion' && event.weapon === WeaponId.LandMines)).toBe(false);
  game.updateGameObjects();
  expect(game.events.some(event => event.type === 'explosion' && event.weapon === WeaponId.LandMines)).toBe(true);
});
