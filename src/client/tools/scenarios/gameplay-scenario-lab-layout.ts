import type { Block, Face, GameMap, TrafficMapMetadata } from '../../../shared/loader/map-parser';
import { GTA2GroundType, GTA2SlopeType } from '../../../shared/domain/world/gta2-enums';
import { tileToWorld } from '../../../shared/domain/world/world';
import { GAMEPLAY_SCENARIO_DEFINITIONS, type GameplayScenarioDefinition, type GameplayScenarioId } from '../../../shared/domain/scenario-definitions';
import { SCENARIO_ROOM_RADIUS } from './scenario-view';

export type { GameplayScenarioDefinition, GameplayScenarioId } from '../../../shared/domain/scenario-definitions';
export type GameplayLevelId = 'road' | 'water';

export interface GameplayWaterArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface GameplayScenarioLevel {
  readonly level: GameMap;
  readonly origin: { readonly x: number; readonly y: number };
  readonly room: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
  readonly water?: GameplayWaterArea | undefined;
}

export const GAMEPLAY_SCENARIOS: readonly GameplayScenarioDefinition[] = GAMEPLAY_SCENARIO_DEFINITIONS;

export function gameplayScenario(id: GameplayScenarioId) {
  return GAMEPLAY_SCENARIOS.find(scenario => scenario.id === id) ?? GAMEPLAY_SCENARIOS[0]!;
}

function emptyFace(): Face {
  return { tileNumber: 0, flat: false, flip: false, rotation: 0, wall: false, bulletWall: false };
}

function floorFace(): Face {
  return { tileNumber: 1, flat: true, flip: false, rotation: 0, wall: false, bulletWall: false };
}

function wallFace(): Face {
  return { tileNumber: 1, flat: true, flip: false, rotation: 0, wall: true, bulletWall: true };
}

function block(groundType: number, boundary: 'x' | 'y' | undefined): Block {
  const side = emptyFace();
  const left = boundary === 'x' ? wallFace() : side;
  const right = boundary === 'x' ? wallFace() : side;
  const top = boundary === 'y' ? wallFace() : side;
  const bottom = boundary === 'y' ? wallFace() : side;
  return {
    Left: left,
    Right: right,
    Top: top,
    Bottom: bottom,
    Lid: floorFace(),
    slopeType: GTA2SlopeType.Flat,
    groundType,
    arrows: 0,
  };
}

function emptyTrafficMetadata(): TrafficMapMetadata {
  return {
    roadNodes: [],
    junctions: [],
    horizontalSegments: [],
    verticalSegments: [],
    trafficLightZones: [],
    arrowBlockerZones: [],
    busStopZones: [],
  };
}

/**
 * Build the small authored rooms used by the gameplay replay lab. The floor
 * and dock are real GameMap blocks, so water detection, surface placement,
 * Planck map walls, and the vehicle/pedestrian collision paths stay shared
 * with the playable game.
 */
export function createGameplayScenarioLevel(source: GameMap, kind: GameplayLevelId): GameplayScenarioLevel {
  const room = {
    minX: 128 - SCENARIO_ROOM_RADIUS,
    maxX: 128 + SCENARIO_ROOM_RADIUS,
    minY: 128 - SCENARIO_ROOM_RADIUS,
    maxY: 128 + SCENARIO_ROOM_RADIUS,
  } as const;
  const water = kind === 'water' ? { minX: 128, maxX: 130, minY: 122, maxY: 134 } as const : undefined;
  const map = Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => [] as (Block | undefined)[]));
  for (let x = room.minX; x <= room.maxX; x++) {
    for (let y = room.minY; y <= room.maxY; y++) {
      const boundaryX = x === room.minX || x === room.maxX;
      const boundaryY = y === room.minY || y === room.maxY;
      const boundary = boundaryX ? 'x' : boundaryY ? 'y' : undefined;
      const isWater = Boolean(water && x >= water.minX && x <= water.maxX && y >= water.minY && y <= water.maxY);
      const floor = block(isWater ? GTA2GroundType.Air : GTA2GroundType.Pavement, boundary);
      if (isWater) floor.Lid.tileNumber = 608;
      map[x]![y]![0] = floor;
      if (boundary) {
        map[x]![y]![1] = {
          ...block(GTA2GroundType.Pavement, boundary),
          Lid: floorFace(),
        };
      }
    }
  }
  const level: GameMap = {
    map,
    objects: [],
    zones: [],
    animations: source.animations,
    lights: [],
    roads: [],
    traffic: emptyTrafficMetadata(),
    format: source.format,
  };
  return {
    level,
    origin: { x: tileToWorld(128), y: -tileToWorld(128) },
    room,
    ...(water ? { water } : {}),
  };
}

export function gameplayTile(x: number, y: number, z = 1) {
  return { x: tileToWorld(x), y: -tileToWorld(y), z };
}
