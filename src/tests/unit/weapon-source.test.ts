import { expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture, npcDefaults } from './fixtures';
import { GTA2_FLAME_STREAM_RANGE, WeaponId, WEAPONS, projectileTravelTicks, sourceThrowableSpeed, sourceThrowableVelocity } from '../../shared/domain/combat/weapons';
import { WeaponSystem } from '../../shared/domain/combat/weapon-system';
import { PlayerSystem } from '../../shared/game/player-system';
import { sourceAngleToRadians } from '../../shared/domain/physics/motion-vector';
import { PlayerObject } from '../../shared/game/gameobjects/player';
import { BulletObject, ProjectileObject, RocketObject } from '../../shared/game/effects/projectile';
import { createHazardObject, ExplosionObject, FireObject, VehicleBombObject } from '../../shared/game/effects/hazard';
import { GTA2_CAR_FIRE_FRAME_SEQUENCES, GTA2_SOURCE_EFFECT_SPRITES, GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { SOURCE_FIX16_ONE, WORLD } from '../../shared/domain/world/world';
import { GTA2_VEHICLE_DAMAGE, sourceDamageForFire, sourceDamageForObjectModel, sourceDamageForWeapon } from '../../shared/domain/combat/vehicle-damage';
import { SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS } from '../../shared/domain/vehicles/vehicle-weapons';
import type { NpcState, TrafficState } from '../../shared/protocol/types';
import type { GameObjectSprite } from '../../shared/game/gameobjects/gameobject';

const makeGame = () => new GameWorld(parseMap(mapFixture()));
const requireSprite = (sprite: GameObjectSprite) => sprite;

it('cycles through usable weapons and the source unarmed slot', () => {
  const game = makeGame();
  const player = game.addPlayer('weapon-cycle');

  game.playerSystem.cycleWeapon(player);
  expect(player.combat!.weapon).toBe(WeaponId.None);
  game.playerSystem.cycleWeapon(player);
  expect(player.combat!.weapon).toBe(WeaponId.Pistol);

  player.combat!.ammo[WeaponId.MachineGun] = 1;
  game.playerSystem.cycleWeapon(player);
  expect(player.combat!.weapon).toBe(WeaponId.MachineGun);
  game.playerSystem.cycleWeapon(player);
  expect(player.combat!.weapon).toBe(WeaponId.None);
});

it('cycles backwards through usable weapons from the mobile previous-weapon action', () => {
  const game = makeGame();
  const player = game.addPlayer('weapon-cycle-previous');
  player.combat!.weapon = WeaponId.MachineGun;
  player.combat!.ammo[WeaponId.MachineGun] = 1;

  game.playerSystem.cycleWeaponPrevious(player);
  expect(player.combat!.weapon).toBe(WeaponId.Pistol);

  game.playerSystem.cycleWeaponPrevious(player);
  expect(player.combat!.weapon).toBe(WeaponId.None);
});

it('gives the debug player every authored weapon and equips an unarmed player', () => {
  const game = makeGame();
  const player = game.addPlayer('weapon-debug');
  player.combat!.weapon = WeaponId.None;
  player.combat!.ammo.fill(0);

  game.playerSystem.giveAllWeapons(player);

  expect(player.combat!.ammo).toEqual(WEAPONS.map(weapon => weapon.ammo));
  expect(player.combat!.weapon).toBe(WeaponId.Pistol);
});

it('ignores a stale debug loadout command without throwing', () => {
  expect(new PlayerSystem().giveAllWeapons(undefined)).toBe(false);
});

it('keeps the public slots while exposing the source Weapon_30 dispatch table', () => {
  expect(WEAPONS[WeaponId.Pistol]).toMatchObject({ sourceType: 0, sourceModel: 265, interval: 20 });
  expect(WEAPONS[WeaponId.MachineGun]).toMatchObject({ sourceType: 1, sourceModel: 254, interval: 2 });
  expect(WEAPONS[WeaponId.RocketLauncher]).toMatchObject({ sourceType: 2, sourceModel: 128, interval: 50, moving: true });
  expect(WEAPONS[WeaponId.Shotgun]).toMatchObject({ sourceType: 6, sourceModel: 192, interval: 40, pellets: 5 });
  expect(WEAPONS[WeaponId.ElectroShock]).toMatchObject({ sourceType: 7, sourceModel: 277, interval: 20 });
  expect(WEAPONS[WeaponId.MachineGunCar]).toMatchObject({ sourceType: 18, vehicleOnly: true, pellets: 2 });
  expect(WEAPONS[WeaponId.MachineGunCar]).toMatchObject({ hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire });
  expect(WEAPONS[WeaponId.Grenade]).toMatchObject({ sourceType: 5, throwable: true, sourceModel: 183 });
  expect(WEAPONS[WeaponId.OilSlicks]).toMatchObject({ sourceType: 16, sourceModel: 8, spriteModel: 216 });
  expect(WEAPONS[WeaponId.LandMines]).toMatchObject({ sourceType: 17, sourceModel: 10, spriteModel: 217 });
  expect(WEAPONS[WeaponId.SilencedGun]!.silent).toBe(true);
  expect(WEAPONS[WeaponId.Molotov]!.interval).toBe(4);
  expect(WEAPONS[WeaponId.Grenade]!.interval).toBe(4);
  expect(WEAPONS[WeaponId.FireTruckGun]!.interval).toBe(1);
  expect(WEAPONS[WeaponId.FireTruckGun]).toMatchObject({ hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.impactChild, consumesAmmo: false, waterCannon: true, waterDeath: false, playerDamage: 2, npcDamage: 5 });
  expect(WEAPONS[WeaponId.Pistol]!.playerDamage).toBe(20);
  expect(WEAPONS[WeaponId.MachineGun]!.playerDamage).toBe(10);
  expect(WEAPONS[WeaponId.Shotgun]!.playerDamage).toBe(10);
  expect(WEAPONS[WeaponId.Shotgun]!.spread).toEqual([48, 24, 0, -24, -48]);
  expect(sourceAngleToRadians(2048)).toBeCloseTo(Math.PI * 2);
  expect(new WeaponSystem().behavior(WeaponId.RocketLauncher)).toBe('projectile');
});

it('uses ObjectDefinitions Fix16 projectile speeds', () => {
  expect(WORLD.projectile.bulletSpeed).toBeCloseTo(0xCCC / SOURCE_FIX16_ONE * WORLD.tickRate);
  expect(WORLD.projectile.flameSpeed).toBeCloseTo(0x666 / SOURCE_FIX16_ONE * WORLD.tickRate);
  expect(WORLD.projectile.rocketSpeed).toBeCloseTo(0x1999 / SOURCE_FIX16_ONE * WORLD.tickRate);
  expect(projectileTravelTicks(WeaponId.Shotgun)).toBe(Math.ceil(WEAPONS[WeaponId.Shotgun]!.range / (WORLD.projectile.rocketSpeed * WORLD.tileSize) * WORLD.tickRate));
});

it('keeps the flamethrower stream at the source-sized long reach', () => {
  expect(WEAPONS[WeaponId.Flamethrower]!.range).toBe(GTA2_FLAME_STREAM_RANGE);
  expect(WEAPONS[WeaponId.FireTruckFlamethrower]!.range).toBe(GTA2_FLAME_STREAM_RANGE);
});

it('emits five source shotgun projectiles with one trigger pull', () => {
  const game = makeGame();
  const player = game.addPlayer('shooter');
  player.combat!.weapon = WeaponId.Shotgun; player.combat!.ammo[WeaponId.Shotgun] = 30;
  game.step(new Map([['shooter', 16]]));
  const projectiles = [...game.gameObjects.values()].filter(object => object.kind === 'projectile');
  expect(projectiles).toHaveLength(5);
  expect(player.combat!.ammo[WeaponId.Shotgun]).toBe(29);
  expect(player.combat!.cooldown).toBe(40);
});

it('keeps the replicated projectile alive for its flight instead of a short tracer flash', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const target = game.addPlayer('target');
  game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: shooter.z });
  shooter.combat!.weapon = WeaponId.Pistol;
  shooter.combat!.ammo[WeaponId.Pistol] = 2;

  game.step(new Map([['shooter', 16]]));

  expect(shooter.combat!.shots?.length).toBeGreaterThan(0);
  expect(shooter.combat!.shots?.[0]?.life).toBeGreaterThan(4);
});

