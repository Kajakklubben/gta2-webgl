import { describe, expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { VehicleObject } from '../../shared/game/gameobjects/vehicle/vehicle';
import { integrateVehicle } from '../../shared/domain/physics/vehicle-integration';
import { SOURCE_OIL_GRIP_SCALE, SOURCE_OIL_SPIN_TICKS, sourceOilSpinDirection } from '../../shared/domain/physics/vehicle-skid';
import { WeaponId } from '../../shared/domain/combat/weapons';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from './fixtures';

const vehicleState = (id = 7, model = 0): TrafficState => ({
  id, model, x: 85 * 64, y: -190 * 64, z: 3, rotation: 0, speed: 0,
  vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1,
  handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100,
});

describe('vehicle oil and mine handling', () => {
  it('uses Weapon_30 rear offsets and alternates the oil drop side', () => {
    const car = new VehicleObject(vehicleState(), undefined, { width: 36, height: 66 });

    expect(car.rearHazardPoint(16, 0)).toEqual({ x: 5450, y: -12205, z: 3 });
    expect(car.rearHazardPoint(16, 1)).toEqual({ x: 5430, y: -12205, z: 3 });
    expect(car.rearHazardPoint(17, 0)).toEqual({ x: 5440, y: -12203, z: 3 });
    expect(car.rearHazardPoint(15, 0)).toBeUndefined();
  });

  it('arms persistent authored hazards at the supporting surface and only from the driver seat', () => {
    const game = new GameWorld(parseMap(mapFixture()));
    const driver = game.addPlayer('oil-driver');
    const vehicle = vehicleState(9);
    vehicle.x = driver.x; vehicle.y = driver.y; vehicle.z = driver.z;
    vehicle.passengers = [driver.id];
    vehicle.occupants = [{ id: driver.id, door: 0, state: 'seated', progress: 1 }];
    game.restoreWorld([], [vehicle]);
    game.restore({ ...driver, vehicleId: vehicle.id, animation: { kind: 'seated', progress: 1 } });

    const car = game.gameObjects.findVehicle(vehicle.id)!;
    const player = game.gameObjects.findPlayer(driver.id)!;
    driver.combat!.ammo[WeaponId.OilSlicks] = 2;
    expect(car.deployHazard(player, WeaponId.OilSlicks, game.gameObjectCombatContext())).toBe(true);

    const slick = game.gameState.hazardStates.find(hazard => hazard.kind === 'slick');
    expect(slick).toMatchObject({ kind: 'slick', sourceModel: 8, owner: driver.id, rotation: vehicle.rotation });
    expect(slick!.life).toBe(Number.MAX_SAFE_INTEGER);
    expect(slick!.x).toBeCloseTo(vehicle.x + 10);
    expect(slick!.y).toBeCloseTo(vehicle.y - 45);
    expect(slick!.z).toBeCloseTo(vehicle.z);

    car.mutableVehicleState.passengers = [driver.id, 'passenger'];
    car.mutableVehicleState.occupants.push({ id: 'passenger', door: 1, state: 'seated', progress: 1 });
    expect(car.deployHazard(player, WeaponId.LandMines, game.gameObjectCombatContext())).toBe(true);
    const mine = game.gameState.hazardStates.find(hazard => hazard.kind === 'mine');
    expect(mine).toMatchObject({ kind: 'mine', sourceModel: 10, owner: driver.id, rotation: vehicle.rotation });
    expect(mine!.life).toBe(Number.MAX_SAFE_INTEGER);
    expect(mine!.x).toBeCloseTo(vehicle.x);
    expect(mine!.y).toBeCloseTo(vehicle.y - 43);

    car.mutableVehicleState.passengers = ['passenger', driver.id];
    car.mutableVehicleState.occupants[0]!.id = 'passenger';
    car.mutableVehicleState.occupants[1]!.id = driver.id;
    expect(car.deployHazard(player, WeaponId.OilSlicks, game.gameObjectCombatContext())).toBe(false);
  });

  it('uses the existing oil hazard query to arm a 30-tick spin and ignores trains', () => {
    const game = new GameWorld(parseMap(mapFixture()));
    const carState = vehicleState(12);
    game.restoreWorld([], [carState], [{ id: 1, x: carState.x, y: carState.y, z: carState.z, kind: 'slick', life: 50, owner: 'other' }]);
    const car = game.gameObjects.findVehicle(carState.id)!;

    expect(car.oilSpinTicksRemaining).toBe(0);
    game.syncCollisionWorld();
    game.step(new Map());
    expect(car.oilSpinTicksRemaining).toBe(SOURCE_OIL_SPIN_TICKS - 1);
    expect(car.oilSpinDirection).toBe(sourceOilSpinDirection(carState.id));

    const train = new VehicleObject(vehicleState(13, 59));
    expect(train.spinOutOnOil()).toBe(false);
    expect(train.oilSpinTicksRemaining).toBe(0);
  });

  it('loses lateral grip on oil without weakening normal vehicle grip', () => {
    const base = { ...vehicleState(), vx: 120, vy: 0, speed: 0 };
    const normal = { ...base };
    const slippery = { ...base };
    integrateVehicle(normal, { throttle: 0, steer: 0 }, undefined, 1 / 30);
    integrateVehicle(slippery, { throttle: 0, steer: 0, slippery: true }, undefined, 1 / 30);

    expect(Math.abs(slippery.vx)).toBeGreaterThan(Math.abs(normal.vx));
    expect(SOURCE_OIL_GRIP_SCALE).toBeLessThan(1);
  });

  it('keeps forced steering direction stable through recovery', () => {
    const car = new VehicleObject(vehicleState(21));
    expect(car.spinOutOnOil()).toBe(true);
    const direction = car.oilSpinDirection;
    for (let tick = 0; tick < SOURCE_OIL_SPIN_TICKS; tick++) {
      car.drive({ throttle: 0, steer: 0 }, undefined, 1 / 30, { advancePose: true });
      if (tick < SOURCE_OIL_SPIN_TICKS - 1) expect(car.oilSpinDirection).toBe(direction);
    }
    expect(car.oilSpinTicksRemaining).toBe(0);
    expect(car.oilSpinDirection).toBe(0);
  });
});
