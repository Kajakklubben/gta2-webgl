import { describe, expect, it } from 'vitest';
import { decodeFace, parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture, npcDefaults } from './fixtures';
import { GameWorld } from '../../shared/game/game-world';
import { ProjectileController } from '../../shared/game/runtime/projectile-controller';
import { ProjectileObject } from '../../shared/game/effects/projectile';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { WeaponId } from '../../shared/domain/combat/weapons';
import type { NpcState, TrafficState } from '../../shared/protocol/types';

const makeGame = (blocked = false) => {
  const level = parseMap(mapFixture());
  if (blocked) {
    level.map[85]![189]![4] = { ...level.map[85]![190]![3]!, Bottom: decodeFace(1024) };
  }
  return new GameWorld(level);
};

function vehicleState(id: number, x: number, y: number, model = 0): TrafficState {
  return {
    id, model, x, y, z: 0, rotation: 0, vx: 0, vy: 0, speed: 0, angularVelocity: 0,
    throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0,
    passengers: [], occupants: [], doorStates: [], health: 100,
  };
}

function npcState(id: number, x: number, y: number, z = 0): NpcState {
  return {
    ...npcDefaults(), id, x, y, z, rotation: 0, vx: 0, vy: 0, health: 100,
    kind: 'civilian', state: 'idle', animation: 'idle',
  };
}

function firePlayerWeapon(game: GameWorld, weapon: WeaponId, ammo = 20) {
  const shooter = game.addPlayer(`shooter-${weapon}`);
  shooter.combat!.weapon = weapon;
  shooter.combat!.ammo[weapon] = ammo;
  return shooter;
}

function advanceUntil(game: GameWorld, predicate: () => boolean, limit = 12) {
  for (let tick = 0; tick < limit && !predicate(); tick++) game.step(new Map());
}

describe('ordinary firearm regression paths', () => {
  it.each([WeaponId.Pistol, WeaponId.MachineGun])('stops weapon %s at a wall while reporting wanted fire', weapon => {
    const game = makeGame(true);
    const shooter = firePlayerWeapon(game, weapon);
    const target = game.addPlayer(`wall-target-${weapon}`);
    game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));

    expect(target.combat!.health).toBe(100);
    expect(shooter.wanted).toBe(1);
    expect(shooter.combat!.shots[0]!.endY - shooter.y).toBeLessThan(40);
  });

  it.each([
    [WeaponId.Pistol, 1_600, 95],
    [WeaponId.MachineGun, 800, 98],
  ] as const)('applies the source vehicle packet for weapon %s and reports wanted fire', (weapon, sourceDamage, health) => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, weapon);
    const vehicle = vehicleState(40 + weapon, shooter.x, shooter.y + 100);
    game.restoreWorld([], [vehicle]);
    const liveVehicle = game.gameState.vehicleStates.find(item => item.id === vehicle.id)!;

    game.step(new Map([[shooter.id, 16]]));

    expect(liveVehicle.damage).toBe(sourceDamage);
    expect(liveVehicle.health).toBe(health);
    expect(shooter.wanted).toBe(1);
    expect(game.events).toContainEqual(expect.objectContaining({ type: 'vehicle-damage', entity: liveVehicle.id, actor: shooter.id }));
  });
});

describe('stun gun regression paths', () => {
  it('shocks a player without damaging health', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.StunGun);
    const target = game.addPlayer('stun-player-target');
    game.restore({ ...target, x: shooter.x, y: shooter.y + 80, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));

    expect(target.combat!.health).toBe(100);
    expect(target.combat!.shockCounter).toBe(5);
    expect(target.combat!.electrocuted).toBe(false);
  });

  it('shocks an NPC through the source cone', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.StunGun);
    const npc = npcState(77, shooter.x, shooter.y + 80, shooter.z);
    game.restoreWorld([], [], [], [npc]);
    const liveNpc = game.gameState.npcStates.find(item => item.id === npc.id)!;

    game.step(new Map([[shooter.id, 16]]));

    expect(liveNpc.health).toBe(100);
    expect(liveNpc.shockCounter).toBe(5);
    expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', target: `npc:${liveNpc.id}`, weapon: WeaponId.StunGun, damage: 0 }));
  });

  it('applies the source stun packet to a vehicle', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.StunGun);
    const vehicle = vehicleState(78, shooter.x, shooter.y + 80);
    game.restoreWorld([], [vehicle]);
    const liveVehicle = game.gameState.vehicleStates.find(item => item.id === vehicle.id)!;

    game.step(new Map([[shooter.id, 16]]));

    expect(liveVehicle.damage).toBe(300);
    expect(liveVehicle.health).toBe(100);
  });

  it('does not shock a player hidden behind a wall', () => {
    const game = makeGame(true);
    const shooter = firePlayerWeapon(game, WeaponId.StunGun);
    const target = game.addPlayer('stun-wall-target');
    game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));

    expect(target.combat!.health).toBe(100);
    expect(target.combat!.shockCounter).toBe(0);
    expect(game.events.some(event => event.type === 'hit' && event.target === target.id)).toBe(false);
  });
});