it('charges and releases a grenade as a moving source projectile', () => {
  const game = makeGame();
  const player = game.addPlayer('thrower');
  player.combat!.weapon = WeaponId.Grenade; player.combat!.ammo[WeaponId.Grenade] = 2;
  for (let tick = 0; tick < 12; tick++) game.step(new Map([['thrower', 16]]));
  expect(player.combat!.throwing).toBe(true);
  expect(player.combat!.throwCharge).toBe(12);
  game.step(new Map([['thrower', 0]]));
  expect(player.combat!.throwing).toBe(false);
  expect(player.combat!.ammo[WeaponId.Grenade]).toBe(1);
  expect(player.combat!.shots?.length).toBeGreaterThan(0);
  const projectile = [...game.gameObjects.values()].find(object => object.kind === 'projectile')?.state as { endX: number; endY: number; x: number; y: number; z: number; vx: number; vy: number; life: number } | undefined;
  expect(projectile).toBeDefined();
  expect(projectile!.endX).toBeCloseTo(projectile!.x + projectile!.vx * projectile!.life / WORLD.tickRate);
  expect(projectile!.endY).toBeCloseTo(projectile!.y + projectile!.vy * projectile!.life / WORLD.tickRate);
  expect(projectile!.z).toBeCloseTo(player.z + .5);
});

