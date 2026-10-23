import { describe, expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture, npcDefaults } from './fixtures';
import type { NpcState, TrafficState } from '../../shared/protocol/types';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { GTA2_SOURCE_WEAPON_TYPES, sourceThrowableSpeed, WeaponId, WEAPONS } from '../../shared/domain/combat/weapons';
import { WORLD } from '../../shared/domain/world/world';
import { selectNpcWeapon, sourceNpcVehicleWeapon } from '../../shared/game/runtime/npc-weapon-runtime';

const makeNpc = (overrides: Partial<NpcState> = {}): NpcState => ({
  ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0,
  health: 100, kind: 'police', state: 'attack', animation: 'armed', target: 'target',
  weapon: WeaponId.Pistol, weaponAmmo: 3, weaponCooldown: 0, ...overrides,
});

const makeGame = () => new GameWorld(parseMap(mapFixture()));

const makeVehicle = (model: number, id = 7, occupant = 'npc:1'): TrafficState => ({
  id, model, x: 0, y: 0, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0,
  throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [occupant],
  occupants: [{ id: occupant, door: 0, state: 'seated', progress: 1 }], doorStates: [], health: 100,
});

it('selects source NPC defaults while preserving configured weapon slots', () => {
  expect(selectNpcWeapon(makeNpc({ weapon: undefined }))).toMatchObject({ weaponId: WeaponId.SilencedGun, vehicleOnly: false });
  expect(selectNpcWeapon(makeNpc({ kind: 'civilian', faction: 3, weapon: undefined }))).toMatchObject({ weaponId: WeaponId.Pistol, vehicleOnly: false });
  expect(selectNpcWeapon(makeNpc({ weapon: WeaponId.Flamethrower }))).toMatchObject({ weaponId: WeaponId.Flamethrower, vehicleOnly: false });
  expect(selectNpcWeapon(makeNpc({ weapon: WeaponId.Grenade }))).toMatchObject({ weaponId: WeaponId.Grenade, vehicleOnly: false });
  expect(selectNpcWeapon(makeNpc({ weapon: WeaponId.LandMines }))).toMatchObject({ weaponId: WeaponId.LandMines, vehicleOnly: true });
});

describe('source vehicle weapon lookup', () => {
  it.each([
    [17, WeaponId.FireTruckGun],
    [54, WeaponId.TankMainGun],
    [22, WeaponId.ArmyGunJeep],
  ])('selects the authored mounted slot for chassis model %s', (model, weaponId) => {
    const vehicle = makeVehicle(model);
    const npc = makeNpc({ vehicleId: vehicle.id, weapon: undefined });
    expect(sourceNpcVehicleWeapon(vehicle)).toBe(weaponId);
    expect(selectNpcWeapon(npc, vehicle)).toMatchObject({ weaponId, mounted: true, vehicleOnly: true });
  });

  it('keeps an explicitly configured fire-truck flamethrower mounted weapon', () => {
    const vehicle = makeVehicle(17);
    const npc = makeNpc({ vehicleId: vehicle.id, weapon: WeaponId.FireTruckFlamethrower });
    expect(selectNpcWeapon(npc, vehicle)).toMatchObject({ weaponId: WeaponId.FireTruckFlamethrower, mounted: true });
  });

  it('only selects the installed machine-gun car slot', () => {
    const vehicle = makeVehicle(0);
    const npc = makeNpc({ vehicleId: vehicle.id, weapon: undefined });
    expect(selectNpcWeapon(npc, vehicle)).toBeUndefined();
    vehicle.mountedWeapons = [GTA2_SOURCE_WEAPON_TYPES.carSmg];
    expect(selectNpcWeapon(npc, vehicle)).toMatchObject({ weaponId: WeaponId.MachineGunCar, mounted: true });
  });
});

