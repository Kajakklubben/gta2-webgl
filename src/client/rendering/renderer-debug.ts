import * as THREE from 'three';
import { vehicleBounds } from '../../shared/engine/loader/vehicle-bounds';
import type { GameMap } from '../../shared/engine/loader/map-parser';
import type { NpcState, PlayerState, TrafficState } from '../../shared/protocol/types';
import { rotateVehicleLocal, vehicleDoorDefinitions, vehicleDoorPoint } from '../../shared/domain/vehicles/vehicle-occupancy';
import { WORLD, tileToWorld, worldZ } from '../../shared/domain/world/world';
import { GTA2MapZoneType } from '../../shared/domain/world/gta2-enums';
import { PedestrianNavigation } from '../../shared/domain/pedestrians/pedestrian-navigation';
import { renderWorldZ as worldEntityZ } from './spatial-depth';

// Debug stroke widths are screen pixels, not world units. This keeps the
// overlays readable and makes changing this value produce an actual visual
// change at every camera zoom level.
const DEBUG_LINE_WIDTH = 2;
const PEDESTRIAN_NODE_COLOR = 0xffd166;
const PEDESTRIAN_ROAD_NODE_COLOR = 0xff5964;
const PEDESTRIAN_PATH_COLOR = 0xffb84d;
const TRAFFIC_ARROW_SIZE = 12;
const TRAFFIC_ARROW_SPREAD = 6;

function drawArrow(target: number[], x1: number, y1: number, x2: number, y2: number, z: number, size: number, spread: number) {
  const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const ux = dx / length, uy = dy / length, px = -uy, py = ux;
  const leftX = x2 - ux * size + px * spread, leftY = y2 - uy * size + py * spread;
  const rightX = x2 - ux * size - px * spread, rightY = y2 - uy * size - py * spread;
  target.push(x2, y2, z, leftX, leftY, z, x2, y2, z, rightX, rightY, z);
}

function worldUnitsForScreenPixels(renderer: any, x: number, y: number, z: number, pixels: number) {
  const camera = renderer.camera as THREE.Camera | undefined;
  if (!camera) return pixels;
  const viewport = renderer.renderer?.domElement;
  const viewportWidth = Math.max(1, viewport?.clientWidth ?? innerWidth);
  const viewportHeight = Math.max(1, viewport?.clientHeight ?? innerHeight);
  const point = new THREE.Vector3(x, y, z);
  const projected = point.clone().project(camera);
  const xStep = point.clone().add(new THREE.Vector3(1, 0, 0)).project(camera);
  const yStep = point.clone().add(new THREE.Vector3(0, 1, 0)).project(camera);
  const xPixels = Math.hypot(
    (xStep.x - projected.x) * viewportWidth / 2,
    (xStep.y - projected.y) * viewportHeight / 2,
  );
  const yPixels = Math.hypot(
    (yStep.x - projected.x) * viewportWidth / 2,
    (yStep.y - projected.y) * viewportHeight / 2,
  );
  const pixelsPerWorldUnit = Math.max(xPixels, yPixels);
  if (pixelsPerWorldUnit > 1e-6) return pixels / pixelsPerWorldUnit;
  return pixels;
}