it('uses the source Fix16 throw velocity for grenade and molotov charge', () => {
  const sourceScale = 64 * 30 / 0x4000;
  expect(sourceThrowableSpeed(WeaponId.Grenade, 0)).toBeCloseTo(0xA3 * sourceScale);
  expect(sourceThrowableSpeed(WeaponId.Molotov, 0)).toBeCloseTo(0x147 * sourceScale);
  expect(sourceThrowableSpeed(WeaponId.Grenade, 60)).toBeCloseTo((0xA3 + 0x666 + 0x147) * sourceScale);
  expect(sourceThrowableSpeed(WeaponId.Molotov, 60)).toBeCloseTo((0x147 + 0x666) * sourceScale);
  expect(sourceThrowableSpeed(WeaponId.Grenade, 60)).toBeGreaterThan(sourceThrowableSpeed(WeaponId.Grenade, 1));
});

it('uses the source airborne gravity rather than the throw friction constant', () => {
  expect(WORLD.projectile.sourceThrow.gravity).toBeCloseTo(-(0x8 / SOURCE_FIX16_ONE) * WORLD.tickRate * WORLD.tickRate);
});

it('adds carried velocity before the source moving-throw speed boost', () => {
  const direction = { x: 0, y: 1 }, carried = { x: 20, y: 0 }, base = sourceThrowableSpeed(WeaponId.Grenade, 30);
  const combined = { x: carried.x, y: base + carried.y }, combinedSpeed = Math.hypot(combined.x, combined.y);
  const boost = 0x340 * (1 / 0x4000) * WORLD.tileSize * WORLD.tickRate;
  const velocity = sourceThrowableVelocity(WeaponId.Grenade, 30, direction, carried);

  expect(velocity.x).toBeCloseTo(combined.x / combinedSpeed * (combinedSpeed + boost));
  expect(velocity.y).toBeCloseTo(combined.y / combinedSpeed * (combinedSpeed + boost));
});

it('adds the source carried-velocity boost to a moving throw', () => {
  const game = makeGame();
  const player = game.addPlayer('thrower');
  player.combat!.weapon = WeaponId.Grenade; player.combat!.ammo[WeaponId.Grenade] = 2;
  game.step(new Map([['thrower', { seq: 1, keys: 16, moveX: 1, moveY: 0 }]]));
  game.step(new Map([['thrower', { seq: 2, keys: 0, moveX: 1, moveY: 0 }]]));
  const projectile = [...game.gameObjects.values()].find(object => object.kind === 'projectile')?.state as { vx?: number; vy?: number } | undefined;
  expect(projectile).toBeDefined();
  const strength = 1;
  const direction = { x: -Math.sin(player.rotation), y: Math.cos(player.rotation) };
  const expected = sourceThrowableVelocity(WeaponId.Grenade, strength, direction, { x: player.vx, y: player.vy });
  expect(projectile!.vx).toBeCloseTo(expected.x, 5);
  expect(projectile!.vy).toBeCloseTo(expected.y, 5);
});

