import { describe, expect, it, vi } from 'vitest';
import { toClientTraffic } from '../../shared/protocol/client-dto';
import { parseServerMessage, ProtocolValidationError } from '../../shared/protocol/validation';
import { VehicleObject } from '../../shared/game/gameobjects/vehicle';
import { maintainTraffic } from '../../shared/game/runtime/vehicle-runtime';
import type { PlayerState, TrafficState } from '../../shared/protocol/types';

function traffic(overrides: Partial<TrafficState> = {}): TrafficState {
  return {
    id: 1, x: 10000, y: 10000, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0,
    throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, health: 100, passengers: [], occupants: [], doorStates: [],
    ...overrides,
  };
}

function snapshotTraffic(overrides: Partial<TrafficState> = {}) {
  return {
    ...traffic(overrides),
    passengers: [...(overrides.passengers ?? [])],
    occupants: [...(overrides.occupants ?? [])],
    doorStates: [...(overrides.doorStates ?? [])],
  };
}

function snapshot(overrides: Partial<TrafficState> = {}) {
  return {
    type: 'snapshot' as const,
    tick: 1,
    players: [],
    traffic: [snapshotTraffic(overrides)],
  };
}

describe('authoritative traffic state', () => {
  it('projects and validates source-style controller state', () => {
    const state = traffic({
      aiActive: true, aiMode: 'scripted', aiTask: 'route', routeId: 4, routeCursor: 2,
      arrowCursor: 3, arrowRun: 5, currentDirection: 'east', targetDirection: 'south', plannedTurn: 'right',
      laneTarget: -1, laneAlignment: 'left', targetSpeed: 120, speedClass: 'fast',
      yieldTimer: 5, obstacleTimer: 2, offRoadTimer: 0, allowSpecialRoute: true,
    });
    const dto = toClientTraffic(state);
    expect(dto).toMatchObject({ aiActive: true, aiMode: 'scripted', aiTask: 'route', routeId: 4, routeCursor: 2, arrowCursor: 3, arrowRun: 5, targetDirection: 'south', plannedTurn: 'right', laneTarget: -1, targetSpeed: 120, speedClass: 'fast', allowSpecialRoute: true });
    expect(parseServerMessage(snapshot(state))).toMatchObject({ traffic: [expect.objectContaining({ aiMode: 'scripted', routeCursor: 2, laneAlignment: 'left' })] });
  });

  it('rejects malformed controller state instead of accepting client-shaped traffic', () => {
    expect(() => parseServerMessage(snapshot({ aiMode: 'scripted', aiActive: false }))).toThrow(ProtocolValidationError);
    expect(() => parseServerMessage(snapshot({ laneTarget: 3 } as unknown as Partial<TrafficState>))).toThrow(ProtocolValidationError);
    expect(() => parseServerMessage(snapshot({ targetSpeed: -1 }))).toThrow(ProtocolValidationError);
  });

  it('marks player takeover inactive and clears active AI decisions', () => {
    const state = traffic({
      routeNode: 10, targetNode: 11, junction: 12, currentDirection: 'east',
      aiActive: true, aiMode: 'chase', aiTask: 'chase', routeId: 7, routeCursor: 3, arrowCursor: 2, arrowRun: 4,
      targetDirection: 'south', plannedTurn: 'right', laneTarget: 1, laneAlignment: 'right', targetSpeed: 100,
      speedClass: 'medium', yieldTimer: 5, obstacleTimer: 3, offRoadTimer: 8, allowSpecialRoute: true,
      pursuitTarget: 'player', serviceStop: 99, signal: 'red', aiState: 'brake',
    });
    const object = new VehicleObject(state);
    object.setPlayerControlMode();
    expect(state).toMatchObject({ aiActive: false, aiMode: 'inactive', aiTask: 'none', routeNode: 10, targetNode: 11, junction: 12, currentDirection: 'east', signal: 'none' });
    expect(state).not.toHaveProperty('pursuitTarget');
    expect(state).not.toHaveProperty('serviceStop');
    expect(state).not.toHaveProperty('routeId');
    expect(state).not.toHaveProperty('targetDirection');
    expect(state).not.toHaveProperty('plannedTurn');
    expect(state).not.toHaveProperty('yieldTimer');
    expect(state).not.toHaveProperty('obstacleTimer');
    object.setAutonomousControlMode();
    expect(state).toMatchObject({ aiActive: true, aiMode: 'ordinary', aiTask: 'follow-road', aiState: 'cruise', allowSpecialRoute: false });
  });

  it('does not recycle occupied or task-bearing cars outside ordinary interest', () => {
    const player: PlayerState = {
      id: 'player', x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, name: 'Player', color: 0,
      score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0,
      combat: { weapon: -1, ammo: [], health: 100, cooldown: 0, previousKeys: 0, respawn: 0, shockCounter: 0, electrocuted: false, onFire: false, fireTimer: 0, throwCharge: 0, throwing: false, throwAnimation: 0, attacking: false, fireAnimation: 0, shots: [] },
    };
    const occupied = traffic({ id: 1, passengers: ['npc:10'] });
    const playerControlled = traffic({ id: 2, passengers: ['player'] });
    const scripted = traffic({ id: 3, aiActive: true, aiMode: 'scripted', aiTask: 'route', routeId: 8 });
    const ordinary = traffic({ id: 4, aiActive: true, aiMode: 'ordinary', aiTask: 'follow-road' });
    const transitioningPlayerVehicle = traffic({ id: 5 });
    player.vehicleId = transitioningPlayerVehicle.id;
    const vehicles = [occupied, playerControlled, scripted, ordinary, transitioningPlayerVehicle];
    const remove = vi.fn((id: number) => {
      const index = vehicles.findIndex(vehicle => vehicle.id === id);
      if (index >= 0) vehicles.splice(index, 1);
    });
    const host = {
      localId: undefined,
      gameState: { playerStates: new Map([[player.id, player]]), vehicleStates: vehicles },
      trafficSpawner: { remove, spawnAround: vi.fn(() => []) },
      destroyVehicleBody: vi.fn(), unregisterObject: vi.fn(), gameObjects: { findVehicle: vi.fn(vehicle => vehicle) },
      vehicleHistory: new Map(), nextTrafficId: 20,
      level: { traffic: { busStopZones: [] }, zones: [] }, carInfo: new Map(), carPhysics: new Map(),
    };
    maintainTraffic(host);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(4);
    expect(vehicles.map(vehicle => vehicle.id)).toEqual([1, 2, 3, 5]);
  });
});