function thickSegments(renderer: any, points: readonly number[], color: number, width = DEBUG_LINE_WIDTH, opacity = 1) {
  const vertices: number[] = [];
  for (let index = 0; index + 5 < points.length; index += 6) {
    const x1 = points[index]!, y1 = points[index + 1]!, z1 = points[index + 2]!;
    const x2 = points[index + 3]!, y2 = points[index + 4]!, z2 = points[index + 5]!;
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const worldWidth = worldUnitsForScreenPixels(renderer, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, width);
    const halfWidth = worldWidth / 2;
    const nx = -dy / length * halfWidth, ny = dx / length * halfWidth;
    vertices.push(
      x1 + nx, y1 + ny, z1, x1 - nx, y1 - ny, z1, x2 + nx, y2 + ny, z2,
      x2 + nx, y2 + ny, z2, x1 - nx, y1 - ny, z1, x2 - nx, y2 - ny, z2,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

export function buildPedestrianDebug(renderer: any, level: GameMap) {
  const navigation = new PedestrianNavigation(level);
  renderer.pedestrianDebugNavigation = navigation;
  const links: number[] = [], nodes: number[] = [], roadNodes: number[] = [];
  const addCircle = (target: number[], x: number, y: number, z: number, radius: number) => {
    for (let index = 0; index < 12; index++) {
      const start = index * Math.PI * 2 / 12, end = (index + 1) * Math.PI * 2 / 12;
      target.push(x, y, z, x + Math.cos(start) * radius, y + Math.sin(start) * radius, z, x + Math.cos(end) * radius, y + Math.sin(end) * radius, z);
    }
  };
  for (const node of navigation.nodes) {
    const z = worldEntityZ(node.height) + 22;
    let target = nodes;
    if (node.isRoad) target = roadNodes;
    addCircle(target, node.worldX, node.worldY, z, 3);
    for (const neighborId of node.neighbors) {
      const neighbor = navigation.node(neighborId);
      if (!neighbor || neighbor.id < node.id) continue;
      const nextZ = worldEntityZ(neighbor.height) + 22;
      links.push(node.worldX, node.worldY, z, neighbor.worldX, neighbor.worldY, nextZ);
    }
  }
  const linkLines = thickSegments(renderer, links, 0x5ce1e6);
  linkLines.renderOrder = 80; renderer.debugPedestrianGraph.add(linkLines);
  const addNodeMesh = (points: readonly number[], color: number) => {
    const nodeGeometry = new THREE.BufferGeometry(); nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const nodeMeshes = new THREE.Mesh(nodeGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    nodeMeshes.renderOrder = 81; renderer.debugPedestrianGraph.add(nodeMeshes);
  };
  addNodeMesh(nodes, PEDESTRIAN_NODE_COLOR);
  addNodeMesh(roadNodes, PEDESTRIAN_ROAD_NODE_COLOR);
}

export function buildRoadDebug(renderer: any, level: GameMap) {
    const segments: number[] = [], specialSegments: number[] = [], arrowSegments: number[] = [], specialArrowSegments: number[] = [], waypointTriangles: number[] = [], junctionLines: number[] = [];
    const addFilledCircle = (target: number[], x: number, y: number, z: number, radius: number) => {
      const sides = 16;
      for (let index = 0; index < sides; index++) {
        const start = index * Math.PI * 2 / sides, end = (index + 1) * Math.PI * 2 / sides;
        target.push(x, y, z, x + Math.cos(start) * radius, y + Math.sin(start) * radius, z, x + Math.cos(end) * radius, y + Math.sin(end) * radius, z);
      }
    };
    for (const road of level.roads) {
      // Keep the overlay above map faces and vehicle sprites so the graph is
      // readable even where several road levels overlap.
      const x = tileToWorld(road.x), y = -tileToWorld(road.y), z = worldZ(road.z + 1) + WORLD.render.entityZOffset + 16;
      addFilledCircle(waypointTriangles, x, y, z, 3.5);
      for (const nextId of road.next) {
        const next = level.roads[nextId]; if (!next) continue;
        const nextX = tileToWorld(next.x), nextY = -tileToWorld(next.y), nextZ = worldZ(next.z + 1) + WORLD.render.entityZOffset + 16;
        segments.push(x, y, z, nextX, nextY, nextZ);
        drawArrow(arrowSegments, x, y, nextX, nextY, nextZ, TRAFFIC_ARROW_SIZE, TRAFFIC_ARROW_SPREAD);
      }
      for (const nextId of road.specialNext) {
        const next = level.roads[nextId]; if (!next) continue;
        const nextX = tileToWorld(next.x), nextY = -tileToWorld(next.y), nextZ = worldZ(next.z + 1) + WORLD.render.entityZOffset + 18;
        specialSegments.push(x, y, z + 2, nextX, nextY, nextZ);
        drawArrow(specialArrowSegments, x, y, nextX, nextY, nextZ, TRAFFIC_ARROW_SIZE, TRAFFIC_ARROW_SPREAD);
      }
    }
    const lines = thickSegments(renderer, segments, 0x62e6a6);
    lines.renderOrder = 80; renderer.debugGraph.add(lines);
    const roadArrows = thickSegments(renderer, arrowSegments, 0x62e6a6);
    roadArrows.renderOrder = 81; renderer.debugGraph.add(roadArrows);
    const specialLines = thickSegments(renderer, specialSegments, 0xff5c7a);
    specialLines.renderOrder = 80; renderer.debugSpecialRoutes.add(specialLines);
    const specialArrows = thickSegments(renderer, specialArrowSegments, 0xff5c7a);
    specialArrows.renderOrder = 81; renderer.debugSpecialRoutes.add(specialArrows);
    const waypointGeometry = new THREE.BufferGeometry(); waypointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waypointTriangles, 3));
    const waypointCircles = new THREE.Mesh(waypointGeometry, new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: false, opacity: 1, blending: THREE.NoBlending }));
    waypointCircles.renderOrder = 81; renderer.debugWaypoints.add(waypointCircles);
    // Keep the overlay below the camera's source-facing plane so diagnostics
    // stay in front of the map without changing the authored wall depth.
    const highZ = worldZ(1) + WORLD.render.entityZOffset + 24;
    const addRect = (target: number[], minX: number, minY: number, maxX: number, maxY: number, z: number) => {
      const x1 = tileToWorld(minX), x2 = tileToWorld(maxX + 1), y1 = -tileToWorld(minY), y2 = -tileToWorld(maxY + 1);
      target.push(x1, y1, z, x2, y1, z, x2, y1, z, x2, y2, z, x2, y2, z, x1, y2, z, x1, y2, z, x1, y1, z);
    };
    for (const junction of level.traffic.junctions) addRect(junctionLines, junction.minX, junction.minY, junction.maxX, junction.maxY, highZ);
    for (const segment of [...level.traffic.horizontalSegments, ...level.traffic.verticalSegments]) addRect(junctionLines, segment.minX, segment.minY, segment.maxX, segment.maxY, highZ - 2);
    const junctionOverlay = thickSegments(renderer, junctionLines, 0xd98cff);
    junctionOverlay.renderOrder = 80; renderer.debugJunctions.add(junctionOverlay);
    const zoneLines = new Map<number, number[]>();
    const zoneColors = new Map<number, number>([[GTA2MapZoneType.TrafficLight, 0xff5964], [GTA2MapZoneType.BusStop, 0x62b0ff], [GTA2MapZoneType.Restart, 0xffd166], [GTA2MapZoneType.Gang, 0xc084fc], [GTA2MapZoneType.LocalNavigation, 0x63e6be], [GTA2MapZoneType.Navigation, 0x8be28b]]);
    for (const zone of level.zones) {
      const lines = zoneLines.get(zone.type) ?? []; zoneLines.set(zone.type, lines);
      addRect(lines, zone.x, zone.y, zone.x + Math.max(0, zone.w - 1), zone.y + Math.max(0, zone.h - 1), highZ - 4);
    }
    for (const [type, lines] of zoneLines) {
      const zoneOverlay = thickSegments(renderer, lines, zoneColors.get(type) ?? 0x9aa9b8);
      zoneOverlay.renderOrder = 80; renderer.debugZones.add(zoneOverlay);
    }
  }