it('uses the source grenade hold timeout instead of tracing an immediate blast', () => {
  const game = makeGame();
  const player = game.addPlayer('thrower');
  player.combat!.weapon = WeaponId.Grenade; player.combat!.ammo[WeaponId.Grenade] = 2;
  game.step(new Map([['thrower', 16]]));
  expect(game.events.some(event => event.type === 'explosion')).toBe(false);
  for (let tick = 1; tick < 96; tick++) game.step(new Map([['thrower', 16]]));
  expect(player.combat!.ammo[WeaponId.Grenade]).toBe(1);
  expect(game.events.some(event => event.type === 'explosion' && event.weapon === WeaponId.Grenade)).toBe(true);
});

it('keeps rockets in flight before their source projectile lifetime expires', () => {
  const game = makeGame();
  const player = game.addPlayer('shooter');
  player.combat!.weapon = WeaponId.RocketLauncher; player.combat!.ammo[WeaponId.RocketLauncher] = 1;
  game.step(new Map([['shooter', 16]]));
  expect(game.events.some(event => event.type === 'explosion')).toBe(false);
  const lifetime = projectileTravelTicks(WeaponId.RocketLauncher);
  let exploded = false;
  for (let tick = 0; tick < lifetime + 2; tick++) {
    game.step(new Map());
    exploded ||= game.events.some(event => event.type === 'explosion' && event.weapon === WeaponId.RocketLauncher);
  }
  expect(exploded).toBe(true);
  expect(player.wanted).toBe(1);
});

it('reports ordinary fire but keeps silenced fire out of wanted/crime state', () => {
  const ordinary = makeGame();
  const shooter = ordinary.addPlayer('ordinary');
  shooter.combat!.weapon = WeaponId.Pistol;
  shooter.combat!.ammo[WeaponId.Pistol] = 2;
  ordinary.step(new Map([['ordinary', 16]]));
  expect(shooter.wanted).toBe(1);

  const silenced = makeGame();
  const quiet = silenced.addPlayer('quiet');
  quiet.combat!.weapon = WeaponId.SilencedGun;
  quiet.combat!.ammo[WeaponId.SilencedGun] = 2;
  silenced.step(new Map([['quiet', 16]]));
  expect(quiet.wanted).toBe(0);
});

it('uses the source rocket blast radius and delayed self-damage phase', () => {
  const game = makeGame();
  const shooter = game.addPlayer('rocket-shooter');
  const target = game.addPlayer('rocket-target');
  game.restore({ ...target, x: shooter.x + WORLD.projectile.sourceSmallExplosionRadius + 8, y: shooter.y, z: shooter.z });
  const explosion = new ExplosionObject({
    id: 99, x: shooter.x, y: shooter.y, z: shooter.z,
    kind: 'fire', life: WORLD.projectile.sourceExplosionTicks,
    owner: shooter.id, effect: 'explosion', explosionType: 'small',
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet,
    sourceTimer: WORLD.projectile.sourceExplosionTicks,
  });
  explosion.armBlast({
    actor: shooter.id, weapon: WeaponId.RocketLauncher,
    radius: WORLD.projectile.sourceSmallExplosionRadius, damage: 100, pellets: 1,
    selfDamage: true, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet,
  });
  game.registerObject(explosion);
  game.syncCollisionWorld();
  game.updateGameObjects();

  expect(explosion.state.sourceTimer).toBe(WORLD.projectile.sourceExplosionTicks - 1);
  expect(game.gameState.playerStates.get(shooter.id)?.combat?.health).toBe(0);
  expect(game.gameState.playerStates.get(target.id)?.combat?.health).toBe(100);
});

