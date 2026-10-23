import type { CarInfo } from '../../../shared/engine/loader/style-parser';
import type { CarPhysics } from '../../../shared/engine/loader/gci';
import { vehicleBounds, type VehicleBounds } from '../../../shared/engine/loader/vehicle-bounds';
import { vehicleDoorPoint, vehicleSeatDefinitions, ensureVehicleOccupancy } from '../../../shared/domain/vehicles/vehicle-occupancy';
import { newCombat } from '../../../shared/domain/combat/weapons';
import { Gta2Game } from '../../../shared/game/gta2-game';
import type { NpcState, PlayerState, TrafficState } from '../../../shared/protocol/types';
import type { ScenarioDefinition, ScenarioActorDefinition } from './scenario-definitions';
import type { ScenarioLevel } from './scenario-view';

export interface ScenarioReplayGameOptions {
  readonly level: ScenarioLevel;
  readonly scenario: ScenarioDefinition;
  readonly variantId?: string;
  readonly selectedModel: number;
  readonly carPhysics: ReadonlyMap<number, CarPhysics>;
  readonly carBounds: ReadonlyMap<number, VehicleBounds>;
  readonly carInfo: ReadonlyMap<number, CarInfo>;
}

export interface ScenarioReplayGame {
  readonly game: Gta2Game;
  readonly actors: readonly ScenarioActorDefinition[];
  readonly playerIds: readonly string[];
  readonly vehicleIds: readonly number[];
}

function playerState(actor: ScenarioActorDefinition, x: number, y: number, z: number): PlayerState {
  const state: PlayerState = {
    id: actor.id,
    x,
    y,
    z,
    rotation: actor.placement.rotation ?? Math.PI * 1.5,
    vx: 0,
    vy: 0,
    name: actor.id,
    color: 0xf6ca66,
    score: 0,
    kills: 0,
    deaths: 0,
    ready: true,
    armor: 0,
    money: 0,
    wanted: 0,
    team: 0,
    combat: newCombat(),
  };
  if (actor.vehicleId !== undefined) {
    state.vehicleId = actor.vehicleId;
    state.animation = { kind: 'seated', progress: 1 };
  }
  return state;
}

function npcState(actor: ScenarioActorDefinition, x: number, y: number, z: number): NpcState {
  return {
    id: actor.runtimeId ?? 1,
    x,
    y,
    z,
    rotation: actor.placement.rotation ?? Math.PI * 1.5,
    vx: 0,
    vy: 0,
    health: 100,
    kind: 'civilian',
    state: 'idle',
    animation: 'idle',
    shockCounter: 0,
    electrocuted: false,
    shots: [],
    onFire: false,
    fireTimer: 0,
    waitTimer: 9_999,
  };
}

function vehicleState(actor: ScenarioActorDefinition, id: number, x: number, y: number, z: number): TrafficState {
  const vx = actor.velocity?.x ?? 0;
  const vy = actor.velocity?.y ?? 0;
  const vehicle: TrafficState = {
    id,
    model: actor.model === 'selected' || actor.model === undefined ? 0 : actor.model,
    x,
    y,
    z,
    rotation: actor.placement.rotation ?? Math.PI * 1.5,
    speed: Math.hypot(vx, vy),
    color: 0xd04b4b,
    health: 100,
    vx,
    vy,
    angularVelocity: 0,
    throttle: 0,
    brakePressure: actor.brakePressure ?? (actor.velocity ? 0 : 1),
    handbrakeForce: actor.handbrakeForce ?? 0,
    passengers: [],
    occupants: [],
    doorStates: [],
    aiActive: false,
  };
  vehicle.throttle = actor.throttle ?? 0;
  if (actor.driver !== undefined) vehicle.passengers = [actor.driver];
  if (actor.kind === 'blockade') vehicle.doorLock = 'locked';
  return vehicle;
}

function actorPlacement(level: ScenarioLevel, actor: ScenarioActorDefinition) {
  return {
    x: level.origin.x + actor.placement.x,
    y: level.origin.y + actor.placement.y,
    z: actor.placement.z ?? level.surfaceZ,
  };
}

function scenarioActors(scenario: ScenarioDefinition, variantId: string | undefined) {
  return scenario.arrange.variants?.find(variant => variant.id === variantId)?.actors ?? scenario.arrange.actors;
}

/**
 * The single world-construction path for every scenario replay. The scenario
 * registry supplies only actor data; this function always loads the selected
 * Tiny Town map and the authored car metadata, disables ambient actors, and
 * restores the explicit actors into the normal GTA2 game.
 */
