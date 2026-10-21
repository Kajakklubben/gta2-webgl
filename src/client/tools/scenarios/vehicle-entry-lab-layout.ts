import * as THREE from "three";
import type { Block, Face, GameMap, TrafficMapMetadata } from "../../../shared/loader/map-parser";
import { GTA2SlopeType } from "../../../shared/domain/world/gta2-enums";
import type { CarInfo } from "../../../shared/loader/style-parser";
import type { PlayerState, TrafficState, VehicleSeatRole } from "../../../shared/protocol/types";
import { vehicleDoorDefinitions, vehicleSeatDefinitions, type VehicleDoorPoint } from "../../../shared/domain/vehicles/vehicle-occupancy";
import { tileToWorld } from "../../../shared/domain/world/world";
import { newCombat } from "../../../shared/domain/combat/weapons";
import { scenarioWorldPlacement, type VehicleEntryApproach, type VehicleEntryScenarioId, type VehicleExitScenarioId } from "./vehicle-entry-scenarios";
import type { VehicleBounds } from "../../../shared/loader/vehicle-bounds";
import { SCENARIO_ROOM_RADIUS } from './scenario-view';

export type EntryScenarioId = VehicleEntryScenarioId;
export type ExitScenarioId = VehicleExitScenarioId;
export type ScenarioAction = 'enter' | 'exit';
export type EntryApproach = VehicleEntryApproach;
export type EntrySide = 'left' | 'right';
export type EntryPhase = 'approaching' | 'entering' | 'seated' | 'exiting' | 'exited' | 'blocked';

export interface EntryCandidate {
  door: number;
  seat: number;
  role: VehicleSeatRole;
  point: VehicleDoorPoint;
  distance: number;
  preferredDoor: number;
}

export interface EntryLayout {
  action: ScenarioAction;
  info: CarInfo | undefined;
  bounds: VehicleBounds;
  vehicle: TrafficState;
  blockades: TrafficState[];
  doors: ReturnType<typeof vehicleDoorDefinitions>;
  seats: ReturnType<typeof vehicleSeatDefinitions>;
  points: Map<number, VehicleDoorPoint>;
  blockedDoors: Set<number>;
  occupiedSeats: Set<number>;
  playerStart: { x: number; y: number };
  candidates: EntryCandidate[];
  selected?: EntryCandidate | undefined;
}

// CARI/Car_Door_10 stores the authored slots in right-front, left-front,
// right-rear, left-rear order. The sprite renderer mirrors the source texture,
// but the door geometry and metadata use these source slot meanings.
export const doorLabel = (door: number) => ['RF', 'LF', 'RR', 'LR'][door] ?? `D${door + 1}`;
export const doorSide = (door: number): EntrySide => {
  if (door % 2 === 0) return 'right';
  return 'left';
};

export function propertyTags(info: CarInfo, seats: number) {
  let doorTag = 'no doors';
  if (info.doors.length) doorTag = `${info.doors.length} doors`;
  const tags = [doorTag, `${seats} seats`];
  const straight = info.doors.filter(door => door.straightEntry).length;
  if (straight) tags.push(`${straight} straight`);
  if (info.infoFlags.emergencyLights) tags.push('emergency');
  if (info.infoFlags.rearEmergencyLights) tags.push('rear emergency');
  if (info.infoFlags.roofLights) tags.push('roof lights');
  if (info.infoFlags.forHireLights) tags.push('for-hire');
  if (info.infoFlags.pedJump) tags.push('ped jump');
  if (info.infoFlags.trailer) tags.push('trailer');
  if (info.infoFlags2.collideOver) tags.push('collide over');
  if (info.infoFlags2.popupHeadlights) tags.push('popup headlights');
  return tags.join(' · ');
}

export function makePreviewVehicle(model: number, x: number, y: number, id: number, doorLock?: TrafficState['doorLock']): TrafficState {
  const vehicle: TrafficState = { id, x, y, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0xffffff, health: 100, model, passengers: [], occupants: [], doorStates: [] };
  if (doorLock !== undefined) vehicle.doorLock = doorLock;
  return vehicle;
}

export function makePreviewPlayer(start: { x: number; y: number }): PlayerState {
  return {
    id: 'entry-scenario-player', x: start.x, y: start.y, z: 0, rotation: 0, vx: 0, vy: 0,
    name: 'Scenario player', color: 0xf6ca66, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0, combat: { ...newCombat(), ammo: [60] },
  };
}

export function makePreviewBlockade(model: number, vehicle: TrafficState, placement: { x: number; y: number; rotation?: number }, id: number): TrafficState {
  const worldPlacement = scenarioWorldPlacement({ x: vehicle.x, y: vehicle.y }, placement, vehicle.rotation);
  const blockade = makePreviewVehicle(model, worldPlacement.x, worldPlacement.y, id, 'locked');
  blockade.rotation = worldPlacement.rotation;
  return blockade;
}

/** Place a blockade beside the target vehicle without overlapping either chassis. */
export function vehicleBlockadePlacement(
  placement: { x: number; y: number; rotation?: number },
  targetBounds: VehicleBounds,
  blockadeBounds: VehicleBounds,
  clearance = 8,
) {
  const horizontal = Math.abs(placement.x) >= Math.abs(placement.y);
  if (horizontal) {
    const direction = Math.sign(placement.x) || 1;
    return { ...placement, x: direction * (targetBounds.width + blockadeBounds.width) * .5 + direction * clearance };
  }
  const direction = Math.sign(placement.y) || 1;
  return { ...placement, y: direction * (targetBounds.height + blockadeBounds.height) * .5 + direction * clearance };
}

export function emptyTrafficMetadata(): TrafficMapMetadata {
  return { roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [] };
}