it('applies moving flame damage when the authored object reaches a ped', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const target = game.addPlayer('target');
  game.restore({ ...shooter, z: 4 });
  game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: 4 });
  shooter.combat!.weapon = WeaponId.Flamethrower;
  shooter.combat!.ammo[WeaponId.Flamethrower] = 10;

  game.step(new Map([['shooter', 16]]));
  expect(game.gameState.playerStates.get('target')!.combat!.health).toBe(100);
  for (let tick = 0; tick < WORLD.projectile.flameSegmentLifetimeTicks + 2; tick++) game.step(new Map());
  expect(game.gameState.playerStates.get('target')!.combat!.health).toBeLessThan(100);
});

it('uses fire-hitting to ignite NPCs and keeps the source flame attached', () => {
  const game = makeGame();
  const npcState: NpcState = { ...npcDefaults(), id: 77, x: 100, y: 100, z: 0, rotation: 0, vx: 0, vy: 0, health: 20, kind: 'civilian', state: 'idle', animation: 'idle' };
  const npc = game.createNpcObject(npcState);
  game.registerObject(npc);

  npc.receiveWeaponHit(0, GTA2_SOURCE_OBJECT_MODELS.fireHitting, 'shooter', game.gameObjectCombatContext());

  expect(npc.state.onFire).toBe(true);
  const fire = game.gameObjects.hazards.find(hazard => hazard.state.owner === 'npc:77');
  // Source model 197 resolves through its code-object definition at sprite
  // 270; the model number is not itself a sprite index.
  expect(fire?.getSprite(0)).toMatchObject({ model: 270, frameCount: 8 });
  game.updateGameObjects();
  expect(npc.state.health).toBeLessThan(20);
  expect(fire?.state.x).toBe(100);

  npc.putOutFire();
  game.updateGameObjects();
  expect(game.gameObjects.hazards.some(hazard => hazard.state.owner === 'npc:77')).toBe(false);
});

it('applies one source burn tick at a time and water clears the ignition state', () => {
  const game = makeGame();
  game.addPlayer('burning-player');
  const player = game.gameObjects.findPlayer('burning-player')!;
  player.setOnFire(game.gameObjectCombatContext());

  player.tickStatus(game.gameObjectCombatContext());
  expect(player.combatState.health).toBe(99);
  expect(player.combatState.fireTimer).toBe(1);
  player.tickStatus(game.gameObjectCombatContext());
  expect(player.combatState.health).toBe(98);
  expect(player.combatState.fireTimer).toBe(2);
  expect(player.combatState.onFire).toBe(true);

  player.tickStatus({ ...game.gameObjectCombatContext(), isWaterAt: () => true });
  expect(player.combatState.onFire).toBe(false);
  expect(player.combatState.health).toBe(98);
});

it('applies the source fire packet to a vehicle without using the moving flame model', () => {
  const game = makeGame();
  const vehicle: TrafficState = {
    id: 88, model: 0, x: 100, y: 100, z: 0, rotation: 0, vx: 0, vy: 0, speed: 0, angularVelocity: 0,
    throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100,
  };
  game.restoreWorld([], [vehicle]);
  const fire = new FireObject({ id: 89, x: vehicle.x, y: vehicle.y, z: vehicle.z, kind: 'fire', life: 7, owner: 'shooter', effect: 'fire' });
  game.registerObject(fire);
  game.syncCollisionWorld();

  game.updateGameObjects();

  expect(game.gameState.vehicleStates.find(item => item.id === vehicle.id)?.damage).toBe(sourceDamageForFire());
});

it('keeps explosive vehicle damage on the moving source object model', () => {
  const rocket = WEAPONS[WeaponId.RocketLauncher]!;
  const grenade = WEAPONS[WeaponId.Grenade]!;
  expect(sourceDamageForObjectModel(rocket.sourceModel)).toBe(GTA2_VEHICLE_DAMAGE.maxDamage);
  // Car_BC has dedicated 32000 packets for rockets, moving molotovs, and
  // mines. Grenade model 183 takes the handler's default 800 packet; its
  // separate blast logic supplies the area damage.
  expect(sourceDamageForObjectModel(grenade.sourceModel)).toBe(800);
  expect(sourceDamageForObjectModel(rocket.impactModel)).toBe(0);
  expect(sourceDamageForObjectModel(grenade.impactModel)).toBe(0);
});