export function clearDebugEntities(renderer: any) {
    for (const object of [...renderer.debugEntities.children]) {
      object.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) {
            for (const item of material) item.dispose();
          } else {
            material.dispose();
          }
        }
      });
      renderer.debugEntities.remove(object);
    }
  }
function updatePedestrianLabels(renderer: any, pedestrianStates: readonly NpcState[]) {
  const active = new Set<number>();
  const labels = renderer.debugPedestrianLabelSprites as Map<number, THREE.Sprite>;
  for (const npc of pedestrianStates) {
    active.add(npc.id);
    const patrolGoal = npc.patrolRoute?.[
      Math.min(
        Math.max(npc.patrolPointIndex ?? 0, 0),
        Math.max(0, (npc.patrolRoute?.length ?? 1) - 1),
      )
    ];
    let goal: string | undefined;
    if (npc.target !== undefined) goal = `target ${npc.target}`;
    else if (npc.pathGoal?.nodeId !== undefined) goal = `node ${npc.pathGoal.nodeId}`;
    else if (patrolGoal !== undefined) goal = `node ${patrolGoal}`;
    else if (npc.pathGoal) goal = `(${Math.round(npc.pathGoal.x)}, ${Math.round(npc.pathGoal.y)})`;
    let goalSuffix = '';
    if (goal) goalSuffix = `  goal: ${goal}`;
    const text = `ped ${npc.id} · ${npc.kind}\nstate: ${npc.state}${goalSuffix}`;
    let label = labels.get(npc.id);
    if (!label) {
      label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      label.scale.set(126, 20, 1);
      label.renderOrder = 82;
      labels.set(npc.id, label);
      renderer.debugPedestrianLabels.add(label);
    }
    if (label.userData['text'] !== text) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 18px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.strokeStyle = '#000000'; context.lineWidth = 6; context.fillStyle = '#f5f7ff';
        const lines = text.split('\n');
        lines.forEach((line, index) => { const y = 22 + index * 22; context.strokeText(line.slice(0, 52), 256, y); context.fillText(line.slice(0, 52), 256, y); });
        const material = label.material as THREE.SpriteMaterial;
        material.map?.dispose(); material.map = new THREE.CanvasTexture(canvas); material.needsUpdate = true;
        label.userData['text'] = text;
      }
    }
    label.position.set(npc.x, npc.y + 24, worldEntityZ(npc.z) + WORLD.render.labelZOffset + 8);
  }
  for (const [id, label] of labels) if (!active.has(id)) {
    renderer.debugPedestrianLabels.remove(label);
    const material = label.material as THREE.SpriteMaterial;
    material.map?.dispose(); material.dispose(); labels.delete(id);
  }
}

