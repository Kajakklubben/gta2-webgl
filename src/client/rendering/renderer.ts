import * as THREE from 'three';
import { loadVehicleBounds } from '../../shared/engine/loader/vehicle-bounds';
import { MapRender } from './map/map-render';
import type { Pixels } from '../../shared/engine/assets/pixels';
import type { Style } from '../../shared/engine/loader/style-parser';
import type { GameMap } from '../../shared/engine/loader/map-parser';
import type { NpcState, PlayerState, TrafficState } from '../../shared/protocol/types';
import type { CarInfo } from '../../shared/engine/loader/style-parser';
import { gameObjectKey, type GameObjectDrawCommand, type GameObjectSpriteLayer } from '../../shared/game/gameobjects/gameobject';
import { SpriteEngine } from './sprite-engine';
import { effects, pickups } from './sprite';
import { PresentationSystem } from './presentation-system';
import { WORLD, tileToWorld, worldActorSurfaceZ, worldSurfaceZ, worldZ } from '../../shared/domain/world/world';
import { GTA2_MAP_LAYER_COUNT } from '../../shared/domain/world/presentation-order';
import { Gta2Camera } from './gta2-camera';
import type { CameraInput } from './gta2-camera';
import { createTopDownCamera, setTopDownCamera, TOP_DOWN_FOV } from './world-projection';
import { buildPedestrianDebug, buildRoadDebug, clearDebugEntities, clearPedestrianDebugLabels, clearTrafficDebugLabels, drawDebugEntities } from './renderer-debug';
import { RenderInterpolation, type RenderObjectFrame } from './render-interpolation';
import { mapLevelFromGameObject, mapLevelFromGameObjectState, mapLevelFromSupportHeight, renderWorldZ as worldEntityZ } from './spatial-depth';
import { mapTileFaceName, type MapTileSelection, type MapTileSelectionTarget } from './map-tile-selection';
import { RENDER_PASS_BANDS, RENDER_PASS_LEVELS, renderPassKey, type RenderPassMetadata } from './render-passes';

export type { DebugDrawGroups, RenderFrame } from './types';
import type { DebugDrawGroups, RenderFrame } from './types';

export interface RendererOptions {
  /** Optional authored GTA2 map-tile coordinate for a detached startup view. */
  initialView?: { x: number; y: number };
  /** Optional canvas used by embedded scenario and diagnostic viewers. */
  canvas?: HTMLCanvasElement;
  /** Drawing-buffer size for an embedded canvas; the main game uses the window. */
  viewport?: { width: number; height: number };
  /** Camera height used by an embedded fixed-view renderer. */
  cameraHeight?: number;
  /** Called when the user clicks a map tile in the browser view. */
  onTileSelected?: (selections: readonly MapTileSelection[]) => void;
}