it('keeps the stun gun source shock counter separate from ped health', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const target = game.addPlayer('target');
  game.restore({ ...target, x: shooter.x, y: shooter.y + 80, z: shooter.z });
  shooter.combat!.weapon = WeaponId.StunGun; shooter.combat!.ammo[WeaponId.StunGun] = 2;

  game.step(new Map([['shooter', 16]]));

  const victim = game.gameState.playerStates.get('target')!;
  expect(victim.combat!.health).toBe(100);
  expect(victim.combat!.shockCounter).toBe(5);
  expect(victim.combat!.electrocuted).toBe(false);
  expect(new PlayerObject(victim).getSprite(0).animation).toBe('idle');
});

it('uses the source electro baton three-point hit and shock counter', () => {
  const game = makeGame();
  const shooter = game.addPlayer('shooter');
  const target = game.addPlayer('target');
  game.restore({ ...target, x: shooter.x, y: shooter.y + 80, z: shooter.z });
  shooter.combat!.weapon = WeaponId.ElectroShock; shooter.combat!.ammo[WeaponId.ElectroShock] = 2;

  game.step(new Map([['shooter', 16]]));
  for (let tick = 0; tick < 4; tick++) game.step(new Map([['shooter', 0]]));

  const victim = game.gameState.playerStates.get('target')!;
  expect(victim.combat!.health).toBe(97);
  expect(victim.combat!.shockCounter).toBe(3);
});

it('keeps the source stun beam car packet separate from object model 154', () => {
  expect(sourceDamageForObjectModel(154)).toBe(0);
  expect(sourceDamageForWeapon(WEAPONS[WeaponId.StunGun]!)).toBe(300);
  expect(sourceDamageForWeapon(WEAPONS[WeaponId.ElectroShock]!)).toBe(0);
});

it('renders bullets from the source object model and keeps the authored variant static', () => {
  const state = {
    actor: 'player', weapon: WeaponId.Pistol, x: 0, y: 0, endX: 0, endY: 100, z: 0, life: 4,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.pistolBullet, rotation: 0,
  } as const;
  const player = new BulletObject('player-shot', { ...state });
  const npc = new BulletObject('npc-shot', { ...state, actor: 'npc:1' });

  expect(player.getSprite(0)).toMatchObject({ model: 15, frameCount: 1 });
  expect(npc.getSprite(0)).toMatchObject({ model: 17, frameCount: 1 });
  expect(requireSprite(player.getSprite(0)).placement.rotation).toBeCloseTo(0);
});

it('renders the rocket body with the source trailing particle sequence', () => {
  const rocket = new RocketObject('rocket-shot', {
    actor: 'player', weapon: WeaponId.RocketLauncher, x: 0, y: 0, endX: 0, endY: 100, z: 0, life: 20,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet, rotation: 0,
  });
  const sprite = requireSprite(rocket.getSprite(0));

  expect(sprite).toMatchObject({ model: 540, frameCount: 1 });
  expect(sprite?.layers?.[0]).toMatchObject({
    model: GTA2_SOURCE_EFFECT_SPRITES.rocketTrail.start,
    frameCount: GTA2_SOURCE_EFFECT_SPRITES.rocketTrail.count,
    frameTicks: 1,
  });
});

it('renders car fire as source fire particles, not a generic explosion', () => {
  const fire = new FireObject({
    id: 1, x: 20, y: 30, z: 0, kind: 'fire', life: 9_000, sourceModel: 13,
  });
  // The source emitter releases one short-lived particle every one or two
  // ticks. Let the local presentation clock build the same small trail before
  // checking the composed sprite layers.
  for (let tick = 0; tick < 8; tick++) fire.tick();
  const sprite = fire.getSprite(0);

  expect(sprite).toMatchObject({ animation: 'fire', model: 452, modelSequence: GTA2_CAR_FIRE_FRAME_SEQUENCES[13] });
  expect(sprite.model).not.toBe(325);
  expect(sprite.layers).toHaveLength(4);
  expect(sprite.layers?.[0]?.placement.y).toBeLessThan(30);
  expect(sprite.layers?.[0]?.scale).toBeGreaterThan(1);
  expect(sprite.presentation?.band).toBe('overlay');
  expect(sprite.layers?.every(layer => layer.presentation?.band === 'overlay')).toBe(true);
});