it('dispatches an NPC grenade with the non-player throw strength and reload cadence', () => {
  const game = makeGame();
  const target = game.addPlayer('target');
  target.wanted = 5;
  game.restore({ ...target, y: target.y + 256 });
  const npc = makeNpc({ x: target.x, y: target.y - 256, z: target.z, weapon: WeaponId.Grenade, weaponAmmo: 2 });
  game.restoreWorld([], [], [], [npc]);
  game.setPoliceAttackPlayer(true);

  game.step(new Map());
  expect(game.gameObjects.projectiles.some(object => object.state.actor === 'npc:1')).toBe(false);
  expect(game.gameState.npcStates[0]?.weaponAmmo).toBe(2);
  for (let tick = 0; tick < 5; tick++) game.step(new Map());

  const projectile = game.gameObjects.projectiles.find(object => object.state.actor === 'npc:1');
  expect(projectile).toBeDefined();
  expect(projectile?.state.weapon).toBe(WeaponId.Grenade);
  expect(projectile?.state.vy).toBeCloseTo(sourceThrowableSpeed(WeaponId.Grenade, 30), 5);
  expect(game.gameState.npcStates[0]?.weaponAmmo).toBe(1);
  expect(game.gameState.npcStates[0]?.weaponCooldown).toBe(50);
  expect(game.events.some(event => event.type === 'shot' && event.actor === 'npc:1' && event.weapon === WeaponId.Grenade)).toBe(true);
});

it('dispatches an NPC flamethrower through the authoritative moving projectile path', () => {
  const game = makeGame();
  const target = game.addPlayer('target');
  target.wanted = 5;
  game.restore({ ...target, y: target.y + 96 });
  const npc = makeNpc({ x: target.x, y: target.y - 96, z: target.z, weapon: WeaponId.Flamethrower, weaponAmmo: 2 });
  game.restoreWorld([], [], [], [npc]);
  game.setPoliceAttackPlayer(true);

  game.step(new Map());

  const projectile = game.gameObjects.projectiles.find(object => object.state.actor === 'npc:1');
  expect(projectile?.state).toMatchObject({ weapon: WeaponId.Flamethrower, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, collision: true });
  expect(game.gameState.npcStates[0]?.weaponAmmo).toBe(1);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'shot', actor: 'npc:1', weapon: WeaponId.Flamethrower }));
});

it('deploys an NPC land mine from a vehicle rear point and consumes ammo only after placement', () => {
  const game = makeGame();
  const target = game.addPlayer('target');
  target.wanted = 5;
  game.restore({ ...target, y: target.y + 256 });
  const vehicle = makeVehicle(0);
  vehicle.x = target.x;
  vehicle.y = target.y - 256;
  vehicle.z = target.z;
  const npc = makeNpc({ x: vehicle.x, y: vehicle.y, z: vehicle.z, vehicleId: vehicle.id, weapon: WeaponId.LandMines, weaponAmmo: 2 });
  game.restoreWorld([], [vehicle], [], [npc]);
  game.setPoliceAttackPlayer(true);

  game.step(new Map());

  expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({
    kind: 'mine', owner: 'npc:1', sourceModel: GTA2_SOURCE_OBJECT_MODELS.carMine, life: Number.MAX_SAFE_INTEGER,
  }));
  expect(game.gameState.npcStates[0]?.weaponAmmo).toBe(1);
  expect(game.events).toContainEqual(expect.objectContaining({ type: 'shot', actor: 'npc:1', weapon: WeaponId.LandMines }));
});

it('fires tank, fire-truck, and army-jeep weapons from authored turret origins', () => {
  for (const [model, weapon] of [[54, WeaponId.TankMainGun], [17, WeaponId.FireTruckGun], [22, WeaponId.ArmyGunJeep]] as const) {
    const game = makeGame();
    const target = game.addPlayer(`target-${model}`);
    target.wanted = 5;
    game.restore({ ...target, y: target.y + 256 });
    const vehicle = makeVehicle(model);
    vehicle.x = target.x;
    vehicle.y = target.y - 256;
    vehicle.z = target.z;
    const npc = makeNpc({ x: vehicle.x, y: vehicle.y, z: vehicle.z, vehicleId: vehicle.id, weapon: undefined });
    game.restoreWorld([], [vehicle], [], [npc]);
    game.setPoliceAttackPlayer(true);

    game.step(new Map());

    expect(game.gameState.npcStates[0]?.weapon).toBe(weapon);
    expect(game.gameObjects.projectiles.find(object => object.state.actor === 'npc:1')?.state.weapon).toBe(weapon);
    expect(game.events).toContainEqual(expect.objectContaining({ type: 'shot', actor: 'npc:1', weapon }));
  }
});