export function createScenarioReplayGame(options: ScenarioReplayGameOptions): ScenarioReplayGame {
  const actors = scenarioActors(options.scenario, options.variantId);
  const game = new Gta2Game(
    options.level.level,
    undefined,
    [],
    options.carPhysics,
    [],
    options.carBounds,
    options.carInfo,
    undefined,
    { ambientTraffic: false, ambientPedestrians: false, vehicleAi: false },
  );
  const vehicles: TrafficState[] = [];
  const npcs: NpcState[] = [];
  const players: PlayerState[] = [];
  const vehicleActors = new Map<number, ScenarioActorDefinition>();
  for (const actor of actors) {
    const placement = actorPlacement(options.level, actor);
    if (actor.kind === 'vehicle' || actor.kind === 'blockade') {
      const id = actor.runtimeId ?? vehicles.length + 1;
      const vehicle = vehicleState({ ...actor, model: actor.model === 'selected' || actor.model === undefined ? options.selectedModel : actor.model }, id, placement.x, placement.y, placement.z);
      vehicles.push(vehicle);
      vehicleActors.set(id, actor);
    } else if (actor.kind === 'player') {
      players.push(playerState(actor, placement.x, placement.y, placement.z));
    } else if (actor.kind === 'npc') {
      npcs.push(npcState(actor, placement.x, placement.y, placement.z));
    }
  }

  for (const vehicle of vehicles) {
    const actor = vehicleActors.get(vehicle.id);
    const model = vehicle.model ?? options.selectedModel;
    vehicle.model = model;
    const info = options.carInfo.get(model);
    const bounds = vehicleBounds(model, options.carBounds);
    if (vehicle.id === 1 && options.scenario.arrange.locked) vehicle.doorLock = 'locked';
    ensureVehicleOccupancy(vehicle, info, bounds);
    if (actor?.driver !== undefined) vehicle.occupants.push({ id: actor.driver, door: 0, state: 'seated', progress: 1 });
  }

  const primaryVehicle = vehicles.find(vehicle => vehicle.id === 1);
  const primaryVehicleInfo = primaryVehicle ? options.carInfo.get(primaryVehicle.model ?? options.selectedModel) : undefined;
  const primaryVehicleBounds = primaryVehicle ? vehicleBounds(primaryVehicle.model ?? options.selectedModel, options.carBounds) : undefined;
  if (primaryVehicle && primaryVehicleInfo && primaryVehicleBounds) {
    const seats = vehicleSeatDefinitions(primaryVehicleInfo, primaryVehicleBounds);
    const occupiedSeats = options.scenario.arrange.occupiedSeats === 'all'
      ? new Set(seats.map(seat => seat.index))
      : new Set(options.scenario.arrange.occupiedSeats ?? []);
    for (const seat of seats) {
      if (!occupiedSeats.has(seat.index) || primaryVehicle.occupants.some(occupant => occupant.door === seat.door)) continue;
      primaryVehicle.occupants.push({ id: seat.index === 0 ? 'npc:1' : `scenario-passenger:${seat.index}`, door: seat.door, state: 'seated', progress: 1 });
    }
    ensureVehicleOccupancy(primaryVehicle, primaryVehicleInfo, primaryVehicleBounds);

    for (const player of players) {
      if (player.vehicleId !== primaryVehicle.id) continue;
      const exitSeat = options.scenario.kind === 'vehicle-exit' ? options.scenario.act.exitSeat : 0;
      const seat = seats.find(candidate => candidate.index === exitSeat);
      const door = seat ? vehicleDoorPoint(primaryVehicle, seat.door, primaryVehicleInfo, primaryVehicleBounds) : undefined;
      if (seat && door) {
        player.x = door.seatX;
        player.y = door.seatY;
        primaryVehicle.occupants = primaryVehicle.occupants.filter(occupant => occupant.id !== player.id);
        primaryVehicle.occupants.push({ id: player.id, door: seat.door, state: 'seated', progress: 1 });
      }
    }
    ensureVehicleOccupancy(primaryVehicle, primaryVehicleInfo, primaryVehicleBounds);
  }

  for (const player of players) game.addPlayer(player.id, player);
  game.restoreWorld([], vehicles, [], npcs);
  return {
    game,
    actors,
    playerIds: players.map(player => player.id),
    vehicleIds: vehicles.map(vehicle => vehicle.id),
  };
}