it('uses the source timing and scale for a vehicle item explosion', () => {
  const explosion = new ExplosionObject({
    id: 2, x: 20, y: 30, z: 0, kind: 'fire', life: 26, effect: 'explosion', explosionType: 'item',
  });
  const sprite = explosion.getSprite(0);
  expect(sprite).toMatchObject({ frame: 0, frameCount: 16, scale: 1.5, loop: false });
  expect(sprite.presentation?.band).toBe('overlay');
  expect(sprite.layers?.every(layer => layer.presentation?.band === 'overlay')).toBe(true);
  explosion.tick(); explosion.tick();
  expect(explosion.getSprite(0).frame).toBe(1);
});

it('does not substitute unrelated art for a source object with no sprite', () => {
  const carBomb = new ProjectileObject('car-bomb', {
    actor: 'player', weapon: WeaponId.CarBomb, x: 0, y: 0, endX: 0, endY: 100, z: 0, life: 4,
    sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
  });

  expect(carBomb.isRenderable).toBe(false);
});

it('separates the armed normal car bomb from the instant large-bomb path', () => {
  const game = makeGame();
  const driver = game.addPlayer('driver');
  const vehicle: TrafficState = {
    id: 7, model: 0, x: driver.x, y: driver.y, z: driver.z, rotation: 0,
    speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1,
    handbrakeForce: 0, color: 0, passengers: ['driver'],
    occupants: [{ id: 'driver', door: 0, state: 'seated', progress: 1 }], doorStates: [], health: 100,
  };
  game.restoreWorld([], [vehicle]);
  game.restore({ ...driver, vehicleId: vehicle.id, animation: { kind: 'seated', progress: 1 } });
  const car = game.gameObjects.findVehicle(vehicle.id)!, player = game.gameObjects.findPlayer(driver.id)!;

  expect(car.fireCarBomb(player, false, game.gameObjectCombatContext())).toBe(true);
  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb, armingTimer: SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS, vehicleId: vehicle.id, effect: 'fire' }));
  expect(game.events).not.toContainEqual(expect.objectContaining({ type: 'explosion', weapon: WeaponId.CarBomb }));
  expect(car.fireCarBomb(player, true, game.gameObjectCombatContext())).toBe(true);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'explosion', actor: driver.id, weapon: WeaponId.SpecialVehicleBomb }));
});

it('gates mounted weapons by source chassis and installed car-SMG state', () => {
  const game = makeGame();
  const driver = game.addPlayer('mounted-driver');
  const vehicle: TrafficState = {
    id: 11, model: 54, x: driver.x, y: driver.y, z: driver.z, rotation: 0,
    speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1,
    handbrakeForce: 0, color: 0, passengers: [driver.id],
    occupants: [{ id: driver.id, door: 0, state: 'seated', progress: 1 }], doorStates: [], health: 100,
  };
  game.restoreWorld([], [vehicle]);
  game.restore({ ...driver, vehicleId: vehicle.id, animation: { kind: 'seated', progress: 1 } });
  const car = game.gameObjects.findVehicle(vehicle.id)!;

  expect(car.canFireWeapon(19, driver.id)).toBe(true);
  expect(car.canFireWeapon(20, driver.id)).toBe(false);
  expect(car.canFireWeapon(18, driver.id)).toBe(false);
  car.mutableVehicleState.mountedWeapons = [18];
  expect(car.canFireWeapon(18, driver.id)).toBe(true);
  expect(car.weaponOrigins(19, driver.id)[0]).toMatchObject({ angle: 0 });
});

it('reifies a normal car bomb as an attached source object', () => {
  const bomb = createHazardObject({
    id: 8, x: 0, y: 0, z: 0, kind: 'fire', life: 52, owner: 'driver',
    effect: 'fire', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
    armingTimer: SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS, vehicleId: 7,
  });
  expect(bomb).toBeInstanceOf(VehicleBombObject);
  expect(bomb.state.armingTimer).toBe(SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS);
  expect(bomb.isRenderable).toBe(true);
});
