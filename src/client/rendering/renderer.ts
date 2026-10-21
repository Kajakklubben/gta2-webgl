import * as THREE from 'three';
import { loadVehicleBounds } from '../../shared/loader/vehicle-bounds';
import { MapRender } from './map/map-render';
import type { Pixels, Style } from '../../shared/loader/style-parser';
import type { GameMap } from '../../shared/loader/map-parser';
import type { NpcState, PlayerState, TrafficState } from '../../shared/protocol/types';
import type { CarInfo } from '../../shared/loader/style-parser';
import { gameObjectKey, type GameObjectDrawCommand } from '../../shared/game/gameobjects/gameobject';
import { SpriteEngine } from './sprite-engine';
import { effects, pickups } from './sprite';
import { PresentationSystem } from './presentation-system';
import { WORLD, tileToWorld, worldActorSurfaceZ, worldZ } from '../../shared/domain/world/world';
import { Gta2Camera } from './gta2-camera';
import type { CameraInput } from './gta2-camera';
import { createTopDownCamera, setTopDownCamera, TOP_DOWN_FOV } from './world-projection';
import { buildPedestrianDebug, buildRoadDebug, clearDebugEntities, clearPedestrianDebugLabels, clearTrafficDebugLabels, drawDebugEntities } from './renderer-debug';
import { RenderInterpolation, type RenderObjectFrame } from './render-interpolation';
import { renderWorldZ as worldEntityZ } from './spatial-depth';

export type { DebugDrawGroups, RenderFrame } from './types';
import type { DebugDrawGroups, RenderFrame } from './types';

export interface RendererOptions {
  /** Optional authored GTA2 map-tile coordinate for a detached startup view. */
  initialView?: { x: number; y: number };
}