it('does not let a passenger NPC dispatch the driver-mounted weapon', () => {
  const game = makeGame();
  const target = game.addPlayer('target');
  target.wanted = 5;
  game.restore({ ...target, y: target.y + 256 });
  const vehicle = makeVehicle(54);
  vehicle.x = target.x;
  vehicle.y = target.y - 256;
  vehicle.z = target.z;
  vehicle.passengers = ['driver', 'npc:1'];
  vehicle.occupants = [
    { id: 'driver', door: 0, state: 'seated', progress: 1 },
    { id: 'npc:1', door: 1, state: 'seated', progress: 1 },
  ];
  const npc = makeNpc({ x: vehicle.x, y: vehicle.y, z: vehicle.z, vehicleId: vehicle.id, weapon: undefined, weaponAmmo: 2 });
  game.restoreWorld([], [vehicle], [], [npc]);
  game.setPoliceAttackPlayer(true);

  game.step(new Map());

  expect(game.gameObjects.projectiles.some(object => object.state.actor === 'npc:1')).toBe(false);
  expect(game.gameState.npcStates[0]?.weaponAmmo).toBe(WEAPONS[WeaponId.TankMainGun]!.sourceDefaultAmmo);
  expect(game.events.some(event => event.type === 'shot' && event.actor === 'npc:1')).toBe(false);
});

it('damages a target and replicates the authoritative NPC projectile shot', () => {
  const server = makeGame();
  const target = server.addPlayer('target');
  target.wanted = 5;
  server.restore({ ...target, y: target.y + 96 });
  const npc = makeNpc({ x: target.x, y: target.y - 96, z: target.z, weapon: WeaponId.Pistol, weaponAmmo: 3 });
  server.restoreWorld([], [], [], [npc]);
  server.setPoliceAttackPlayer(true);

  for (let tick = 0; tick < 6; tick++) server.step(new Map());

  expect(target.combat.health).toBeLessThan(100);
  const worldSnapshot = server.snapshotWorld();
  const npcSnapshot = worldSnapshot.npcs.find(item => item.id === 1);
  expect(npcSnapshot?.shots.some(shot => shot.projectile && shot.weapon === WeaponId.Pistol)).toBe(true);

  const client = new GameWorld(parseMap(mapFixture()), 'target');
  client.addPlayer('target');
  const playerSnapshot = server.snapshot().find(item => item.id === 'target');
  expect(playerSnapshot).toBeDefined();
  client.restore(playerSnapshot!);
  client.restoreWorld([], [], [], worldSnapshot.npcs);

  expect(client.gameObjects.findNpc(1)?.state.shots.some(shot => shot.projectile)).toBe(true);
  expect(client.gameObjects.projectiles.some(projectile => projectile.state.actor === 'npc:1')).toBe(true);
});

it('replicates NPC shock, burning threat, damage, and lethal state transitions', () => {
  const game = makeGame();
  const victim = makeNpc({ id: 2, kind: 'civilian', state: 'walk', animation: 'walking', target: undefined, weapon: undefined, weaponAmmo: undefined, health: 3 });
  game.restoreWorld([], [], [], [victim]);
  const object = game.gameObjects.findNpc(2)!;
  const combat = game.gameObjectCombatContext();

  object.receiveWeaponHit(0, GTA2_SOURCE_OBJECT_MODELS.fireHitting, 'npc:1', combat);
  expect(object.state.onFire).toBe(true);
  expect(object.state.state).toBe('flee');
  expect(object.state.animation).toBe('running');
  expect(object.state.threatenedBy).toBe('npc:1');
  object.tickStatus(combat);
  expect(object.state.health).toBe(2);

  object.shock(WORLD.combat.electrocutionThreshold);
  expect(object.state.electrocuted).toBe(true);
  expect(object.state.animation).toBe('electrocuted');

  object.receiveWeaponHit(99, undefined, 'npc:1', combat);
  expect(object.state.health).toBe(0);
  expect(object.state.state).toBe('dead');
  expect(object.state.deathCause).toBe('weapon');
  expect(object.state.killer).toBe('npc:1');
});