function clearPedestrianDebugPaths(renderer: any) {
  for (const object of [...renderer.debugPedestrianPaths.children]) {
    object.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) {
          for (const item of material) item.dispose();
        } else {
          material.dispose();
        }
      }
    });
    renderer.debugPedestrianPaths.remove(object);
  }
}

function drawPedestrianDebugPaths(renderer: any, pedestrianStates: readonly NpcState[]) {
  clearPedestrianDebugPaths(renderer);
  const navigation = renderer.pedestrianDebugNavigation as PedestrianNavigation | undefined;
  if (!navigation) return;
  const pathSegments: number[] = [];
  for (const npc of pedestrianStates) {
    if (npc.health <= 0 || npc.state === 'dead') continue;
    // The server owns the temporary ComputePath result. Never rebuild a new
    // route here: doing so made the overlay look like a constantly changing
    // navigation search rather than the path the pedestrian is following.
    const path = npc.path;
    const goal = npc.pathGoal;
    if (!path?.length || !goal) continue;
    const pointIndex = Math.max(0, Math.min(npc.pathPointIndex ?? 0, path.length));
    let previous = { x: npc.x, y: npc.y, z: npc.z };
    for (const id of path.slice(pointIndex)) {
      const node = navigation.node(id);
      if (!node) continue;
      const z = worldEntityZ(node.height) + 28;
      pathSegments.push(previous.x, previous.y, worldEntityZ(previous.z) + 28, node.worldX, node.worldY, z);
      previous = { x: node.worldX, y: node.worldY, z: node.height };
    }
    const goalZ = worldEntityZ(goal.z) + 28;
    if (Math.hypot(previous.x - goal.x, previous.y - goal.y) > 1) {
      pathSegments.push(previous.x, previous.y, worldEntityZ(previous.z) + 28, goal.x, goal.y, goalZ);
    }
  }
  const addPathLines = (points: readonly number[], color: number, order: number) => {
    if (!points.length) return;
    const lines = thickSegments(renderer, points, color, DEBUG_LINE_WIDTH);
    lines.renderOrder = order; renderer.debugPedestrianPaths.add(lines);
  };
  addPathLines(pathSegments, PEDESTRIAN_PATH_COLOR, 81);
}

export function clearPedestrianDebugLabels(renderer: any) {
  const labels = renderer.debugPedestrianLabelSprites as Map<number, THREE.Sprite>;
  for (const label of labels.values()) {
    renderer.debugPedestrianLabels.remove(label);
    const material = label.material as THREE.SpriteMaterial;
    material.map?.dispose(); material.dispose();
  }
  labels.clear();
}

