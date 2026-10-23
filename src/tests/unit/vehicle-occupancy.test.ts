import { describe, expect, it } from 'vitest';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { CarInfo, CarDoor } from '../../shared/engine/loader/style-parser';
import type { NpcState, TrafficState } from '../../shared/protocol/types';
import { mapFixture, npcDefaults } from './fixtures';
import { vehicleDoorAlignment, vehicleDoorDefinitions, vehicleDoorPoint, vehicleDoorRenderDelta, vehicleEntryAlignmentPhase, vehicleExitAlignmentPhase, vehicleSeatDefinitions } from '../../shared/domain/vehicles/vehicle-occupancy';
import { vehicleExitPosition, type VehicleEntryContext } from '../../shared/game/runtime/vehicle-entry';
import { WORLD } from '../../shared/domain/world/world';

function carInfo(passengers = 2): CarInfo {
  const doors: CarDoor[] = [
    { rx: 20, ry: 0, positionX: 20, positionY: 0, straightEntry: false },
    { rx: -20, ry: 0, positionX: -20, positionY: 0, straightEntry: false },
    { rx: 16, ry: 18, positionX: 16, positionY: 18, straightEntry: false },
    { rx: -16, ry: 18, positionX: -16, positionY: 18, straightEntry: false },
  ];
  return {
    model: 7, spriteCount: 1, sprite: 1, width: 40, height: 80, remaps: [], passengers, wreck: 99, rating: 0,
    frontWheelOffset: 20, rearWheelOffset: -20, frontWindowOffset: 15, rearWindowOffset: -15,
    flags: 0, flags2: 0, infoFlags: { pedJump: false, emergencyLights: false, roofLights: false, cab: false, trailer: false, forHireLights: false, roofDecal: false, rearEmergencyLights: false },
    infoFlags2: { collideOver: false, popupHeadlights: false }, doors,
  };
}