describe('shotgun regression paths', () => {
  it('hits multiple targets with the five source pellet rays', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.Shotgun, 2);
    const distance = 200;
    const spreads = [48, 24, 0, -24, -48];
    const targets = spreads.map((spread, index) => {
      const angle = spread * Math.PI * 2 / 1440;
      const target = game.addPlayer(`shotgun-target-${index}`);
      game.restore({ ...target, x: shooter.x - Math.sin(angle) * distance, y: shooter.y + Math.cos(angle) * distance, z: shooter.z });
      return target;
    });

    game.step(new Map([[shooter.id, 16]]));

    expect(targets.filter(target => target.combat!.health < 100)).toHaveLength(5);
    expect(shooter.combat!.shots.filter(shot => shot.weapon === WeaponId.Shotgun)).toHaveLength(5);
  });

  it('stops every shotgun pellet at a wall instead of damaging the target behind it', () => {
    const game = makeGame(true);
    const shooter = firePlayerWeapon(game, WeaponId.Shotgun);
    const target = game.addPlayer('shotgun-wall-target');
    game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));

    expect(target.combat!.health).toBe(100);
    expect(shooter.combat!.shots.filter(shot => shot.weapon === WeaponId.Shotgun)).toHaveLength(5);
  });

  it('applies at least one source shotgun pellet packet to a vehicle', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.Shotgun);
    const vehicle = vehicleState(90, shooter.x, shooter.y + 100);
    game.restoreWorld([], [vehicle]);
    const liveVehicle = game.gameState.vehicleStates.find(item => item.id === vehicle.id)!;

    game.step(new Map([[shooter.id, 16]]));

    expect(liveVehicle.damage).toBeGreaterThanOrEqual(800);
    expect(shooter.wanted).toBe(1);
  });
});

describe('electro-shock regression paths', () => {
  it('travels as a shock projectile before applying player damage and shock', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.ElectroShock);
    const target = game.addPlayer('electro-player-target');
    game.restore({ ...target, x: shooter.x, y: shooter.y + 80, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));
    const projectile = game.gameObjects.projectiles.find(object => object.state.weapon === WeaponId.ElectroShock);
    expect(projectile?.state.projectileType).toBe('shock');
    expect(projectile?.state.collision).toBe(true);
    expect(projectile?.state.waterDeath).toBe(true);
    advanceUntil(game, () => game.events.some(event => event.type === 'hit' && event.target === target.id));

    expect(target.combat!.health).toBe(97);
    expect(target.combat!.shockCounter).toBeGreaterThan(0);
  });

  it('terminates an electro-shock projectile on a wall without hitting a player behind it', () => {
    const game = makeGame(true);
    const shooter = firePlayerWeapon(game, WeaponId.ElectroShock);
    const target = game.addPlayer('electro-wall-target');
    game.restore({ ...target, x: shooter.x, y: shooter.y + 100, z: shooter.z });

    game.step(new Map([[shooter.id, 16]]));
    advanceUntil(game, () => game.gameObjects.projectiles.every(object => object.state.weapon !== WeaponId.ElectroShock));

    expect(target.combat!.health).toBe(100);
    expect(game.gameState.hazardStates).toContainEqual(expect.objectContaining({ kind: 'impact', sourceModel: GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet }));
  });

  it('dies in water through the source projectile water path', () => {
    const weaponSystem = new GameWorld(parseMap(mapFixture())).weaponSystem;
    const projectile = new ProjectileObject('electro-water', {
      actor: 'shooter', weapon: WeaponId.ElectroShock, x: 0, y: 0, endX: 0, endY: 20, z: 0, life: 4,
      sourceModel: GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet, collision: true, waterDeath: true,
    });
    const effects: Array<{ kind: string }> = [];
    const controller = new ProjectileController({
      weaponSystem, projectiles: () => [projectile],
      physicsWorld: { rayCast: () => 1, queryCircle: () => [] },
      tick: () => 1, register: () => undefined, isWaterAt: () => true,
      spawnEffect: effect => effects.push(effect),
    });

    controller.resolveCollisions();

    expect(projectile.state.destroyedByWater).toBe(true);
    expect(effects).toContainEqual(expect.objectContaining({ kind: 'water' }));
  });

  it('shocks and damages an NPC through the moving projectile path', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.ElectroShock);
    const npc = npcState(91, shooter.x, shooter.y + 80, shooter.z);
    game.restoreWorld([], [], [], [npc]);
    const liveNpc = game.gameState.npcStates.find(item => item.id === npc.id)!;

    game.step(new Map([[shooter.id, 16]]));
    advanceUntil(game, () => game.events.some(event => event.type === 'hit' && event.target === `npc:${liveNpc.id}`));

    expect(liveNpc.health).toBe(97);
    expect(liveNpc.shockCounter).toBeGreaterThan(0);
  });

  it('resolves a vehicle hit through the moving projectile path without inventing car damage', () => {
    const game = makeGame();
    const shooter = firePlayerWeapon(game, WeaponId.ElectroShock);
    const vehicle = vehicleState(92, shooter.x, shooter.y + 80);
    game.restoreWorld([], [vehicle]);
    const liveVehicle = game.gameState.vehicleStates.find(item => item.id === vehicle.id)!;

    game.step(new Map([[shooter.id, 16]]));
    advanceUntil(game, () => shooter.combat!.shots.some(shot => shot.weapon === WeaponId.ElectroShock && shot.beam && shot.impact));

    expect(shooter.combat!.shots.some(shot => shot.weapon === WeaponId.ElectroShock && shot.beam && shot.impact)).toBe(true);
    expect(liveVehicle.damage).toBe(0);
    expect(liveVehicle.health).toBe(100);
  });
});