export function trafficDebugLabelText(vehicle: TrafficState) {
  const node = (value: number | undefined) => value === undefined ? '-' : String(value);
  const metadata: string[] = [];
  if (vehicle.junction !== undefined) metadata.push(`junction ${vehicle.junction}`);
  if (vehicle.signal !== undefined && vehicle.signal !== 'none') metadata.push(`signal ${vehicle.signal}`);
  if (vehicle.transport !== undefined) metadata.push(vehicle.serviceStop === undefined ? vehicle.transport : `${vehicle.transport} stop ${vehicle.serviceStop}`);
  if (vehicle.pursuitTarget !== undefined) metadata.push(`pursuit ${vehicle.pursuitTarget}`);
  if (vehicle.passengers.length > 0) metadata.push(`occupants ${vehicle.passengers.length}`);
  if (vehicle.brakeLights) metadata.push('braking');
  if (vehicle.wrecked) metadata.push('wrecked');
  else if (vehicle.damagePhase !== undefined && vehicle.damagePhase !== 'new') metadata.push(vehicle.damagePhase);
  return [
    `car ${vehicle.id} · model ${vehicle.model ?? '-'} · ai ${vehicle.aiState ?? 'none'}`,
    `route ${node(vehicle.routeNode)} → target ${node(vehicle.targetNode)} · speed ${Math.round(vehicle.speed)}`,
    `throttle ${vehicle.throttle.toFixed(2)} · brake ${vehicle.brakePressure.toFixed(2)} · handbrake ${vehicle.handbrakeForce.toFixed(2)}`,
    `health ${Math.round(vehicle.health)}${metadata.length ? ` · ${metadata.join(' · ')}` : ''}`,
  ];
}

function updateTrafficLabels(renderer: any, trafficStates: readonly TrafficState[]) {
  const active = new Set<number>();
  const labels = renderer.debugTrafficLabelSprites as Map<number, THREE.Sprite>;
  for (const vehicle of trafficStates) {
    active.add(vehicle.id);
    const text = trafficDebugLabelText(vehicle).join('\n');
    let label = labels.get(vehicle.id);
    if (!label) {
      label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      label.scale.set(192, 32, 1);
      label.renderOrder = 83;
      labels.set(vehicle.id, label);
      renderer.debugTrafficLabels.add(label);
    }
    if (label.userData['text'] !== text) {
      const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 17px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.strokeStyle = '#000000'; context.lineWidth = 6; context.fillStyle = vehicle.health > 0 ? '#f5f7ff' : '#ff8b8b';
        text.split('\n').forEach((line, index) => { const y = 18 + index * 26; context.strokeText(line.slice(0, 92), 384, y); context.fillText(line.slice(0, 92), 384, y); });
        const material = label.material as THREE.SpriteMaterial;
        material.map?.dispose(); material.map = new THREE.CanvasTexture(canvas); material.needsUpdate = true;
        label.userData['text'] = text;
      }
    }
    const { height } = vehicleBounds(vehicle.model, renderer.carBounds);
    label.position.set(vehicle.x, vehicle.y + height * .5 + 30, worldEntityZ(vehicle.z) + WORLD.render.labelZOffset + 10);
  }
  for (const [id, label] of labels) if (!active.has(id)) {
    renderer.debugTrafficLabels.remove(label);
    const material = label.material as THREE.SpriteMaterial;
    material.map?.dispose(); material.dispose(); labels.delete(id);
  }
}

export function clearTrafficDebugLabels(renderer: any) {
  const labels = renderer.debugTrafficLabelSprites as Map<number, THREE.Sprite>;
  for (const label of labels.values()) {
    renderer.debugTrafficLabels.remove(label);
    const material = label.material as THREE.SpriteMaterial;
    material.map?.dispose(); material.dispose();
  }
  labels.clear();
}