/**
 * Build the deterministic room used by every entry replay. It deliberately
 * contains one flat floor and four authored wall faces. The scenario vehicle
 * is always at the room centre; blocked approaches use locked vehicle objects
 * rather than turning map geometry into an artificial obstacle.
 */
export function createScenarioLevel(source: GameMap) {
  const targetX = 128, targetY = 128, wallRadius = SCENARIO_ROOM_RADIUS, roomRadius = SCENARIO_ROOM_RADIUS;
  const emptyFace = (): Face => ({ tileNumber: 0, flat: false, flip: false, rotation: 0, wall: false, bulletWall: false });
  const floorFace = (): Face => ({ tileNumber: 1, flat: false, flip: false, rotation: 0, wall: false, bulletWall: false });
  const wallFace = (): Face => ({ tileNumber: 1, flat: false, flip: false, rotation: 0, wall: true, bulletWall: true });
  const map = Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => [] as (Block | undefined)[]));
  for (let x = targetX - roomRadius; x <= targetX + roomRadius; x++) for (let y = targetY - roomRadius; y <= targetY + roomRadius; y++) {
    const boundary = Math.abs(x - targetX) === wallRadius || Math.abs(y - targetY) === wallRadius;
    // Every position has a solid layer-0 support surface. Air-backed columns
    // are reserved for actual water/open-space cells by gameplay probes.
    const groundType = 2;
    map[x]![y]![0] = {
      Left: emptyFace(), Right: emptyFace(), Top: emptyFace(), Bottom: emptyFace(),
      Lid: floorFace(),
      slopeType: GTA2SlopeType.Flat,
      groundType,
      arrows: 0,
    };
    if (boundary) {
      // GTA2 walls are blocks above the floor, not coloured strips on the
      // floor. A layer-1 block rises from the layer-0 lid; its side faces are
      // the red wall surfaces and its lid is the roof on the far side.
      const sideX = x === targetX - wallRadius || x === targetX + wallRadius;
      const sideY = y === targetY - wallRadius || y === targetY + wallRadius;
      let leftFace = emptyFace();
      let rightFace = emptyFace();
      let topFace = emptyFace();
      let bottomFace = emptyFace();
      if (sideX) {
        leftFace = wallFace();
        rightFace = wallFace();
      }
      if (sideY) {
        topFace = wallFace();
        bottomFace = wallFace();
      }
      map[x]![y]![1] = {
        Left: leftFace,
        Right: rightFace,
        Top: topFace,
        Bottom: bottomFace,
        Lid: floorFace(),
        slopeType: GTA2SlopeType.Flat,
        groundType: 2,
        arrows: 0,
      };
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
  return { level, origin: { x: tileToWorld(targetX), y: -tileToWorld(targetY) } };
}

/** Keep the diagnostic map synthetic while making wall faces read as a
 * surface. Nearest filtering and repeat wrapping preserve a crisp pixel-style
 * checker pattern at every viewport size. */
export function createCheckerTexture(lightColor: string, darkColor: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create checker pattern canvas');
  context.fillStyle = lightColor;
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = darkColor;
  context.fillRect(0, 0, 8, 8);
  context.fillRect(8, 8, 8, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function cross(ax: number, ay: number, bx: number, by: number) { return ax * by - ay * bx; }
export function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return px >= Math.min(ax, bx) - 1e-6 && px <= Math.max(ax, bx) + 1e-6 && py >= Math.min(ay, by) - 1e-6 && py <= Math.max(ay, by) + 1e-6;
}
export function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const abx = b.x - a.x, aby = b.y - a.y, cdx = d.x - c.x, cdy = d.y - c.y;
  const first = cross(abx, aby, c.x - a.x, c.y - a.y), second = cross(abx, aby, d.x - a.x, d.y - a.y);
  const third = cross(cdx, cdy, a.x - c.x, a.y - c.y), fourth = cross(cdx, cdy, b.x - c.x, b.y - c.y);
  if (((first > 1e-6 && second < -1e-6) || (first < -1e-6 && second > 1e-6)) && ((third > 1e-6 && fourth < -1e-6) || (third < -1e-6 && fourth > 1e-6))) return true;
  return (Math.abs(first) <= 1e-6 && onSegment(a.x, a.y, b.x, b.y, c.x, c.y)) || (Math.abs(second) <= 1e-6 && onSegment(a.x, a.y, b.x, b.y, d.x, d.y)) || (Math.abs(third) <= 1e-6 && onSegment(c.x, c.y, d.x, d.y, a.x, a.y)) || (Math.abs(fourth) <= 1e-6 && onSegment(c.x, c.y, d.x, d.y, b.x, b.y));
}

export function segmentHitsVehicle(start: { x: number; y: number }, end: { x: number; y: number }, vehicle: TrafficState, bounds: VehicleBounds) {
  // Blockades are intentionally the same authored vehicle shape as the test
  // car. A conservative circular footprint makes the route diagnostic stable
  // for every CARI width/height while the actual collision remains the
  // vehicle's Planck rectangle.
  const radius = Math.hypot(bounds.width, bounds.height) * .5;
  const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) t = Math.max(0, Math.min(1, ((vehicle.x - start.x) * dx + (vehicle.y - start.y) * dy) / lengthSquared));
  const nearestX = start.x + dx * t, nearestY = start.y + dy * t;
  return Math.hypot(vehicle.x - nearestX, vehicle.y - nearestY) <= radius;
}

/**
 * A source-data vehicle entry scenario. The map, game objects, game
 * tick, occupancy state machine, Planck collision, and SpriteEngine commands
 * are the same path used by the playable game. The 2D overlay is diagnostic
 * only: it marks authored doors and the selected route without drawing a
 * substitute vehicle or player.
 */

