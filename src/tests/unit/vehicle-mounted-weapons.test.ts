import { describe, expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import { mapFixture } from './fixtures';
import { GTA2_SOURCE_OBJECT_MODELS } from '../../shared/domain/world/gta2-sprites';
import { SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS, vehicleBombAnimationState } from '../../shared/domain/vehicles/vehicle-weapons';
import { WeaponId } from '../../shared/domain/combat/weapons';
import { GTA2_VEHICLE_DAMAGE } from '../../shared/domain/combat/vehicle-damage';
import type { TrafficState } from '../../shared/protocol/types';

const makeGame = () => new GameWorld(parseMap(mapFixture()));

function vehicleState(id: number, model: number, driver: string, x: number, y: number, rotation = 0): TrafficState {
  return {
    id, model, x, y, z: 0, rotation, vx: 0, vy: 0, speed: 0, angularVelocity: 0,
    throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [driver],
    occupants: [{ id: driver, door: 0, state: 'seated', progress: 1 }],
    doorStates: [], health: 100,
  };
}

function mountedScenario(model: number, weapon: number, targetOffsetY: number, rotation = 0) {
  const game = makeGame();
  const driver = game.addPlayer(`driver-${model}-${weapon}`);
  const target = game.addPlayer(`target-${model}-${weapon}`);
  const source = vehicleState(100 + model, model, driver.id, driver.x, driver.y, rotation);
  game.restoreWorld([], [source]);
  game.restore({ ...driver, vehicleId: source.id, animation: { kind: 'seated', progress: 1 } });
  game.restore({ ...target, x: driver.x, y: driver.y + targetOffsetY, z: driver.z });
  const vehicle = game.gameObjects.findVehicle(source.id);
  if (!vehicle) throw new Error(`Vehicle ${source.id} was not created`);
  driver.combat!.weapon = weapon;
  driver.combat!.ammo[weapon] = 20;
  return { game, driver, target, vehicle };
}

function mountedVehicleTargetScenario(targetModel: number, weapon: number) {
  const game = makeGame();
  const driver = game.addPlayer(`vehicle-driver-${targetModel}-${weapon}`);
  const source = vehicleState(300 + targetModel, 17, driver.id, driver.x, driver.y, 0);
  const targetSource = vehicleState(400 + targetModel, targetModel, '', driver.x, driver.y - 100, 0);
  targetSource.passengers = [];
  targetSource.occupants = [];
  game.restoreWorld([], [source, targetSource]);
  game.restore({ ...driver, vehicleId: source.id, animation: { kind: 'seated', progress: 1 } });
  const vehicle = game.gameObjects.findVehicle(source.id);
  const target = game.gameState.vehicleStates.find(item => item.id === targetSource.id);
  if (!vehicle || !target) throw new Error('Mounted vehicle target was not created');
  driver.combat!.weapon = weapon;
  driver.combat!.ammo[weapon] = 20;
  return { game, driver, vehicle, target };
}

describe('source mounted vehicle weapons', () => {
  it('requires the driver and gates every vehicle-only source family by chassis', () => {
    const cases = [
      { model: 54, allowed: [19] },
      { model: 17, allowed: [20, 21] },
      { model: 22, allowed: [22] },
    ];

    for (const item of cases) {
      const game = makeGame();
      const driver = game.addPlayer(`driver-${item.model}`);
      const passenger = game.addPlayer(`passenger-${item.model}`);
      const source = vehicleState(item.model, item.model, driver.id, driver.x, driver.y);
      source.passengers.push(passenger.id);
      source.occupants.push({ id: passenger.id, door: 1, state: 'seated', progress: 1 });
      game.restoreWorld([], [source]);
      game.restore({ ...driver, vehicleId: source.id, animation: { kind: 'seated', progress: 1 } });
      game.restore({ ...passenger, vehicleId: source.id, animation: { kind: 'seated', progress: 1 } });
      const vehicle = game.gameObjects.findVehicle(source.id)!;

      for (const sourceType of [19, 20, 21, 22]) {
        expect(vehicle.canFireWeapon(sourceType, driver.id)).toBe(item.allowed.includes(sourceType));
        expect(vehicle.canFireWeapon(sourceType, passenger.id)).toBe(false);
      }
      expect(vehicle.canFireWeapon(15, driver.id)).toBe(true);
      expect(vehicle.canFireWeapon(23, passenger.id)).toBe(false);
      expect(vehicle.canFireWeapon(18, driver.id)).toBe(false);
      vehicle.mutableVehicleState.mountedWeapons = [18];
      expect(vehicle.canFireWeapon(18, driver.id)).toBe(true);
      expect(vehicle.canFireWeapon(18, passenger.id)).toBe(false);
    }
  });

  it('uses the authored fire-truck and army-jeep muzzle geometry', () => {
    const fireTruck = mountedScenario(17, WeaponId.FireTruckGun, -100);
    const fireTruckOrigin = fireTruck.vehicle.weaponOrigins(20, fireTruck.driver.id)[0]!;
    expect(fireTruckOrigin.x).toBeCloseTo(fireTruck.vehicle.state.x);
    expect(fireTruckOrigin.y).toBeCloseTo(fireTruck.vehicle.state.y - 6);
    expect(fireTruckOrigin.angle).toBeCloseTo(Math.PI);

    const armyJeep = mountedScenario(22, WeaponId.ArmyGunJeep, 100);
    const armyOrigin = armyJeep.vehicle.weaponOrigins(22, armyJeep.driver.id)[0]!;
    expect(armyOrigin.x).toBeCloseTo(armyJeep.vehicle.state.x);
    expect(armyOrigin.y).toBeCloseTo(armyJeep.vehicle.state.y - 12);
    expect(armyOrigin.angle).toBeCloseTo(0);
  });

  it('fires the fire-truck water gun through the authoritative ray, extinguishing a player', () => {
    const { game, driver, target } = mountedScenario(17, WeaponId.FireTruckGun, -100);
    game.gameObjects.findPlayer(target.id)!.setOnFire(game.gameObjectCombatContext());

    game.step(new Map([[driver.id, 16]]));

    expect(target.combat!.onFire).toBe(false);
    expect(target.combat!.health).toBe(97);
    expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', actor: driver.id, target: target.id, weapon: WeaponId.FireTruckGun, damage: 2 }));
  });

  it('extinguishes a burning vehicle and keeps it extinguished until a new flame hit', () => {
    const game = makeGame();
    const driver = game.addPlayer('fire-truck-water-driver');
    const source = vehicleState(117, 17, driver.id, driver.x, driver.y, 0);
    const targetSource = vehicleState(217, 0, '', driver.x, driver.y - 100, 0);
    targetSource.passengers = [];
    targetSource.occupants = [];
    targetSource.health = 50;
    targetSource.damage = GTA2_VEHICLE_DAMAGE.smallFire;
    targetSource.damageLevel = 3;
    targetSource.damagePhase = 'burning';
    game.restoreWorld([], [source, targetSource]);
    game.restore({ ...driver, vehicleId: source.id, animation: { kind: 'seated', progress: 1 } });
    const target = game.gameState.vehicleStates.find(vehicle => vehicle.id === targetSource.id)!;
    game.spawnVehicleFireHazard(target, 9_000);
    const fireBefore = game.gameState.hazardStates.find(hazard => hazard.owner === `vehicle:${target.id}:fire`);
    expect(fireBefore).toBeDefined();

    driver.combat!.weapon = WeaponId.FireTruckGun;
    driver.combat!.ammo[WeaponId.FireTruckGun] = 1;
    game.step(new Map([[driver.id, 16]]));

    expect(target.fireExtinguished).toBe(true);
    expect(target.health).toBe(50);
    expect(game.gameState.hazardStates.some(hazard => hazard.owner === `vehicle:${target.id}:fire`)).toBe(false);

    game.step(new Map([[driver.id, 0]]));
    expect(game.gameState.hazardStates.some(hazard => hazard.owner === `vehicle:${target.id}:fire`)).toBe(false);
  });

  it('fires the fire-truck flamethrower through a moving source stream and ignites its target', () => {
    const { game, driver, target } = mountedScenario(17, WeaponId.FireTruckFlamethrower, -30);

    game.step(new Map([[driver.id, 16]]));
    const shot = game.events.find(event => event.type === 'shot' && event.actor === driver.id && event.weapon === WeaponId.FireTruckFlamethrower);
    for (let tick = 0; tick < 30; tick++) game.step(new Map([[driver.id, 0]]));

    expect(target.combat!.onFire).toBe(true);
    expect(target.combat!.health).toBeLessThan(100);
    expect(shot).toBeDefined();
  });

  it('damages ordinary vehicles with the fire-truck flame stream but filters the flameproof tank', () => {
    const car = mountedVehicleTargetScenario(0, WeaponId.FireTruckFlamethrower);
    car.game.step(new Map([[car.driver.id, 16]]));
    for (let tick = 0; tick < 18; tick++) car.game.step(new Map([[car.driver.id, 0]]));
    expect(car.target.damage).toBeGreaterThan(0);

    const tank = mountedVehicleTargetScenario(54, WeaponId.FireTruckFlamethrower);
    tank.game.step(new Map([[tank.driver.id, 16]]));
    for (let tick = 0; tick < 18; tick++) tank.game.step(new Map([[tank.driver.id, 0]]));
    expect(tank.target.damage ?? 0).toBe(0);
    expect(tank.target.health).toBe(100);
  });

  it('fires the army-jeep gun through the authoritative ray and damages a player', () => {
    const { game, driver, target } = mountedScenario(22, WeaponId.ArmyGunJeep, 100);

    game.step(new Map([[driver.id, 16]]));

    expect(target.combat!.health).toBeLessThan(100);
    expect(game.events).toContainEqual(expect.objectContaining({ type: 'hit', actor: driver.id, target: target.id, weapon: WeaponId.ArmyGunJeep }));
  });

  it('covers tank cannon, car machine gun, and both car-bomb dispatches', () => {
    const tank = mountedScenario(54, WeaponId.TankMainGun, -70, Math.PI);
    gameFireAndWait(tank.game, tank.driver.id, 10);
    expect(tank.game.gameState.hazardStates).toContainEqual(expect.objectContaining({ effect: 'explosion', sourceModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact }));

    const carGun = mountedScenario(0, WeaponId.MachineGunCar, -40, Math.PI);
    carGun.vehicle.mutableVehicleState.mountedWeapons = [18];
    carGun.game.step(new Map([[carGun.driver.id, 16]]));
    expect(carGun.target.combat!.health).toBeLessThan(100);

    const bomb = mountedScenario(0, WeaponId.CarBomb, 100);
    expect(bomb.vehicle.fireCarBomb(bomb.game.gameObjects.findPlayer(bomb.driver.id)!, false, bomb.game.gameObjectCombatContext())).toBe(true);
    const armed = bomb.game.gameState.hazardStates.find(state => state.sourceModel === GTA2_SOURCE_OBJECT_MODELS.movingCarBomb);
    expect(armed).toMatchObject({ armingTimer: SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS, vehicleId: bomb.vehicle.id });
    expect(vehicleBombAnimationState(armed?.armingTimer)).toBe('armed');
    for (let tick = 0; tick < SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS - 1; tick++) bomb.game.updateGameObjects();
    expect(armed?.armingTimer).toBe(1);
    expect(bomb.game.events).not.toContainEqual(expect.objectContaining({ type: 'explosion', weapon: WeaponId.CarBomb }));
    bomb.game.updateGameObjects();
    expect(vehicleBombAnimationState(armed?.armingTimer)).toBe('triggered');
    expect(bomb.game.events).toContainEqual(expect.objectContaining({ type: 'explosion', weapon: WeaponId.CarBomb }));

    const special = mountedScenario(0, WeaponId.SpecialVehicleBomb, 100);
    const specialPlayer = special.game.gameObjects.findPlayer(special.driver.id)!;
    expect(special.vehicle.fireCarBomb(specialPlayer, true, special.game.gameObjectCombatContext())).toBe(true);
    expect(special.game.gameState.hazardStates).toContainEqual(expect.objectContaining({ effect: 'explosion', explosionType: 'large', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb }));
    expect(special.game.events).toContainEqual(expect.objectContaining({ type: 'explosion', weapon: WeaponId.SpecialVehicleBomb }));
  });
});

function gameFireAndWait(game: GameWorld, driverId: string, ticks: number) {
  game.step(new Map([[driverId, 16]]));
  for (let tick = 1; tick < ticks; tick++) game.step(new Map([[driverId, 0]]));
}