export function drawDebugEntities(renderer: any, trafficStates: readonly TrafficState[], localPlayer: PlayerState | undefined, pedestrianStates: readonly NpcState[] = []) {
    updatePedestrianLabels(renderer, pedestrianStates);
    updateTrafficLabels(renderer, trafficStates);
    drawPedestrianDebugPaths(renderer, pedestrianStates);
    renderer.clearDebugEntities();
    const addLine = (points: number[], color: number, opacity = 1) => {
      const line = thickSegments(renderer, points, color, DEBUG_LINE_WIDTH, opacity);
      line.renderOrder = 82; renderer.debugEntities.add(line);
    };
    for (const vehicle of trafficStates) {
      const { width, height } = vehicleBounds(vehicle.model, renderer.carBounds);
      let info;
      if (vehicle.model !== undefined) info = renderer.carInfo.get(vehicle.model);
      const doors = vehicleDoorDefinitions(info, { width, height });
      const offsets: [number, number][] = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
      const corners: [number, number][] = offsets.map(([x, y]): [number, number] => {
        const rotated = rotateVehicleLocal(x, y, vehicle.rotation);
        return [vehicle.x + rotated.x, vehicle.y + rotated.y];
      });
      const box: number[] = [];
      for (let i = 0; i < 4; i++) { const a = corners[i]!, b = corners[(i + 1) % 4]!; box.push(a[0], a[1], worldEntityZ(vehicle.z) + 4, b[0], b[1], worldEntityZ(vehicle.z) + 4); }
      if (renderer.debugGroups.car) {
        let color = 0xff5555;
        if (vehicle.health > 0) color = 0xffd166;
        addLine(box, color, .9);
      }
      const vx = vehicle.vx, vy = vehicle.vy;
      if (renderer.debugGroups.traffic) {
        // The active AI target is separate from the static road graph: it is
        // the node selected by CarTrafficSpawner for this car's next step.
        const target = vehicle.targetNode === undefined ? undefined : levelRoadNode(renderer, vehicle.targetNode);
        if (target) {
          let color = 0x63e6be;
          if (vehicle.aiState === 'yield') color = 0xffd166;
          if (vehicle.signal === 'red') color = 0xff5964;
          addLine([vehicle.x, vehicle.y, worldEntityZ(vehicle.z) + 8, target.x, target.y, worldEntityZ(target.z) + 8], color, .8);
        }
      }
      if (renderer.debugGroups.car) {
        addLine([vehicle.x, vehicle.y, worldEntityZ(vehicle.z) + 5, vehicle.x + vx * .45, vehicle.y + vy * .45, worldEntityZ(vehicle.z) + 5], 0x4dff9a, .95);
        addLine([vehicle.x, vehicle.y, worldEntityZ(vehicle.z) + 5, vehicle.x - Math.sin(vehicle.rotation) * height * .65, vehicle.y + Math.cos(vehicle.rotation) * height * .65, worldEntityZ(vehicle.z) + 5], 0xff8a4d, .95);
      }
      if (renderer.debugGroups.vehicleDoors || renderer.debugGroups.closestDoor) {
        for (const door of doors) {
          const point = vehicleDoorPoint(vehicle, door.index, info, { width, height });
          const z = worldEntityZ(vehicle.z) + 14;
          let color = 0xff9d66;
          if (door.index % 2 === 0) color = 0x66c7ff;
          if (renderer.debugGroups.vehicleDoors) {
            addLine([vehicle.x, vehicle.y, z, point.outsideX, point.outsideY, z], color, .8);
            addLine([point.outsideX - 7, point.outsideY, z, point.outsideX + 7, point.outsideY, z, point.outsideX, point.outsideY - 7, z, point.outsideX, point.outsideY + 7, z], color, .95);
          }
        }
      }
    }
    if (renderer.debugGroups.closestDoor && localPlayer && localPlayer.vehicleId === undefined) {
      let closest: { x: number; y: number; z: number; distance: number } | undefined;
      for (const vehicle of trafficStates) {
        let info;
        if (vehicle.model !== undefined) info = renderer.carInfo.get(vehicle.model);
        const bounds = vehicleBounds(vehicle.model, renderer.carBounds);
        for (const door of vehicleDoorDefinitions(info, bounds)) {
          const point = vehicleDoorPoint(vehicle, door.index, info, bounds);
          const distance = Math.hypot(localPlayer.x - point.outsideX, localPlayer.y - point.outsideY);
          if (!closest || distance < closest.distance) closest = { x: point.outsideX, y: point.outsideY, z: worldEntityZ(vehicle.z) + 18, distance };
        }
      }
      if (closest) {
        const z = worldEntityZ(localPlayer.z) + 18;
        addLine([localPlayer.x, localPlayer.y, z, closest.x, closest.y, closest.z], 0xffe066, .95);
        addLine([closest.x - 10, closest.y, closest.z, closest.x + 10, closest.y, closest.z, closest.x, closest.y - 10, closest.z, closest.x, closest.y + 10, closest.z], 0xffe066, 1);
      }
    }
  }
export function levelRoadNode(renderer: any, index: number) {
    const node = renderer.level?.traffic.roadNodes[index];
    if (!node) return undefined;
    return { x: tileToWorld(node.x), y: -tileToWorld(node.y), z: node.z };
  }