function setup() {
  const info = new Map([[7, carInfo(2)]]);
  const game = new GameWorld(parseMap(mapFixture()), undefined, [], new Map(), [], new Map([[7, { width: 40, height: 80 }]]), info);
  const vehicle: TrafficState = { id: 1, model: 7, x: 85 * 64, y: -190 * 64, z: 3, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
  game.restoreWorld([], [vehicle]);
  return { game, vehicle: game.gameState.vehicleStates[0]! };
}

function exitContext(game: GameWorld, traffic: readonly TrafficState[]): VehicleEntryContext {
  return {
    traffic,
    players: game.gameState.playerStates,
    vehicleCatalog: game.vehicleCatalog,
    collisionLayer: () => 0,
    rayCast: () => 1,
  };
}

function blocker(id: number, point: { x: number; y: number }, z: number): TrafficState {
  return { id, model: 7, x: point.x, y: point.y, z, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
}

function exitPosition(value: ReturnType<typeof vehicleExitPosition>) {
  const exit = value[0];
  if (!exit) throw new Error('Expected an exit position');
  return exit;
}

function doorPoint(value: ReturnType<typeof vehicleDoorPoint>) {
  return value;
}

function doorAlignment(value: ReturnType<typeof vehicleDoorAlignment>) {
  return value;
}

describe('source-style vehicle occupancy', () => {
  it('maps source entry and exit frames to the authored alignment phases', () => {
    expect([0, 1, 2, 3, 0, 1, 2, 3, 8].map(frame => vehicleEntryAlignmentPhase(frame, false))).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 8]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(frame => vehicleEntryAlignmentPhase(frame, true))).toEqual([7, 6, 5, 4, 3, 2, 1, 0, 8]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(frame => vehicleExitAlignmentPhase(frame, false))).toEqual([7, 6, 5, 4, 0, 1, 2, 3, 8]);
  });

  it('maps authored door deltas to the visible screen side', () => {
    expect([0, 1, 2, 3].map(door => vehicleDoorRenderDelta(door, 1))).toEqual([24, 7, 28, 11]);
  });

  it('uses the source alignment poses instead of an extra outward radius', () => {
    const { game, vehicle } = setup();
    const metadata = game.vehicleCatalog.get(vehicle.model);
    const point = doorPoint(vehicleDoorPoint(vehicle, 0, metadata.info, metadata.bounds));
    const first = doorAlignment(vehicleDoorAlignment(vehicle, 0, 0, metadata.info, metadata.bounds));
    const terminal = doorAlignment(vehicleDoorAlignment(vehicle, 0, 8, metadata.info, metadata.bounds));
    expect(point.outsideX).toBeCloseTo(first.x);
    expect(point.outsideY).toBeCloseTo(first.y);
    expect(point.seatX).toBeCloseTo(terminal.x);
    expect(point.seatY).toBeCloseTo(terminal.y);
    expect(Math.hypot(point.outsideX - vehicle.x, point.outsideY - vehicle.y)).toBeLessThan(40);
  });

  it('rotates door points with the chassis heading', () => {
    const { game, vehicle } = setup();
    vehicle.rotation = Math.PI / 2;
    const metadata = game.vehicleCatalog.get(vehicle.model);
    const point = doorPoint(vehicleDoorPoint(vehicle, 0, metadata.info, metadata.bounds));

    // Door zero is on the vehicle's local right side. With the car rotated
    // 90 degrees, that door must rotate with the chassis instead of remaining
    // on the unrotated screen side.
    expect(point.outsideX).toBeGreaterThan(vehicle.x);
    expect(point.outsideY).toBeGreaterThan(vehicle.y);
  });

  it('assigns the driver and passenger seats from CARI capacity', () => {
    const { game, vehicle } = setup();
    const driver = game.addPlayer('driver');
    const passenger = game.addPlayer('passenger');
    game.restore({ ...driver, x: vehicle.x - 34, y: vehicle.y, z: vehicle.z + 1 });
    game.restore({ ...passenger, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['driver', { seq: 1, keys: 0, action: 'enter' as const }]]));
    game.step(new Map([['passenger', { seq: 1, keys: 0, action: 'enter' as const }]]));

    expect(vehicle.occupants).toHaveLength(2);
    expect(vehicle.passengers).toEqual(['driver', 'passenger']);
    expect(vehicle.passengers?.[0]).toBe('driver');
    expect(vehicle.passengers?.indexOf('passenger')).toBe(1);
    expect(game.gameObjects.findVehicle(vehicle.id)?.driver).toBe('driver');
    expect(vehicle.doorStates?.some(door => door.phase === 'opening' || door.phase === 'open' || door.phase === 'closing')).toBe(true);
  });

  it('ejects an NPC driver when a player enters the occupied car', () => {
    const { game, vehicle } = setup();
    const npc: NpcState = {
      ...npcDefaults(), id: 47, x: vehicle.x, y: vehicle.y, z: vehicle.z, rotation: 0, vx: 0, vy: 0,
      health: 100, kind: 'civilian', state: 'driving', animation: 'idle', vehicleId: vehicle.id,
    };
    vehicle.passengers = ['npc:47'];
    vehicle.occupants = [{ id: 'npc:47', door: 0, state: 'seated', progress: 1 }];
    game.restoreWorld([], [vehicle], [], [npc]);
    const storedNpc = game.gameState.npcStates.find(candidate => candidate.id === npc.id)!;

    const player = game.addPlayer('carjacker');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });
    game.step(new Map([['carjacker', { seq: 1, keys: 0, action: 'enter' as const }]]));

    expect(vehicle.passengers).toEqual(['carjacker']);
    expect(vehicle.occupants[0]).toMatchObject({ id: 'carjacker', state: 'approaching' });
    expect(storedNpc.vehicleId).toBeUndefined();
    expect(storedNpc.state).toBe('walk');
    expect(game.gameObjects.findVehicle(vehicle.id)?.driver).toBe('carjacker');

    for (let seq = 2; seq < 40; seq++) game.step(new Map([['carjacker', { seq, keys: 0 }]]));
    game.step(new Map([['carjacker', { seq: 40, keys: 1 }]]));
    expect(vehicle.occupants[0]?.state).toBe('seated');
    expect(vehicle.throttle).toBeGreaterThan(0);
  });

  it('accepts a legacy enter action beside an empty controls array', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('gamepad');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['gamepad', { seq: 1, keys: 0, controls: [], action: 'enter' as const }]]));

    expect(game.gameState.playerStates.get('gamepad')?.vehicleId).toBe(vehicle.id);
    expect(vehicle.occupants?.[0]?.id).toBe('gamepad');
  });

  it('keeps authored zero-door vehicles non-enterable', () => {
    const info = { ...carInfo(0), doors: [] };
    const bounds = { width: 40, height: 80 };
    expect(vehicleDoorDefinitions(info, bounds)).toEqual([]);
    expect(vehicleSeatDefinitions(info, bounds)).toEqual([]);
    // Missing metadata still has the compatibility rectangle used by old
    // snapshots; only an authored empty CARI list suppresses entry.
    expect(vehicleDoorDefinitions(undefined, bounds)).toHaveLength(2);
    expect(vehicleSeatDefinitions(undefined, bounds)).toHaveLength(1);
  });

  it('selects the nearest usable door and opens it only after the player reaches it', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('right-side');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['right-side', { seq: 1, keys: 0, action: 'enter' as const }]]));

    expect(vehicle.occupants?.find(occupant => occupant.id === 'right-side')?.door).toBe(0);
    expect(vehicle.occupants?.find(occupant => occupant.id === 'right-side')?.state).toBe('approaching');
    expect(vehicle.doorStates?.[0]?.phase).toBe('closed');
    expect(vehicle.doorStates?.[1]?.phase).toBe('closed');
    expect(game.gameState.playerStates.get('right-side')?.x).toBeGreaterThan(vehicle.x);

    game.step(new Map([['right-side', { seq: 2, keys: 0 }]]));
    expect(vehicle.doorStates?.[0]?.phase).toBe('opening');
  });

  it('ignores a duplicated mobile enter pulse while the selected door is opening', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('mobile');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['mobile', { seq: 1, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));
    game.step(new Map([['mobile', { seq: 2, keys: 0, action: 'enter' as const, vehicleId: vehicle.id }]]));

    expect(game.gameState.playerStates.get('mobile')?.vehicleId).toBe(vehicle.id);
    expect(vehicle.occupants?.find(occupant => occupant.id === 'mobile')?.state).toBe('approaching');
    expect(vehicle.passengers?.[0]).toBe('mobile');
    expect(vehicle.doorStates?.[0]?.phase).toBe('opening');
  });

  it('commits one vehicle when several cars are within the entry radius', () => {
    const { game, vehicle } = setup();
    game.restoreWorld([], [{ ...vehicle, id: 2, x: vehicle.x + 120, doorStates: [], passengers: [], occupants: [] }, vehicle]);
    const first = game.gameState.vehicleStates.find(item => item.id === 1)!;
    const second = game.gameState.vehicleStates.find(item => item.id === 2)!;
    const player = game.addPlayer('chooser');
    game.restore({ ...player, x: first.x + 60, y: first.y, z: first.z + 1 });

    game.step(new Map([['chooser', { seq: 1, keys: 0, action: 'enter' as const }]]));

    expect(game.events.filter(event => event.type === 'vehicle-enter')).toHaveLength(1);
    expect(game.gameState.playerStates.get('chooser')?.vehicleId).toBe(first.id);
    expect(first.occupants).toHaveLength(1);
    expect(second.occupants).toHaveLength(0);
  });

  it('starts the authored approach from the extended entry radius', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('long-approach');
    game.restore({ ...player, x: vehicle.x + 220, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['long-approach', { seq: 1, keys: 0, action: 'enter' as const }]]));

    expect(game.gameState.playerStates.get('long-approach')?.vehicleId).toBe(vehicle.id);
    expect(vehicle.occupants?.find(occupant => occupant.id === 'long-approach')?.state).toBe('approaching');
    expect(vehicle.occupants?.find(occupant => occupant.id === 'long-approach')?.door).toBe(0);
    expect(vehicle.doorStates?.[0]?.phase).toBe('closed');
  });

  it('uses the source speed threshold for moving-car entry', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('moving-car-entry');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    vehicle.vx = WORLD.vehicle.occupancySpeedLimit - 1;
    expect(game.vehicleDoorPosition(vehicle, game.gameState.playerStates.get(player.id)!, true, 'driver')).not.toEqual([]);

    vehicle.vx = WORLD.vehicle.occupancySpeedLimit + 1;
    expect(game.vehicleDoorPosition(vehicle, game.gameState.playerStates.get(player.id)!, true, 'driver')).toEqual([]);
  });

  it('stops a slow traffic car while the player completes driver entry', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('moving-driver');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });
    vehicle.vx = WORLD.vehicle.occupancySpeedLimit - 20;
    vehicle.speed = vehicle.vx;

    game.step(new Map([['moving-driver', { seq: 1, keys: 0, action: 'enter' as const }]]));
    expect(vehicle.vx).toBe(0);
    expect(vehicle.vy).toBe(0);

    for (let seq = 2; seq < 40; seq++) game.step(new Map([['moving-driver', { seq, keys: 0 }]]));

    expect(vehicle.occupants[0]?.state).toBe('seated');
    expect(player.vehicleId).toBe(vehicle.id);
  });

  it('routes driver input from the player object into the vehicle object', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('object-driver');
    player.vehicleId = vehicle.id;
    player.animation = { kind: 'seated', progress: 1 };
    vehicle.passengers = [player.id];
    vehicle.occupants = [{ id: player.id, door: 0, state: 'seated', progress: 1 }];

    const playerObject = game.gameObjects.findPlayer(player.id);
    expect(playerObject).toBeDefined();
    const playerVelocity = { vx: player.vx, vy: player.vy };
    playerObject?.applyMovementInput({ seq: 1, keys: 1 }, vehicle.z, 1 / 30);

    expect(vehicle.throttle).toBeGreaterThan(0);
    expect(player.vx).toBe(playerVelocity.vx);
    expect(player.vy).toBe(playerVelocity.vy);
  });

  it('clears traffic braking when a player takes the driver seat', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('player-driver');
    player.vehicleId = vehicle.id;
    player.animation = { kind: 'seated', progress: 1 };
    vehicle.passengers = [player.id];
    vehicle.occupants = [{ id: player.id, door: 0, state: 'seated', progress: 1 }];
    vehicle.aiState = 'brake';
    vehicle.signal = 'red';
    vehicle.serviceStop = 123;
    vehicle.pursuitTarget = 'npc:1';
    vehicle.brakePressure = 1;
    vehicle.handbrakeForce = 1;
    vehicle.brakeLights = true;

    game.step(new Map([['player-driver', { seq: 1, keys: 0 }]]));

    expect(vehicle.aiState).toBeUndefined();
    expect(vehicle.signal).toBe('none');
    expect(vehicle.serviceStop).toBeUndefined();
    expect(vehicle.pursuitTarget).toBeUndefined();
    expect(vehicle.brakePressure).toBe(0);
    expect(vehicle.handbrakeForce).toBe(0);
    expect(vehicle.brakeLights).toBe(false);
  });

  it('lets a passenger walk to the door before following a parked vehicle', () => {
    const { game, vehicle } = setup();
    const driver = game.addPlayer('seated-driver');
    const passenger = game.addPlayer('walking-passenger');
    driver.vehicleId = vehicle.id;
    driver.animation = { kind: 'seated', progress: 1 };
    vehicle.passengers = [driver.id];
    vehicle.occupants = [{ id: driver.id, door: 0, state: 'seated', progress: 1 }];
    game.vehicleMetadata(vehicle);
    game.restore({ ...passenger, x: vehicle.x + 100, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([
      ['seated-driver', { seq: 1, keys: 0 }],
      ['walking-passenger', { seq: 1, keys: 0, action: 'enter' as const }],
    ]));
    expect(vehicle.occupants.find(occupant => occupant.id === passenger.id)?.state).toBe('approaching');

    const before = { x: passenger.x, y: passenger.y };
    game.step(new Map([
      ['seated-driver', { seq: 2, keys: 0 }],
      ['walking-passenger', { seq: 2, keys: 0 }],
    ]));

    expect(Math.hypot(passenger.x - before.x, passenger.y - before.y)).toBeGreaterThan(0);
    expect(passenger.vx !== 0 || passenger.vy !== 0).toBe(true);
    expect(vehicle.occupants.find(occupant => occupant.id === passenger.id)?.state).toBe('approaching');
  });

  it('repairs a stale door owner before entering an otherwise parked car', () => {
    const { game, vehicle } = setup();
    vehicle.doorStates = [
      { phase: 'closed', frame: 0, timer: 0, occupant: 'npc:old-driver' },
      { phase: 'closed', frame: 0, timer: 0, occupant: 'npc:old-driver' },
    ];
    vehicle.occupants = [];
    vehicle.passengers = [];
    const player = game.addPlayer('parked-entry');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    expect(game.vehicleDoorPosition(vehicle, game.gameState.playerStates.get(player.id)!, true, 'driver')).not.toEqual([]);
    expect(vehicle.doorStates.every(door => door.occupant === undefined)).toBe(true);

    game.step(new Map([['parked-entry', { seq: 1, keys: 0, action: 'enter' as const }]]));
    for (let seq = 2; seq < 20; seq++) game.step(new Map([['parked-entry', { seq, keys: 0 }]]));

    expect(game.gameState.playerStates.get(player.id)?.vehicleId).toBe(vehicle.id);
    expect(vehicle.occupants[0]?.state).toBe('entering');
    expect(vehicle.doorStates[0]?.phase).toBe('open');
  });

  it('waits for the selected door to finish opening before entering', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('door-wait');
    game.restore({ ...player, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });

    game.step(new Map([['door-wait', { seq: 1, keys: 0, action: 'enter' as const }]]));
    expect(vehicle.occupants?.[0]?.state).toBe('approaching');
    expect(vehicle.doorStates?.[0]?.phase).toBe('closed');
    expect(game.gameState.playerStates.get('door-wait')?.animation).toBeUndefined();

    game.step(new Map([['door-wait', { seq: 2, keys: 0 }]]));
    expect(vehicle.occupants?.[0]?.state).toBe('approaching');
    expect(vehicle.doorStates?.[0]?.phase).toBe('opening');
    expect(game.gameState.playerStates.get('door-wait')?.animation).toBeUndefined();

    let sawOpenDoor = false;
    for (let seq = 3; seq < 20; seq++) {
      game.step(new Map([['door-wait', { seq, keys: 0 }]]));
      if (vehicle.doorStates?.[0]?.phase === 'open') {
        sawOpenDoor = true;
        expect(vehicle.occupants?.[0]?.state).toBe('entering');
        expect(game.gameState.playerStates.get('door-wait')?.animation?.kind).toBe('entering');
        break;
      }
    }
    expect(sawOpenDoor).toBe(true);
  });

  it('exits through the driver front-left door before trying another door', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('driver');
    player.vehicleId = vehicle.id;
    vehicle.passengers = [player.id];
    vehicle.occupants = [{ id: player.id, door: 0, state: 'seated', progress: 1 }];
    game.vehicleMetadata(vehicle);

    const exit = exitPosition(vehicleExitPosition(exitContext(game, [vehicle]), vehicle, player));

    expect(exit.door).toBe(1);
  });

  it('falls back to another clear door when the preferred exit is blocked', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('driver');
    player.vehicleId = vehicle.id;
    vehicle.passengers = [player.id];
    vehicle.occupants = [{ id: player.id, door: 0, state: 'seated', progress: 1 }];
    const metadata = game.vehicleCatalog.get(vehicle.model);
    game.vehicleMetadata(vehicle);
    const preferred = doorPoint(vehicleDoorPoint(vehicle, 1, metadata.info, metadata.bounds));
    const otherVehicle = blocker(2, { x: preferred.exitX, y: preferred.exitY }, vehicle.z);

    const exit = exitPosition(vehicleExitPosition(exitContext(game, [vehicle, otherVehicle]), vehicle, player));

    expect(exit.door).not.toBe(1);
  });

  it('refuses to exit when every door is blocked', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('driver');
    player.vehicleId = vehicle.id;
    vehicle.passengers = [player.id];
    vehicle.occupants = [{ id: player.id, door: 0, state: 'seated', progress: 1 }];
    const metadata = game.vehicleCatalog.get(vehicle.model);
    game.vehicleMetadata(vehicle);
    const blockers = vehicleDoorDefinitions(metadata.info, metadata.bounds).map((door, index) => {
      const point = doorPoint(vehicleDoorPoint(vehicle, door.index, metadata.info, metadata.bounds));
      return blocker(index + 2, { x: point.exitX, y: point.exitY }, vehicle.z);
    });

    const exit = vehicleExitPosition(exitContext(game, [vehicle, ...blockers]), vehicle, player);

    expect(exit).toEqual([]);
  });


  it('completes door transitions and exits through the assigned door', () => {
    const { game, vehicle } = setup();
    const driver = game.addPlayer('driver');
    game.restore({ ...driver, x: vehicle.x - 34, y: vehicle.y, z: vehicle.z + 1 });
    game.step(new Map([['driver', { seq: 1, keys: 0, action: 'enter' as const }]]));
    for (let seq = 2; seq < 30; seq++) game.step(new Map([['driver', { seq, keys: 0 }]]));
    expect(vehicle.occupants?.find(occupant => occupant.id === 'driver')?.state).toBe('seated');
    expect(vehicle.occupants?.[0]?.state).toBe('seated');
    for (let seq = 30; seq < 51; seq++) game.step(new Map([['driver', { seq, keys: 0 }]]));
    const seatedDoor = vehicle.doorStates?.[vehicle.occupants?.find(occupant => occupant.id === 'driver')?.door ?? 0];
    expect(seatedDoor?.phase).toBe('closed');
    expect(seatedDoor?.frame).toBe(0);

    game.step(new Map([['driver', { seq: 51, keys: 0, action: 'enter' as const }]]));
    let sawExit = false;
    for (let seq = 52; seq < 67; seq++) {
      game.step(new Map([['driver', { seq, keys: 0 }]]));
      sawExit ||= game.events.some(event => event.type === 'vehicle-exit');
    }
    expect(game.gameState.playerStates.get('driver')?.vehicleId).toBeUndefined();
    expect(vehicle.passengers).toEqual([]);
    expect(sawExit).toBe(true);
  });

  it('reserves a seat while a ped approaches its usable door', () => {
    const { game, vehicle } = setup();
    const player = game.addPlayer('approacher');
    game.restore({ ...player, x: vehicle.x, y: vehicle.y + 50, z: vehicle.z + 1 });
    game.step(new Map([['approacher', { seq: 1, keys: 0, action: 'enter' as const }]]));
    expect(vehicle.occupants?.find(occupant => occupant.id === 'approacher')?.state).toBe('approaching');
    expect(vehicle.occupants?.[0]?.state).toBe('approaching');
    for (let seq = 2; seq < 55; seq++) game.step(new Map([['approacher', { seq, keys: 0 }]]));
    expect(vehicle.occupants?.find(occupant => occupant.id === 'approacher')?.state).toBe('seated');
  });

  it('promotes the next passenger to index zero when the driver leaves', () => {
    const { game, vehicle } = setup();
    const driver = game.addPlayer('driver');
    const passenger = game.addPlayer('passenger');
    game.restore({ ...driver, x: vehicle.x - 34, y: vehicle.y, z: vehicle.z + 1 });
    game.restore({ ...passenger, x: vehicle.x + 34, y: vehicle.y, z: vehicle.z + 1 });
    game.step(new Map([['driver', { seq: 1, keys: 0, action: 'enter' as const }]]));
    game.step(new Map([['passenger', { seq: 1, keys: 0, action: 'enter' as const }]]));
    for (let seq = 2; seq < 40; seq++) game.step(new Map([['driver', { seq, keys: 0 }], ['passenger', { seq, keys: 0 }]]));
    expect(vehicle.passengers?.[0]).toBe('driver');
    expect(vehicle.passengers?.[1]).toBe('passenger');
    game.step(new Map([['driver', { seq: 40, keys: 0, action: 'enter' as const }], ['passenger', { seq: 40, keys: 0 }]]));
    for (let seq = 41; seq < 60; seq++) game.step(new Map([['driver', { seq, keys: 0 }], ['passenger', { seq, keys: 0 }]]));
    expect(vehicle.passengers?.[0]).toBe('passenger');
    expect(game.gameObjects.findVehicle(vehicle.id)?.driver).toBe('passenger');
    expect(game.gameState.playerStates.get('passenger')?.vehicleId).toBe(vehicle.id);
  });

});