export class Renderer {
  carBounds: ReturnType<typeof loadVehicleBounds>;
  carInfo = new Map<number, CarInfo>();
  private renderer = new THREE.WebGLRenderer({ antialias: false });
  private scene = new THREE.Scene();
  private camera = createTopDownCamera(innerWidth, innerHeight);
  private cameraController = new Gta2Camera();
  private readonly splitCamera = createTopDownCamera(innerWidth, innerHeight);
  private readonly splitCameraController = new Gta2Camera();
  private renderInterpolation = new RenderInterpolation();
  private cameraInput: CameraInput = {};
  private splitCameraInput: CameraInput = {};
  private splitScreen = false;
  private hasCameraFrame = false;
  private cameraFrameNow = 0;
  private map = new MapRender();
  private spriteEngine: SpriteEngine;
  private presentation: PresentationSystem;
  private debugGroup = new THREE.Group();
  private debugGraph = new THREE.Group();
  private debugPedestrianGraph = new THREE.Group();
  private debugPedestrianPaths = new THREE.Group();
  private debugPedestrianLabels = new THREE.Group();
  readonly debugPedestrianLabelSprites = new Map<number, THREE.Sprite>();
  private debugTrafficLabels = new THREE.Group();
  readonly debugTrafficLabelSprites = new Map<number, THREE.Sprite>();
  private debugSpecialRoutes = new THREE.Group();
  private debugWaypoints = new THREE.Group();
  private debugJunctions = new THREE.Group();
  private debugZones = new THREE.Group();
  private debugEntities = new THREE.Group();
  private debugVisible = false;
  private debugAssetsBuilt = false;
  private debugGroups: DebugDrawGroups = { pedestrianGraph: false, traffic: false, car: false, zones: false, vehicleDoors: false, closestDoor: false };
  private drawCommands: GameObjectDrawCommand[] = [];
  private drawNow = 0;
  private hasSimulationFrame = false;
  private simulationFrameNow = 0;
  private simulationNow = 0;
  private lights: { light: THREE.PointLight; on: number; off: number; phase: number }[] = [];
  private style: Style;
  level: GameMap;
  private resize = () => {
    this.cameraController.setViewport(innerWidth, innerHeight);
    this.splitCameraController.setViewport(Math.floor(innerWidth / 2), innerHeight);
    const center = this.camera.userData['gta2Center'] as { x: number; y: number } | undefined;
    setTopDownCamera(this.camera, center?.x ?? this.camera.position.x, center?.y ?? this.camera.position.y, this.camera.position.z, innerWidth, innerHeight);
    const splitCenter = this.splitCamera.userData['gta2Center'] as { x: number; y: number } | undefined;
    setTopDownCamera(this.splitCamera, splitCenter?.x ?? this.splitCamera.position.x, splitCenter?.y ?? this.splitCamera.position.y, this.splitCamera.position.z, Math.floor(innerWidth / 2), innerHeight);
    this.renderer.setSize(innerWidth, innerHeight);
  };
  constructor(level: GameMap, style: Style, options: RendererOptions = {}) {
    this.level = level;
    this.carBounds = loadVehicleBounds(style.cars);
    this.carInfo = new Map(style.cars.map(car => [car.model, car] as const));
    this.style = style;
    const mapWidth = Math.max(1, level.map.length) * WORLD.tileSize;
    const mapHeight = Math.max(1, level.map[0]?.length ?? 256) * WORLD.tileSize;
    const defaultView = { x: 85, y: 190 };
    const view = options.initialView ?? defaultView;
    const viewX = Math.max(0, Math.min(mapWidth / WORLD.tileSize, view.x));
    const viewY = Math.max(0, Math.min(mapHeight / WORLD.tileSize, view.y));
    const initialWorldX = tileToWorld(viewX);
    const initialWorldY = -tileToWorld(viewY);
    this.cameraController.setMapBounds({ minX: 0, maxX: mapWidth, minY: -mapHeight, maxY: 0 });
    this.cameraController.setViewport(innerWidth, innerHeight);
    this.splitCameraController.setViewport(Math.floor(innerWidth / 2), innerHeight);
    this.cameraController.setInitialPose({ x: initialWorldX, y: initialWorldY, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM });
    this.splitCameraController.setMapBounds({ minX: 0, maxX: mapWidth, minY: -mapHeight, maxY: 0 });
    this.splitCameraController.setInitialPose({ x: initialWorldX, y: initialWorldY, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM });
    this.spriteEngine = new SpriteEngine(this.scene, style);
    this.debugGroup.renderOrder = 80;
    this.debugGraph.renderOrder = 80;
    this.debugPedestrianGraph.renderOrder = 80;
    this.debugPedestrianPaths.renderOrder = 81;
    this.debugPedestrianLabels.renderOrder = 82;
    this.debugTrafficLabels.renderOrder = 82;
    this.debugSpecialRoutes.renderOrder = 80;
    this.debugWaypoints.renderOrder = 80;
    this.debugJunctions.renderOrder = 80;
    this.debugZones.renderOrder = 80;
    this.debugEntities.renderOrder = 81;
    this.debugGroup.add(this.debugGraph, this.debugPedestrianGraph, this.debugPedestrianPaths, this.debugPedestrianLabels, this.debugTrafficLabels, this.debugSpecialRoutes, this.debugWaypoints, this.debugJunctions, this.debugZones);
    this.debugGroup.add(this.debugEntities);
    this.scene.add(this.debugGroup);
    this.scene.add(new THREE.AmbientLight(0x8090a0, 0.55));
    const codeFrames = (base: number, count: number) => Array.from({ length: count }, (_, index) => style.sprites.codeObjects[base + index]?.[0]).filter((frame): frame is Pixels => !!frame);
    const explosionRange = effects.EXPLOSION_RANGES.small;
    this.presentation = new PresentationSystem(this.scene, codeFrames(explosionRange.start, explosionRange.count));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setClearColor(0x111820);
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.domElement.setAttribute('aria-label', 'Game world');
    document.querySelector('#game')!.append(this.renderer.domElement);
    setTopDownCamera(this.camera, initialWorldX, initialWorldY, WORLD.render.cameraHeight, innerWidth, innerHeight);
    setTopDownCamera(this.splitCamera, initialWorldX, initialWorldY, WORLD.render.cameraHeight, Math.floor(innerWidth / 2), innerHeight);
    this.map.scene = this.scene; this.map.camera = this.camera; this.map.CreateMesh(level, style);
    for (const source of level.lights.slice(0, 64)) {
      const light = new THREE.PointLight(source.argb & 0xffffff, source.intensity / 255, Math.max(1, tileToWorld(source.radius)));
      light.position.set(tileToWorld(source.x), -tileToWorld(source.y), worldZ(source.z)); this.scene.add(light);
      this.lights.push({ light, on: source.onTime, off: source.offTime, phase: this.lights.length * 17 });
    }
    addEventListener('resize', this.resize);
  }
  /** Supply presentation-only camera controls. */
  setCameraInput(input: Partial<CameraInput>, player = 1) {
    if (player === 2) this.splitCameraInput = { ...this.splitCameraInput, ...input };
    else this.cameraInput = { ...this.cameraInput, ...input };
  }
  setSplitScreen(enabled: boolean) {
    this.splitScreen = enabled;
  }
  setCameraMode(mode: 'follow' | 'detached') {
    let cameraMode: 'follow' | 'debug' = 'follow';
    if (mode === 'detached') cameraMode = 'debug';
    this.cameraController.setMode(cameraMode);
    this.splitCameraController.setMode(cameraMode);
  }
  setCameraSpeedZoom(enabled: boolean) {
    this.cameraController.setSpeedZoomEnabled(enabled);
    this.splitCameraController.setSpeedZoomEnabled(enabled);
  }
  setCameraLookahead(enabled: boolean) {
    this.cameraController.setLookaheadEnabled(enabled);
    this.splitCameraController.setLookaheadEnabled(enabled);
  }
  setSpriteFrameInterpolation(enabled: boolean) {
    this.spriteEngine.setFrameInterpolation(enabled);
  }
  setDebugVisible(visible: boolean) {
    this.debugVisible = visible;
    this.debugGroup.visible = visible;
  }
  private ensureDebugAssets() {
    if (this.debugAssetsBuilt) return;
    buildPedestrianDebug(this, this.level);
    this.buildRoadDebug(this.level);
    this.debugAssetsBuilt = true;
  }
  setDebugGroups(options: Partial<DebugDrawGroups>) {
    this.debugGroups = { ...this.debugGroups, ...options };
    if (Object.values(this.debugGroups).some(Boolean)) this.ensureDebugAssets();
    this.debugPedestrianGraph.visible = this.debugGroups.pedestrianGraph;
    this.debugPedestrianPaths.visible = this.debugGroups.pedestrianGraph;
    this.debugPedestrianLabels.visible = this.debugGroups.pedestrianGraph;
    this.debugTrafficLabels.visible = this.debugGroups.traffic;
    this.debugGraph.visible = this.debugGroups.traffic;
    this.debugSpecialRoutes.visible = this.debugGroups.traffic;
    this.debugWaypoints.visible = this.debugGroups.traffic;
    this.debugJunctions.visible = this.debugGroups.zones;
    this.debugZones.visible = this.debugGroups.zones;
    this.debugEntities.visible = this.debugGroups.traffic || this.debugGroups.car || this.debugGroups.vehicleDoors || this.debugGroups.closestDoor;
  }
  /** Return drivable vehicles under a screen-space touch point, nearest first. */
  vehicleIdsAtScreen(clientX: number, clientY: number, vehicles: readonly TrafficState[], playerId?: string): number[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    const split = this.splitScreen && playerId !== undefined;
    const second = split && playerId !== undefined && playerId !== '' && playerId !== 'local-player-1';
    const camera = second ? this.splitCamera : this.camera;
    const viewportX = second ? Math.floor(rect.width / 2) : 0;
    const viewportWidth = split ? (second ? rect.width - viewportX : viewportX) : rect.width;
    if (split && (clientX - rect.left < viewportX) !== second) return [];
    const nearest: { id: number; distance: number }[] = [];
    const projected = new THREE.Vector3();
    for (const vehicle of vehicles) {
      projected.set(vehicle.x, vehicle.y, worldEntityZ(vehicle.z)).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = rect.left + viewportX + (projected.x + 1) * .5 * viewportWidth;
      const y = rect.top + (-projected.y + 1) * .5 * rect.height;
      let frame: Pixels | undefined;
      if (vehicle.model !== undefined) frame = this.style.sprites.cars[vehicle.model]?.[0];
      // The authored car sprites are larger than the physics footprint. Keep
      // the touch target forgiving enough for a finger without making nearby
      // cars ambiguous.
      const radius = Math.max(48, Math.min(96, Math.max(frame?.width ?? 34, frame?.height ?? 66) * .8));
      const distance = Math.hypot(clientX - x, clientY - y);
      if (distance <= radius) nearest.push({ id: vehicle.id, distance });
    }
    return nearest.sort((a, b) => a.distance - b.distance).map(item => item.id);
  }
  private buildRoadDebug(level: GameMap) { buildRoadDebug(this, level); }
  private clearDebugEntities() { clearDebugEntities(this); }
  private drawDebugEntities(trafficStates: readonly TrafficState[], localPlayer: PlayerState | undefined, pedestrianStates: readonly NpcState[]) { drawDebugEntities(this, trafficStates, localPlayer, pedestrianStates); }
  get now() { return this.drawNow; }
  submit(command: GameObjectDrawCommand) { this.drawCommands.push(command); }
  private visualPlayers(players: readonly PlayerState[], visualObjects: ReadonlyMap<string, RenderObjectFrame>) {
    return players.map(player => {
      let vehicleFrame: RenderObjectFrame | undefined;
      if (player.animation?.kind === 'seated' && player.vehicleId !== undefined) vehicleFrame = visualObjects.get(gameObjectKey('vehicle', player.vehicleId));
      const frame = vehicleFrame ?? visualObjects.get(gameObjectKey('player', player.id));
      if (!frame) return player;
      return { ...player, ...frame.worldPose, vx: frame.vx, vy: frame.vy };
    });
  }
  private visualCommands(commands: readonly GameObjectDrawCommand[], visualObjects: ReadonlyMap<string, RenderObjectFrame>) {
    return commands.map(command => {
      const sprite = command.sprite;
      const state = command.state as { vehicleId?: number; animation?: { kind?: string } };
      let vehicleFrame: RenderObjectFrame | undefined;
      if (command.kind === 'player' && state.animation?.kind === 'seated' && state.vehicleId !== undefined) vehicleFrame = visualObjects.get(gameObjectKey('vehicle', state.vehicleId));
      const frame = vehicleFrame ?? visualObjects.get(command.key);
      if (!frame) return command;
      return {
        ...command,
        sprite: {
          ...sprite,
          placement: frame.pose,
        },
      };
    });
  }
  render(frame: RenderFrame) {
    const { players: states, localId, now, paused = false } = frame;
    let realDelta = 0;
    if (this.hasSimulationFrame && !paused) realDelta = Math.max(0, Math.min(250, now - this.simulationFrameNow));
    this.hasSimulationFrame = true;
    this.simulationFrameNow = now;
    this.simulationNow += realDelta;
    let pickupStates = [...(frame.pickups ?? [])];
    let trafficStates = [...(frame.traffic ?? [])];
    this.drawNow = now;
    this.drawCommands.length = 0;
    for (const object of frame.objects ?? []) object.draw(this);
    // Snapshots are the authority for transient pickup availability. A stale
    // object registry must not make an active pickup disappear between object
    // reconciliation passes, but do not duplicate a normally registered
    // object command when it is already present.
    const drawnPickupIds = new Set(this.drawCommands
      .filter(command => command.kind === 'pickup')
      .map(command => Number(command.id)));
    for (const pickup of pickupStates) if (pickup.active && !drawnPickupIds.has(pickup.id)) {
      this.drawCommands.push({
        kind: 'pickup', id: pickup.id, key: gameObjectKey('pickup', pickup.id), state: pickup,
        sprite: pickups.spriteFor(pickup),
      });
    }
    const drawnTraffic = this.drawCommands.filter(command => command.kind === 'vehicle').map(command => command.state as TrafficState);
    const drawnPedestrians = this.drawCommands.filter(command => command.kind === 'npc').map(command => command.state as NpcState);
    if (drawnTraffic.length) trafficStates = drawnTraffic;

    // All animated presentation systems use the same simulation clock. This
    // keeps sprites, map tiles, explosions, lights, and interpolation frozen
    // together instead of letting requestAnimationFrame advance them during a
    // local pause.
    const visualObjects = this.renderInterpolation.update(this.drawCommands, this.simulationNow);
    const visualTraffic = trafficStates.map(vehicle => {
      const frame = visualObjects.get(gameObjectKey('vehicle', vehicle.id));
      if (!frame) return vehicle;
      return { ...vehicle, ...frame.worldPose, vx: frame.vx, vy: frame.vy, angularVelocity: frame.angularVelocity };
    });
    const renderCommands = this.visualCommands(this.drawCommands, visualObjects);
    const visualStates = this.visualPlayers(states, visualObjects);
    this.spriteEngine.render(renderCommands, this.simulationNow);
    this.presentation.render({ now: this.simulationNow, localId, players: visualStates, pickups: pickupStates });

    for (const source of this.lights) if (source.on || source.off) {
      const cycle = Math.max(1, source.on + source.off), value = (Math.floor(this.simulationNow / 33.333) + source.phase) % cycle;
      source.light.visible = value < source.on;
    }
    const localPlayer = visualStates.find(state => state.id === localId);
    if (this.debugVisible) this.drawDebugEntities(trafficStates, localPlayer, drawnPedestrians);
    let dtSeconds = 1 / WORLD.tickRate;
    if (this.hasCameraFrame) dtSeconds = Math.max(0, Math.min(.1, (now - this.cameraFrameNow) / 1000));
    this.hasCameraFrame = true;
    this.cameraFrameNow = now;
    if (paused) dtSeconds = 0;
    const localIds = frame.localIds?.length ? frame.localIds : [localId];
    const renderViews = this.splitScreen && localIds.length > 1
      ? [{ id: localIds[0]!, camera: this.camera, controller: this.cameraController, input: this.cameraInput, x: 0, width: Math.floor(innerWidth / 2) }, { id: localIds[1]!, camera: this.splitCamera, controller: this.splitCameraController, input: this.splitCameraInput, x: Math.floor(innerWidth / 2), width: innerWidth - Math.floor(innerWidth / 2) }]
      : [{ id: localIds[0] ?? localId, camera: this.camera, controller: this.cameraController, input: this.cameraInput, x: 0, width: innerWidth }];
    this.renderer.setViewport(0, 0, innerWidth, innerHeight);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, innerWidth, innerHeight);
    this.renderer.clear();
    for (const view of renderViews) {
      const player = visualStates.find(state => state.id === view.id);
      const cameraFrame = view.controller.update(player, visualTraffic, dtSeconds, { input: view.input });
      const sourceFloorZ = Math.max(0, cameraFrame.floorZ);
      const sourceBaseZ = Math.max(cameraFrame.floorZ - 2, 1);
      const sourceElevation = cameraFrame.pose.z - sourceBaseZ;
      view.camera.fov = Math.max(8, Math.min(75, TOP_DOWN_FOV * Gta2Camera.DEFAULT_ZOOM / Math.max(.05, cameraFrame.pose.zoom)));
      setTopDownCamera(view.camera, cameraFrame.pose.x, cameraFrame.pose.y,
        WORLD.render.cameraHeight + worldActorSurfaceZ(sourceFloorZ) + sourceElevation * WORLD.tileSize,
        view.width, innerHeight);
      this.map.camera = view.camera;
      this.map.render(this.simulationNow);
      this.renderer.setViewport(view.x, 0, view.width, innerHeight);
      this.renderer.setScissor(view.x, 0, view.width, innerHeight);
      this.renderer.render(this.scene, view.camera);
    }
    this.renderer.setScissorTest(false);
  }
  dispose() {
    removeEventListener('resize', this.resize);
    this.hasSimulationFrame = false;
    this.hasCameraFrame = false;
    this.simulationFrameNow = 0;
    this.cameraFrameNow = 0;
    this.presentation.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    const collect = (object: THREE.Object3D) => object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        geometries.add(child.geometry);
        const collectMaterial = (material: THREE.Material) => {
          materials.add(material);
          const textureMaterial = material as THREE.Material & { map?: THREE.Texture | null };
          if (textureMaterial.map) textures.add(textureMaterial.map);
        };
        if (Array.isArray(child.material)) {
          for (const material of child.material) collectMaterial(material);
        } else {
          collectMaterial(child.material);
        }
      }
    });
    collect(this.scene);
    for (const row of this.map.sceneObjects) if (row) for (const object of row) if (object) collect(object);
    this.spriteEngine.dispose();
    this.clearDebugEntities();
    clearPedestrianDebugLabels(this);
    clearTrafficDebugLabels(this);
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