export class Renderer {
  carBounds: ReturnType<typeof loadVehicleBounds>;
  carInfo = new Map<number, CarInfo>();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cameraController = new Gta2Camera();
  private readonly splitCamera: THREE.PerspectiveCamera;
  private readonly splitCameraController = new Gta2Camera();
  private renderInterpolation = new RenderInterpolation();
  private cameraInput: CameraInput = {};
  private splitCameraInput: CameraInput = {};
  private splitScreen = false;
  private hasCameraFrame = false;
  private cameraFrameNow = 0;
  private map = new MapRender();
  private raycaster = new THREE.Raycaster();
  private tilePickerEnabled = false;
  private enabledMapLevels = new Set(Array.from({ length: GTA2_MAP_LAYER_COUNT }, (_, level) => level));
  private tileSelections: MapTileSelection[] = [];
  private tileSelectionOutline = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xf0c46d, transparent: true, opacity: .95, side: THREE.DoubleSide }),
  );
  private onTileSelected: ((selections: readonly MapTileSelection[]) => void) | undefined;
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
  private lights: { light: THREE.PointLight; on: number; off: number; phase: number; mapLevel: number }[] = [];
  private transientLights = new Map<string, THREE.PointLight>();
  private style: Style;
  private viewportWidth: number;
  private viewportHeight: number;
  private cameraHeight: number = WORLD.render.cameraHeight;
  private listensToResize = false;
  level: GameMap;
  private handleResize = () => {
    this.viewportWidth = innerWidth;
    this.viewportHeight = innerHeight;
    this.resize();
  };
  private resize = () => {
    const width = this.viewportWidth, height = this.viewportHeight;
    this.cameraController.setViewport(width, height);
    this.splitCameraController.setViewport(Math.floor(width / 2), height);
    const center = this.camera.userData['gta2Center'] as { x: number; y: number } | undefined;
    setTopDownCamera(this.camera, center?.x ?? this.camera.position.x, center?.y ?? this.camera.position.y, this.camera.position.z, width, height);
    const splitCenter = this.splitCamera.userData['gta2Center'] as { x: number; y: number } | undefined;
    setTopDownCamera(this.splitCamera, splitCenter?.x ?? this.splitCamera.position.x, splitCenter?.y ?? this.splitCamera.position.y, this.splitCamera.position.z, Math.floor(width / 2), height);
    this.renderer.setSize(width, height);
  };
  constructor(level: GameMap, style: Style, options: RendererOptions = {}) {
    const canvas = options.canvas;
    this.viewportWidth = options.viewport?.width ?? canvas?.width ?? innerWidth;
    this.viewportHeight = options.viewport?.height ?? canvas?.height ?? innerHeight;
    this.cameraHeight = options.cameraHeight ?? WORLD.render.cameraHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, ...(canvas ? { canvas } : {}) });
    this.renderer.autoClear = false;
    this.camera = createTopDownCamera(this.viewportWidth, this.viewportHeight);
    this.splitCamera = createTopDownCamera(this.viewportWidth / 2, this.viewportHeight);
    this.level = level;
    this.carBounds = loadVehicleBounds(style.cars);
    this.carInfo = new Map(style.cars.map(car => [car.model, car] as const));
    this.style = style;
    this.onTileSelected = options.onTileSelected;
    const mapWidth = Math.max(1, level.map.length) * WORLD.tileSize;
    const mapHeight = Math.max(1, level.map[0]?.length ?? 256) * WORLD.tileSize;
    const defaultView = { x: 85, y: 190 };
    const view = options.initialView ?? defaultView;
    const viewX = Math.max(0, Math.min(mapWidth / WORLD.tileSize, view.x));
    const viewY = Math.max(0, Math.min(mapHeight / WORLD.tileSize, view.y));
    const initialWorldX = tileToWorld(viewX);
    const initialWorldY = -tileToWorld(viewY);
    this.cameraController.setMapBounds({ minX: 0, maxX: mapWidth, minY: -mapHeight, maxY: 0 });
    this.cameraController.setViewport(this.viewportWidth, this.viewportHeight);
    this.splitCameraController.setViewport(Math.floor(this.viewportWidth / 2), this.viewportHeight);
    this.cameraController.setInitialPose({ x: initialWorldX, y: initialWorldY, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM });
    this.splitCameraController.setMapBounds({ minX: 0, maxX: mapWidth, minY: -mapHeight, maxY: 0 });
    this.splitCameraController.setInitialPose({ x: initialWorldX, y: initialWorldY, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM });
    this.spriteEngine = new SpriteEngine(this.scene, style);
    this.debugGroup.renderOrder = 80;
    this.debugGroup.userData['gta2RenderPass'] = { mapLevel: GTA2_MAP_LAYER_COUNT - 1, band: 'overlay' } satisfies RenderPassMetadata;
    this.debugGroup.userData['gta2BaseVisible'] = this.debugGroup.visible;
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
    this.tileSelectionOutline.renderOrder = 90;
    this.tileSelectionOutline.visible = false;
    this.tileSelectionOutline.userData['gta2RenderPass'] = { mapLevel: GTA2_MAP_LAYER_COUNT - 1, band: 'overlay' } satisfies RenderPassMetadata;
    this.tileSelectionOutline.userData['gta2BaseVisible'] = this.tileSelectionOutline.visible;
    this.scene.add(this.tileSelectionOutline);
    this.scene.add(new THREE.AmbientLight(0x8090a0, 0.55));
    const codeFrames = (base: number, count: number) => Array.from({ length: count }, (_, index) => style.sprites.codeObjects[base + index]?.[0]).filter((frame): frame is Pixels => !!frame);
    const explosionRange = effects.EXPLOSION_RANGES.small;
    this.presentation = new PresentationSystem(this.scene, codeFrames(explosionRange.start, explosionRange.count));
    this.renderer.setPixelRatio(canvas ? 1 : Math.min(devicePixelRatio, 2)); this.renderer.setClearColor(0x111820);
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, !canvas); this.renderer.domElement.setAttribute('aria-label', 'Game world');
    if (!canvas) document.querySelector('#game')!.append(this.renderer.domElement);
    setTopDownCamera(this.camera, initialWorldX, initialWorldY, this.cameraHeight, this.viewportWidth, this.viewportHeight);
    setTopDownCamera(this.splitCamera, initialWorldX, initialWorldY, this.cameraHeight, Math.floor(this.viewportWidth / 2), this.viewportHeight);
    this.map.scene = this.scene; this.map.camera = this.camera; this.map.CreateMesh(level, style);
    for (const source of level.lights.slice(0, 64)) {
      const light = new THREE.PointLight(source.argb & 0xffffff, source.intensity / 255, Math.max(1, tileToWorld(source.radius)));
      light.position.set(tileToWorld(source.x), -tileToWorld(source.y), worldZ(source.z)); this.scene.add(light);
      this.lights.push({ light, on: source.onTime, off: source.offTime, phase: this.lights.length * 17, mapLevel: mapLevelFromSupportHeight(source.z) });
    }
    this.renderer.domElement.addEventListener('click', this.handleTileClick);
    if (!canvas) {
      this.listensToResize = true;
      addEventListener('resize', this.handleResize);
    }
  }

  private cameraViewportAt(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return undefined;
    if (!this.splitScreen) return { camera: this.camera, left: rect.left, width: rect.width };
    const splitX = rect.left + rect.width / 2;
    if (clientX < splitX) return { camera: this.camera, left: rect.left, width: rect.width / 2 };
    return { camera: this.splitCamera, left: splitX, width: rect.width / 2 };
  }

  private mapFaceObject(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      const value = current.userData['gta2MapFace'] as { x?: number; y?: number; z?: number; type?: number } | undefined;
      if (value && Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.z) && Number.isInteger(value.type)) return value;
      current = current.parent;
    }
    return undefined;
  }

  private mapObjectObject(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      const value = current.userData['gta2MapObject'] as { id?: number; model?: number; x?: number; y?: number; z?: number; collisionLayer?: number } | undefined;
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) return value;
      current = current.parent;
    }
    return undefined;
  }

  private mapRenderOrder(object: THREE.Object3D, metadataKey: 'gta2MapFace' | 'gta2MapObject') {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData[metadataKey] !== undefined) return current.renderOrder;
      current = current.parent;
    }
    return object.renderOrder;
  }

  private intersectMapFaces(mapFaces: readonly THREE.Object3D[]) {
    const objects = [...mapFaces];
    const intersections = this.raycaster.intersectObjects(objects, true);
    const originalSides = new Map<THREE.Material, THREE.Material['side']>();
    for (const object of objects) object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (originalSides.has(material)) continue;
        originalSides.set(material, material.side);
        material.side = THREE.DoubleSide;
      }
    });
    try {
      intersections.push(...this.raycaster.intersectObjects(objects, true));
    } finally {
      for (const [material, side] of originalSides) material.side = side;
    }
    return intersections.sort((a, b) => a.distance - b.distance);
  }

  private tileSelectionAtScreen(clientX: number, clientY: number): MapTileSelection | undefined {
    const viewport = this.cameraViewportAt(clientX, clientY);
    if (!viewport) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mapFaces: THREE.Object3D[] = [];
    const mapObjects: THREE.Object3D[] = [];
    this.scene.traverse(object => {
      if (object.userData['gta2MapFace'] !== undefined) mapFaces.push(object);
      if (object.userData['gta2MapObject'] !== undefined) mapObjects.push(object);
    });
    const pickObjects = [...mapFaces, ...mapObjects];
    const setRay = (x: number, y: number) => this.raycaster.setFromCamera(new THREE.Vector2(
      ((x - viewport.left) / viewport.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    ), viewport.camera);
    const faceFromIntersections = (intersections: readonly THREE.Intersection[], wallsOnly: boolean) => {
      for (const intersection of intersections) {
        const face = this.mapFaceObject(intersection.object);
        const faceName = mapTileFaceName(face?.type ?? -1);
        if (face && faceName !== undefined && (!wallsOnly || faceName !== 'lid')) return { face, faceName, intersection };
        const object = this.mapObjectObject(intersection.object);
        if (object && wallsOnly) return { object, faceName: 'object' as const, intersection };
      }
      return undefined;
    };
    setRay(clientX, clientY);
    const centerIntersections = this.intersectMapFaces(pickObjects);
    // In the overhead view, a rendered wall can be only a few CSS pixels wide.
    // Sample a small cross around the pointer so a near-edge click can still
    // resolve the wall face instead of the lid immediately behind it.
    const wallSamples = [[-6, 0], [6, 0], [0, -6], [0, 6]] as const;
    const centerWall = faceFromIntersections(centerIntersections, true);
    const wallHit = centerWall ?? wallSamples
      .map(([offsetX, offsetY]) => {
        setRay(clientX + offsetX, clientY + offsetY);
        return faceFromIntersections(this.intersectMapFaces(pickObjects), true);
      })
      .find(Boolean);
    const picked = wallHit ?? faceFromIntersections(centerIntersections, false);
    if (picked) {
      if ('object' in picked) {
        const x = Math.round(picked.object.x! / WORLD.tileSize), y = Math.round(-picked.object.y! / WORLD.tileSize);
        const layer = Math.max(0, Math.ceil(picked.object.z!) - 1);
        const blocks = this.level.map[x]?.[y] ?? [];
        return { x, y, hit: { layer, face: picked.faceName, renderOrder: this.mapRenderOrder(picked.intersection.object, 'gta2MapObject'), distance: picked.intersection.distance }, blocks };
      }
      const blocks = this.level.map[picked.face.x!]?.[picked.face.y!] ?? [];
      return { x: picked.face.x!, y: picked.face.y!, hit: { layer: picked.face.z!, face: picked.faceName, renderOrder: this.mapRenderOrder(picked.intersection.object, 'gta2MapFace'), distance: picked.intersection.distance }, blocks };
    }

    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = this.raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    if (!point) return undefined;
    const x = Math.round(point.x / WORLD.tileSize), y = Math.round(-point.y / WORLD.tileSize);
    const mapWidth = this.level.map.length, mapHeight = this.level.map[0]?.length ?? 0;
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return undefined;
    return { x, y, blocks: this.level.map[x]?.[y] ?? [] };
  }

  private tileSelectionAtTarget(target: MapTileSelectionTarget): MapTileSelection {
    let hitObject: THREE.Object3D | undefined;
    this.scene.traverse(object => {
      if (hitObject) return;
      const face = this.mapFaceObject(object);
      if (face && face.x === target.x && face.y === target.y && face.z === target.layer && mapTileFaceName(face.type!) === target.face) hitObject = object;
    });
    return {
      x: target.x,
      y: target.y,
      hit: {
        layer: target.layer,
        face: target.face,
        renderOrder: hitObject ? this.mapRenderOrder(hitObject, 'gta2MapFace') : 0,
        distance: 0,
      },
      blocks: this.level.map[target.x]?.[target.y] ?? [],
    };
  }

  private renderTileSelections() {
    const positions: number[] = [], indices: number[] = [], halfWidth = 1.25;
    for (const selection of this.tileSelections) {
      const layer = selection.hit?.layer ?? selection.blocks.reduce((highest, block, index) => block ? Math.max(highest, index) : highest, 0);
      if (!this.enabledMapLevels.has(layer)) continue;
      const block = selection.blocks[layer];
      const x = selection.x * WORLD.tileSize, y = -selection.y * WORLD.tileSize;
      const segments: [THREE.Vector3, THREE.Vector3][] = [];
      const addBoundarySegments = (vertices: readonly THREE.Vector3[], faceIndices: readonly number[]) => {
        const edgeCounts = new Map<string, { a: number; b: number; count: number }>();
        for (let index = 0; index < faceIndices.length; index += 3) {
          const triangle = [faceIndices[index]!, faceIndices[index + 1]!, faceIndices[index + 2]!];
          for (let edge = 0; edge < 3; edge++) {
            const a = triangle[edge]!, b = triangle[(edge + 1) % 3]!;
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const existing = edgeCounts.get(key);
            if (existing) existing.count++;
            else edgeCounts.set(key, { a, b, count: 1 });
          }
        }
        for (const edge of edgeCounts.values()) {
          if (edge.count !== 1) continue;
          segments.push([vertices[edge.a]!, vertices[edge.b]!]);
        }
      };
      if (block) {
        const faceName = selection.hit?.face;
        const faceType = faceName === 'left' ? 0 : faceName === 'right' ? 1 : faceName === 'top' ? 2 : faceName === 'bottom' ? 3 : 4;
        const faceKey = faceName === 'left' ? 'Left' : faceName === 'right' ? 'Right' : faceName === 'top' ? 'Top' : faceName === 'bottom' ? 'Bottom' : 'Lid';
        const selectedFace = block[faceKey];
        const polygon = selection.hit && faceName !== 'lid' && faceName !== 'object' && selectedFace?.tileNumber
          ? this.map.CreatePolygon(selection.x, selection.y, layer, selectedFace, faceType, block)
          : false;
        if (polygon) {
          const mesh = polygon.children.find(child => child instanceof THREE.Mesh);
          const position = mesh?.geometry.getAttribute('position');
          const polygonIndices = mesh?.geometry.index;
          if (mesh && position && polygonIndices) {
            const vertices = Array.from({ length: position.count }, (_, index) => new THREE.Vector3(
              position.getX(index) + polygon.position.x,
              position.getY(index) + polygon.position.y,
              position.getZ(index) + polygon.position.z + 2,
            ));
            addBoundarySegments(vertices, Array.from({ length: polygonIndices.count }, (_, index) => polygonIndices.getX(index)));
            mesh.geometry.dispose();
          }
        } else {
          // Reuse the authored lid construction so partial blocks, diagonal
          // lids, and ramps get the same footprint and per-vertex height as
          // the map mesh. Build only the boundary edges of its triangles.
          const lid = this.map.CreateLid(new THREE.Vector2(WORLD.tileSize / 2, -WORLD.tileSize / 2), block.slopeType);
          const vertices = lid.vertices.map(vertex => new THREE.Vector3(
            x + vertex.x, y + vertex.y, layer * WORLD.tileSize + vertex.z + 2,
          ));
          addBoundarySegments(vertices, lid.indices);
        }
      } else {
        const z = worldSurfaceZ(layer) + 2, half = WORLD.tileSize / 2;
        const corners = [
          new THREE.Vector3(x - half, y - half, z), new THREE.Vector3(x + half, y - half, z),
          new THREE.Vector3(x + half, y + half, z), new THREE.Vector3(x - half, y + half, z),
        ];
        for (let index = 0; index < corners.length; index++) segments.push([corners[index]!, corners[(index + 1) % corners.length]!]);
      }
      for (const [start, end] of segments) {
        const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        const nx = -dy / length * halfWidth, ny = dx / length * halfWidth, base = positions.length / 3;
        positions.push(
          start.x + nx, start.y + ny, start.z, end.x + nx, end.y + ny, end.z,
          end.x - nx, end.y - ny, end.z, start.x - nx, start.y - ny, start.z,
        );
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geometry = this.tileSelectionOutline.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    this.tileSelectionOutline.visible = this.tileSelections.length > 0 && positions.length > 0;
    this.tileSelectionOutline.userData['gta2BaseVisible'] = this.tileSelectionOutline.visible;
  }

  private setPresentationPassVisibility(level: number, band: (typeof RENDER_PASS_BANDS)[number]) {
    this.scene.traverse(object => {
      const pass = object.userData['gta2RenderPass'] as RenderPassMetadata | undefined;
      if (!pass) return;
      if (object.userData['gta2BaseVisible'] === undefined) object.userData['gta2BaseVisible'] = object.visible;
      object.visible = Boolean(object.userData['gta2BaseVisible']) && pass.mapLevel === level && pass.band === band;
    });
  }

  private restorePresentationVisibility() {
    this.scene.traverse(object => {
      if (object.userData['gta2BaseVisible'] === undefined) return;
      object.visible = Boolean(object.userData['gta2BaseVisible']);
    });
  }

  private enableDepthForAllMaterials() {
    this.scene.traverse(object => {
      const renderable = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
      if (renderable.material === undefined) return;
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of materials) {
        if (material.depthTest === true && material.depthWrite === true) continue;
        material.depthTest = true;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    });
  }

  /** Render one controlled GTA2 pass at a time. Depth is cleared between
   * passes so depth resolves only within the currently active category. */
  private renderPresentationPipeline(camera: THREE.Camera) {
    this.enableDepthForAllMaterials();
    const activePasses = new Set<string>();
    this.scene.traverse(object => {
      const pass = object.userData['gta2RenderPass'] as RenderPassMetadata | undefined;
      if (!pass) return;
      const baseVisible = object.userData['gta2BaseVisible'] === undefined
        ? object.visible
        : Boolean(object.userData['gta2BaseVisible']);
      if (baseVisible) activePasses.add(renderPassKey(pass));
    });
    for (const level of RENDER_PASS_LEVELS) for (const band of RENDER_PASS_BANDS) {
      if (!activePasses.has(`${level}:${band}`)) continue;
      this.setPresentationPassVisibility(level, band);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, camera);
    }
    this.restorePresentationVisibility();
  }

  private handleTileClick = (event: MouseEvent) => {
    if (!this.tilePickerEnabled || event.button !== 0) return;
    const selection = this.tileSelectionAtScreen(event.clientX, event.clientY);
    if (!selection) return;
    const existingIndex = this.tileSelections.findIndex(existing => existing.x === selection.x && existing.y === selection.y);
    if (existingIndex >= 0) {
      const existing = this.tileSelections[existingIndex]!;
      const sameFace = existing.hit?.layer === selection.hit?.layer && existing.hit?.face === selection.hit?.face;
      if (sameFace) this.tileSelections.splice(existingIndex, 1);
      else this.tileSelections[existingIndex] = selection;
    } else {
      this.tileSelections.push(selection);
    }
    this.renderTileSelections();
    this.onTileSelected?.(this.tileSelections);
  };
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
  setCameraHeight(height: number) {
    if (Number.isFinite(height) && height > 0) this.cameraHeight = height;
  }
  setStaticView(view: { x: number; y: number; z?: number; zoom?: number; rotationX?: number }) {
    const pose = { x: view.x, y: view.y, z: view.z ?? 1, zoom: view.zoom ?? Gta2Camera.DEFAULT_ZOOM, rotationX: view.rotationX ?? 0 };
    this.cameraController.setPose(pose);
    this.splitCameraController.setPose(pose);
  }
  rotateCameraX(direction: -1 | 1, player = 1) {
    const controller = player === 2 ? this.splitCameraController : this.cameraController;
    controller.rotateX(direction * Gta2Camera.PITCH_STEP);
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
  getVehicleRenderOrder(id: number) {
    return this.spriteEngine.getRenderOrder(gameObjectKey('vehicle', id));
  }
  getTileRenderOrder(target: MapTileSelectionTarget) {
    let hitObject: THREE.Object3D | undefined;
    this.scene.traverse(object => {
      if (hitObject) return;
      const face = this.mapFaceObject(object);
      if (face && face.x === target.x && face.y === target.y && face.z === target.layer && mapTileFaceName(face.type!) === target.face) hitObject = object;
    });
    return hitObject ? this.mapRenderOrder(hitObject, 'gta2MapFace') : undefined;
  }
  setDebugVisible(visible: boolean) {
    this.debugVisible = visible;
    this.debugGroup.visible = visible;
    this.debugGroup.userData['gta2BaseVisible'] = visible;
  }
  setTilePickerEnabled(enabled: boolean) {
    this.tilePickerEnabled = enabled;
    if (!enabled) {
      this.tileSelections = [];
      this.renderTileSelections();
      this.onTileSelected?.(this.tileSelections);
    }
  }
  setMapLevelsEnabled(levels: readonly number[]) {
    const enabled = levels.filter(level => Number.isInteger(level) && level >= 0 && level < GTA2_MAP_LAYER_COUNT);
    this.enabledMapLevels = new Set(enabled);
    this.map.setEnabledLevels(enabled);
    this.renderTileSelections();
  }
  setTileSelectionTargets(targets: readonly MapTileSelectionTarget[]) {
    this.tileSelections = targets.map(target => this.tileSelectionAtTarget(target));
    this.renderTileSelections();
    this.onTileSelected?.(this.tileSelections);
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
  /** Resolve source light attachments after object interpolation so a moving
   * Molotov's fire/light stays on the displayed projectile, not its last
   * authoritative tick. */
  private updateTransientLights(commands: readonly GameObjectDrawCommand[]) {
    const active = new Set<string>();
    const visit = (sprite: GameObjectSpriteLayer, key: string) => {
      const source = sprite.light;
      if (source) {
        active.add(key);
        let light = this.transientLights.get(key);
        if (!light) {
          light = new THREE.PointLight(source.color, source.intensity, source.radius);
          this.transientLights.set(key, light);
          this.scene.add(light);
        }
        light.color.setHex(source.color);
        light.distance = source.radius;
        light.intensity = source.intensity * Math.max(0, Math.min(1, sprite.opacity ?? 1));
        light.position.set(sprite.placement.x, sprite.placement.y, worldEntityZ(sprite.placement.z) + WORLD.render.projectileZOffset);
        light.visible = light.intensity > 0;
      }
      for (const [index, layer] of (('layers' in sprite ? (sprite as GameObjectSpriteLayer & { layers?: readonly GameObjectSpriteLayer[] }).layers : undefined) ?? []).entries()) visit(layer, `${key}:layer:${index}`);
      for (const [index, attachment] of (sprite.attachments ?? []).entries()) visit(attachment.sprite, `${key}:attachment:${index}`);
    };
    for (const command of commands) visit(command.sprite, command.key);
    for (const [key, light] of this.transientLights) if (!active.has(key)) {
      this.scene.remove(light);
      this.transientLights.delete(key);
    }
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
    const visibleRenderCommands = renderCommands.filter(command => this.enabledMapLevels.has(mapLevelFromGameObject(command, command.sprite)));
    this.updateTransientLights(visibleRenderCommands);
    this.spriteEngine.render(visibleRenderCommands, this.simulationNow);
    this.presentation.render({ now: this.simulationNow, localId, players: visualStates, pickups: pickupStates, isMapLevelEnabled: mapLevel => this.enabledMapLevels.has(mapLevel) });

    for (const source of this.lights) if (source.on || source.off) {
      const cycle = Math.max(1, source.on + source.off), value = (Math.floor(this.simulationNow / 33.333) + source.phase) % cycle;
      source.light.visible = this.enabledMapLevels.has(source.mapLevel) && value < source.on;
    }
    const localPlayer = visualStates.find(state => state.id === localId);
    if (this.debugVisible) {
      const visibleTraffic = trafficStates.filter(vehicle => this.enabledMapLevels.has(mapLevelFromGameObjectState('vehicle', vehicle.z, vehicle.collisionLayer, vehicle.grounded)));
      const visiblePedestrians = drawnPedestrians.filter(pedestrian => this.enabledMapLevels.has(mapLevelFromGameObjectState('npc', pedestrian.z, pedestrian.collisionLayer, pedestrian.grounded)));
      const visibleLocalPlayer = localPlayer && this.enabledMapLevels.has(mapLevelFromGameObjectState('player', localPlayer.z, localPlayer.collisionLayer, localPlayer.grounded)) ? localPlayer : undefined;
      this.drawDebugEntities(visibleTraffic, visibleLocalPlayer, visiblePedestrians);
    }
    let dtSeconds = 1 / WORLD.tickRate;
    if (this.hasCameraFrame) dtSeconds = Math.max(0, Math.min(.1, (now - this.cameraFrameNow) / 1000));
    this.hasCameraFrame = true;
    this.cameraFrameNow = now;
    if (paused) dtSeconds = 0;
    const localIds = frame.localIds?.length ? frame.localIds : [localId];
    const renderViews = this.splitScreen && localIds.length > 1
      ? [{ id: localIds[0]!, camera: this.camera, controller: this.cameraController, input: this.cameraInput, x: 0, width: Math.floor(this.viewportWidth / 2) }, { id: localIds[1]!, camera: this.splitCamera, controller: this.splitCameraController, input: this.splitCameraInput, x: Math.floor(this.viewportWidth / 2), width: this.viewportWidth - Math.floor(this.viewportWidth / 2) }]
      : [{ id: localIds[0] ?? localId, camera: this.camera, controller: this.cameraController, input: this.cameraInput, x: 0, width: this.viewportWidth }];
    this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.clear();
    for (const view of renderViews) {
      const player = visualStates.find(state => state.id === view.id);
      const cameraFrame = view.controller.update(player, visualTraffic, dtSeconds, { input: view.input });
      const sourceFloorZ = Math.max(0, cameraFrame.floorZ);
      const sourceBaseZ = Math.max(cameraFrame.floorZ - 2, 1);
      const sourceElevation = cameraFrame.pose.z - sourceBaseZ;
      view.camera.fov = Math.max(8, Math.min(75, TOP_DOWN_FOV * Gta2Camera.DEFAULT_ZOOM / Math.max(.05, cameraFrame.pose.zoom)));
      setTopDownCamera(view.camera, cameraFrame.pose.x, cameraFrame.pose.y,
        this.cameraHeight + worldActorSurfaceZ(sourceFloorZ) + sourceElevation * WORLD.tileSize,
        view.width, this.viewportHeight, cameraFrame.pose.rotationX);
      this.map.camera = view.camera;
      this.map.render(this.simulationNow);
      this.renderer.setViewport(view.x, 0, view.width, this.viewportHeight);
      this.renderer.setScissor(view.x, 0, view.width, this.viewportHeight);
      this.renderPresentationPipeline(view.camera);
    }
    this.renderer.setScissorTest(false);
  }
  dispose() {
    this.renderer.domElement.removeEventListener('click', this.handleTileClick);
    if (this.listensToResize) removeEventListener('resize', this.handleResize);
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
    for (const light of this.transientLights.values()) this.scene.remove(light);
    this.transientLights.clear();
    this.clearDebugEntities();
    clearPedestrianDebugLabels(this);
    clearTrafficDebugLabels(this);
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
    this.tileSelectionOutline.geometry.dispose();
    (this.tileSelectionOutline.material as THREE.Material).dispose();
  }
}
