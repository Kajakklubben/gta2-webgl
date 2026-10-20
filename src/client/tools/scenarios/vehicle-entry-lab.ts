import * as THREE from 'three';
import { FaceType, mapWallSegments, type GameMap } from '../../../shared/loader/map-parser';
import type { CarInfo, Style } from '../../../shared/loader/style-parser';
import type { CarPhysics } from '../../../shared/loader/gci';
import { Gta2Game } from '../../../shared/game/gta2-game';
import { VehicleObject } from '../../../shared/game/gameobjects/vehicle';
import { loadVehicleBounds, vehicleBounds, type VehicleBounds } from '../../../shared/loader/vehicle-bounds';
import { VEHICLE_DOOR_ANIMATION_FRAMES, VEHICLE_DOOR_FRAME_DELAY, ensureVehicleOccupancy, vehicleDoorDefinitions, vehicleDoorPoint, vehicleSeatDefinitions, type VehicleDoorPoint } from '../../../shared/domain/vehicles/vehicle-occupancy';
import { STEP } from '../../../shared/protocol/constants';
import type { Input, PlayerState, TrafficState } from '../../../shared/protocol/types';
import { WORLD, tilesPerSecondToWorld } from '../../../shared/domain/world/world';
import { SpriteEngine } from '../../rendering/sprite-engine';
import { VEHICLE_PROPERTY_CASE_MODELS } from '../../../shared/domain/vehicles/vehicle-property-cases';
import { ENTRY_APPROACHES, ENTRY_SCENARIO_APPROACHES, EXIT_SCENARIO_IDS, ENTRY_SCENARIO_IDS, VEHICLE_ENTRY_SCENARIOS, VEHICLE_EXIT_SCENARIOS, scenarioSeatSet, scenarioWorldPlacement, vehicleEntryScenario, vehicleExitScenario, type VehicleEntryScenario, type VehicleExitScenario } from '../../../shared/domain/vehicles/vehicle-entry-scenarios';
import { MapRender } from '../../rendering/map/map-render';
import { createTopDownCamera } from '../../rendering/world-projection';
import { renderVehicleEntryLab } from './vehicle-entry-lab-render';
import {
  createCheckerTexture, createScenarioLevel, makePreviewBlockade,
  makePreviewPlayer, makePreviewVehicle, propertyTags, segmentHitsVehicle, segmentsIntersect, vehicleBlockadePlacement,
  type EntryApproach, type EntryCandidate, type EntryLayout, type EntryPhase, type EntryScenarioId,
  type ExitScenarioId, type ScenarioAction,
} from './vehicle-entry-lab-layout';
import { populateScenarioSpeedSelect, type ScenarioSimulationSpeed } from './scenario-speed';

const MAX_SIMULATION_TICKS_PER_PAINT = 64;

export class VehicleEntryLab {
  onOpenChange: ((open: boolean) => void) | undefined;
  readonly panel = document.querySelector<HTMLElement>('#vehicle-entry-lab')!;
  readonly closeButton = document.querySelector<HTMLButtonElement>('#close-entry-lab')!;
  readonly modelSelect = document.querySelector<HTMLSelectElement>('#entry-car')!;
  readonly actionSelect = document.querySelector<HTMLSelectElement>('#entry-action')!;
  readonly scenarioApproachSelect = document.querySelector<HTMLSelectElement>('#entry-scenario-approach')!;
  readonly speedSelect = document.querySelector<HTMLSelectElement>('#entry-speed')!;
  readonly propertyCases = document.querySelector<HTMLElement>('#entry-property-cases')!;
  readonly propertySummary = document.querySelector<HTMLElement>('#entry-property-summary')!;
  readonly playButton = document.querySelector<HTMLButtonElement>('#entry-play')!;
  readonly restartButton = document.querySelector<HTMLButtonElement>('#entry-restart')!;
  readonly stepButton = document.querySelector<HTMLButtonElement>('#entry-step')!;
  readonly progressOutput = document.querySelector<HTMLOutputElement>('#entry-progress')!;
  readonly title = document.querySelector<HTMLElement>('#entry-title')!;
  readonly status = document.querySelector<HTMLElement>('#entry-status')!;
  readonly detail = document.querySelector<HTMLElement>('#entry-detail')!;
  readonly canvas = document.querySelector<HTMLCanvasElement>('#entry-preview')!;
  readonly overlayCanvas = document.querySelector<HTMLCanvasElement>('#entry-overlay')!;
  readonly overlayContext = this.overlayCanvas.getContext('2d')!;
  readonly doorCanvas = document.querySelector<HTMLCanvasElement>('#entry-door-preview')!;
  readonly doorOverlayCanvas = document.querySelector<HTMLCanvasElement>('#entry-door-overlay')!;
  readonly doorOverlayContext = this.doorOverlayCanvas.getContext('2d')!;
  readonly level: GameMap;
  readonly origin: { x: number; y: number };
  readonly mapWalls: ReturnType<typeof mapWallSegments>;
  readonly style: Style;
  readonly carNames: ReadonlyMap<number, string>;
  readonly carPhysics: ReadonlyMap<number, CarPhysics>;
  readonly carBounds: ReadonlyMap<number, VehicleBounds>;
  readonly carInfo: ReadonlyMap<number, CarInfo>;
  readonly mainScene = new THREE.Scene();
  readonly doorScene = new THREE.Scene();
  readonly mainCamera = createTopDownCamera(this.canvas.width, this.canvas.height);
  readonly doorCamera = createTopDownCamera(this.doorCanvas.width, this.doorCanvas.height);
  readonly mainRenderer: THREE.WebGLRenderer;
  readonly doorRenderer: THREE.WebGLRenderer;
  readonly mainSpriteEngine: SpriteEngine;
  readonly doorSpriteEngine: SpriteEngine;
  readonly patternMap = new MapRender();
  readonly patternFloorTexture = createCheckerTexture('#2f9b59', '#237b48');
  readonly patternWallTexture = createCheckerTexture('#ef4444', '#9f2634');
  readonly patternRoofTexture = createCheckerTexture('#435565', '#273540');
  readonly patternFloorMaterial = new THREE.MeshBasicMaterial({ map: this.patternFloorTexture, side: THREE.FrontSide, depthTest: true, depthWrite: true });
  readonly patternWallMaterial = new THREE.MeshBasicMaterial({
    map: this.patternWallTexture,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
  });
  readonly patternRoofMaterial = new THREE.MeshBasicMaterial({
    map: this.patternRoofTexture,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
  });
  selectedModel = 0;
  selectedAction: ScenarioAction = 'enter';
  selectedScenario: EntryScenarioId | ExitScenarioId = 'clear';
  selectedApproach: EntryApproach = 'left';
  progress = 0;
  playing = true;
  viewerVisible = true;
  lastNow = 0;
  accumulator = 0;
  simulationSpeed: ScenarioSimulationSpeed = 1;
  elapsedTicks = 0;
  totalTicks = 1;
  phase: EntryPhase = 'blocked';
  vehicleState!: TrafficState;
  playerState!: PlayerState;
  game!: Gta2Game;
  entryInputSent = false;
  inputSequence = 0;
  stripModel = -1;
  stripDoor = -1;
  stripObjects: VehicleObject[] = [];
  propertyCaseButtons: HTMLButtonElement[] = [];
  request = 0;

  constructor(sourceLevel: GameMap, style: Style, carNames: ReadonlyMap<number, string> = new Map(), carPhysics: ReadonlyMap<number, CarPhysics> = new Map(), carBounds: ReadonlyMap<number, VehicleBounds> = loadVehicleBounds(style.cars)) {
    const scenarioLevel = createScenarioLevel(sourceLevel);
    this.level = scenarioLevel.level;
    this.origin = scenarioLevel.origin;
    this.mapWalls = mapWallSegments(this.level);
    this.style = style;
    this.carNames = carNames;
    this.carPhysics = carPhysics;
    this.carBounds = carBounds;
    this.carInfo = new Map(style.cars.map(car => [car.model, car] as const));
    this.mainScene.background = new THREE.Color(0x0a1118);
    this.doorScene.background = new THREE.Color(0x0a1118);
    this.mainRenderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false });
    this.doorRenderer = new THREE.WebGLRenderer({ canvas: this.doorCanvas, antialias: false, alpha: false });
    this.mainRenderer.setPixelRatio(1); this.mainRenderer.setSize(this.canvas.width, this.canvas.height, false); this.mainRenderer.setClearColor(0x0a1118, 1);
    this.doorRenderer.setPixelRatio(1); this.doorRenderer.setSize(this.doorCanvas.width, this.doorCanvas.height, false); this.doorRenderer.setClearColor(0x0a1118, 1);
    this.mainSpriteEngine = new SpriteEngine(this.mainScene, style);
    this.doorSpriteEngine = new SpriteEngine(this.doorScene, style);
    this.mainScene.add(new THREE.AmbientLight(0x8090a0, .55));
    this.patternMap.scene = this.mainScene;
    this.patternMap.camera = this.mainCamera;
    this.patternMap.CreateMesh(this.level, style, {
      renderOrder: -20,
      materialFactory: (_face, type, block) => {
        if (type !== FaceType.Lid) return this.patternWallMaterial;
        if (block.groundType === 2) return this.patternRoofMaterial;
        return this.patternFloorMaterial;
      },
    });
    const models = style.cars.filter(car => (style.sprites.cars[car.model] ?? []).length > 0);
    this.modelSelect.replaceChildren(...models.map(car => new Option(this.carLabel(car), String(car.model))));
    this.actionSelect.replaceChildren(new Option('Enter vehicle', 'enter'), new Option('Exit vehicle', 'exit'));
    this.populateScenarioOptions();
    this.selectedModel = models[0]?.model ?? 0;
    this.modelSelect.value = String(this.selectedModel); this.actionSelect.value = this.selectedAction; this.scenarioApproachSelect.value = this.scenarioOptionValue(this.selectedScenario, this.selectedApproach);
    this.buildPropertyCases(models);
    this.closeButton.onclick = () => this.setOpen(false);
    this.modelSelect.onchange = () => { this.selectedModel = Number(this.modelSelect.value); this.restart(); };
    this.actionSelect.onchange = () => {
      this.selectedAction = this.actionSelect.value as ScenarioAction;
      if (this.selectedAction === 'enter') this.selectedScenario = ENTRY_SCENARIO_IDS[0];
      else this.selectedScenario = EXIT_SCENARIO_IDS[0];
      this.populateScenarioOptions();
      this.restart();
    };
    this.scenarioApproachSelect.onchange = () => {
      const [scenario, approach] = this.scenarioApproachSelect.value.split('|');
      this.selectedScenario = scenario as EntryScenarioId | ExitScenarioId;
      if (approach && (ENTRY_APPROACHES as readonly string[]).includes(approach)) this.selectedApproach = approach as EntryApproach;
      this.restart();
    };
    populateScenarioSpeedSelect(this.speedSelect, speed => {
      this.simulationSpeed = speed;
      this.accumulator = 0;
      this.render();
    });
    this.playButton.onclick = () => { this.playing = !this.playing; this.updatePlayButton(); };
    this.restartButton.onclick = () => this.restart();
    this.stepButton.onclick = () => { this.playing = false; this.stepGame(); this.updatePlayButton(); this.render(); };
    addEventListener('keydown', this.keydown, true);
    this.updatePlayButton();
    this.restart();
    this.request = requestAnimationFrame(this.paint);
  }

  private carLabel(car: CarInfo) {
    const name = this.carNames.get(car.model);
    if (name) return `${name} · model ${car.model}`;
    return `Model ${car.model}`;
  }

  private buildPropertyCases(models: readonly CarInfo[]) {
    this.propertyCaseButtons = [];
    this.propertyCases.replaceChildren();
    for (const model of VEHICLE_PROPERTY_CASE_MODELS) {
      const car = models.find(candidate => candidate.model === model);
      if (!car) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset['carModel'] = String(car.model); button.setAttribute('aria-pressed', 'false');
      const name = document.createElement('strong'); name.textContent = this.carLabel(car);
      const seats = vehicleSeatDefinitions(car, vehicleBounds(car.model, this.carBounds)).length;
      const properties = document.createElement('small'); properties.textContent = propertyTags(car, seats);
      button.append(name, properties);
      button.onclick = () => {
        this.selectedModel = car.model; this.modelSelect.value = String(car.model);
        this.selectedAction = 'enter'; this.actionSelect.value = 'enter'; this.selectedScenario = 'clear';
        this.selectedApproach = 'left'; this.populateScenarioOptions(); this.scenarioApproachSelect.value = this.scenarioOptionValue('clear', 'left');
        this.restart();
      };
      this.propertyCases.append(button); this.propertyCaseButtons.push(button);
    }
  }

  private populateScenarioOptions() {
    let scenarios: readonly (VehicleEntryScenario | VehicleExitScenario)[] = VEHICLE_EXIT_SCENARIOS;
    if (this.selectedAction === 'enter') scenarios = VEHICLE_ENTRY_SCENARIOS;
    this.scenarioApproachSelect.replaceChildren(...scenarios.flatMap(scenario => {
      let approaches: readonly EntryApproach[] = [this.selectedApproach];
      if (this.selectedAction === 'enter') approaches = ENTRY_SCENARIO_APPROACHES[scenario.id as EntryScenarioId];
      return approaches.map(approach => {
        let title = scenario.title;
        if (this.selectedAction === 'enter') title = `${scenario.title} · ${this.approachLabel(approach)}`;
        return new Option(title, this.scenarioOptionValue(scenario.id, approach));
      });
    }));
    let availableApproaches: readonly EntryApproach[] = [this.selectedApproach];
    if (this.selectedAction === 'enter') availableApproaches = ENTRY_SCENARIO_APPROACHES[this.selectedScenario as EntryScenarioId];
    let approach = availableApproaches[0]!;
    if (availableApproaches.includes(this.selectedApproach)) approach = this.selectedApproach;
    this.selectedApproach = approach;
    this.scenarioApproachSelect.value = this.scenarioOptionValue(this.selectedScenario, approach);
  }

  private scenarioOptionValue(scenario: EntryScenarioId | ExitScenarioId, approach: EntryApproach) { return `${scenario}|${approach}`; }
  private approachLabel(approach: EntryApproach) { return `${approach[0]!.toUpperCase()}${approach.slice(1)}`; }

  private scenario(): VehicleEntryScenario | VehicleExitScenario {
    if (this.selectedAction === 'enter') return vehicleEntryScenario(this.selectedScenario as EntryScenarioId);
    return vehicleExitScenario(this.selectedScenario as ExitScenarioId);
  }

  private layout(): EntryLayout {
    const info = this.carInfo.get(this.selectedModel);
    const bounds = vehicleBounds(this.selectedModel, this.carBounds);
    const scenario = this.scenario();
    let exitSeatIndex = -1;
    if (this.selectedAction === 'exit') exitSeatIndex = (scenario as VehicleExitScenario).exitSeat;
    const placement = scenarioWorldPlacement(this.origin, scenario.vehicle);
    const vehicle = this.vehicleState ?? makePreviewVehicle(this.selectedModel, placement.x, placement.y, 1);
    if (!this.vehicleState) vehicle.rotation = placement.rotation;
    const doors = vehicleDoorDefinitions(info, bounds);
    const seats = vehicleSeatDefinitions(info, bounds);
    let occupiedDoors: Set<number>;
    if (this.selectedAction === 'enter') occupiedDoors = scenarioSeatSet(scenario as VehicleEntryScenario, seats.length);
    else occupiedDoors = new Set([exitSeatIndex]);
    const occupiedSeats = new Set(seats.filter(seat => occupiedDoors.has(seat.index)).map(seat => seat.index));
    const points = new Map<number, VehicleDoorPoint>();
    for (const door of doors) { const point = vehicleDoorPoint(vehicle, door.index, info, bounds); points.set(door.index, point); }
    const authoredBlockades = scenario.blockades.map((blockade, index) => makePreviewBlockade(
      this.selectedModel,
      vehicle,
      vehicleBlockadePlacement(blockade, bounds, bounds),
      100 + index,
    ));
    const blockades = authoredBlockades;
    let exitSeat: typeof seats[number] | undefined;
    if (this.selectedAction === 'exit') exitSeat = seats.find(seat => seat.index === exitSeatIndex);
    let exitPoint: VehicleDoorPoint | undefined;
    if (exitSeat) exitPoint = points.get(exitSeat.door);
    let playerPlacement: { x: number; y: number };
    if (this.selectedAction === 'exit') {
      playerPlacement = { x: vehicle.x, y: vehicle.y };
      if (exitPoint?.seatX !== undefined) playerPlacement.x = exitPoint.seatX;
      if (exitPoint?.seatY !== undefined) playerPlacement.y = exitPoint.seatY;
    } else {
      playerPlacement = scenarioWorldPlacement({ x: vehicle.x, y: vehicle.y }, (scenario as VehicleEntryScenario).player[this.selectedApproach], vehicle.rotation);
    }
    const playerStart = { x: playerPlacement.x, y: playerPlacement.y };
    // Read only the existing map-wall segments for the visual candidate state.
    // GameWorld performs the authoritative raycast against its native
    // fixtures; this keeps the diagnostic red/green door markers on the same
    // loaded geometry without creating scenario-owned walls.
    // The room has one floor layer, so its four boundary faces are the only
    // static route blockers. Keep the diagnostic query independent of the
    // renderer's layer index convention; authoritative collision still runs
    // through the game's map fixtures.
    const mapWalls = this.mapWalls.filter(wall => wall.movement);
    const blockedDoors = new Set<number>();
    for (const door of doors.filter(door => {
      const point = points.get(door.index); if (!point) return false;
      let target = { x: point.outsideX, y: point.outsideY };
      if (this.selectedAction === 'exit') target = { x: point.exitX, y: point.exitY };
      const center = { x: vehicle.x, y: vehicle.y };
      const playerRouteBlocked = this.selectedAction === 'enter' && mapWalls.some(wall => segmentsIntersect(playerStart, target, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }));
      const wallBlocked = mapWalls.some(wall => segmentsIntersect(center, target, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 })) || playerRouteBlocked;
      const carBlocked = blockades.some(blockade => segmentHitsVehicle(center, target, blockade, bounds) || (this.selectedAction === 'enter' && segmentHitsVehicle(playerStart, target, blockade, bounds)));
      return wallBlocked || carBlocked;
    }).map(door => door.index)) blockedDoors.add(door);
    const locked = this.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked;
    let candidateSeats = seats.filter(seat => !occupiedSeats.has(seat.index));
    if (this.selectedAction === 'exit') candidateSeats = seats.filter(seat => seat.index === exitSeatIndex);
    const candidates = candidateSeats.filter(() => !locked).flatMap(seat => doors.map(door => ({ seat, door }))).filter(({ door }) => !blockedDoors.has(door.index)).map(({ seat, door }) => {
      const point = points.get(door.index); if (!point) return;
      let target = { x: point.outsideX, y: point.outsideY };
      if (this.selectedAction === 'exit') target = { x: point.exitX, y: point.exitY };
      return { door: door.index, seat: seat.index, role: seat.role, point, distance: Math.hypot(playerStart.x - target.x, playerStart.y - target.y), preferredDoor: seat.door };
    }).filter((candidate): candidate is EntryCandidate => Boolean(candidate)).sort((a, b) => {
      let aPreferred = 0;
      if (a.door === a.preferredDoor) aPreferred = -1;
      let bPreferred = 0;
      if (b.door === b.preferredDoor) bPreferred = -1;
      if (this.selectedAction === 'exit') return aPreferred - bPreferred || a.distance - b.distance || a.door - b.door;
      return a.distance - b.distance || aPreferred - bPreferred || a.door - b.door;
    });
    return { action: this.selectedAction, info, bounds, vehicle, blockades, doors, seats, points, blockedDoors, occupiedSeats, playerStart, candidates, selected: candidates[0] };
  }

  private createScenarioGame(layout: EntryLayout) {
    const game = new Gta2Game(this.level, undefined, [], this.carPhysics, [], this.carBounds, this.carInfo), scenario = this.scenario();
    const vehiclePlacement = scenarioWorldPlacement(this.origin, scenario.vehicle);
    let vehicleLock: 'locked' | undefined;
    if (this.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked) vehicleLock = 'locked';
    const vehicle = makePreviewVehicle(this.selectedModel, vehiclePlacement.x, vehiclePlacement.y, 1, vehicleLock);
    vehicle.rotation = vehiclePlacement.rotation;
    ensureVehicleOccupancy(vehicle, layout.info, layout.bounds);
    const occupants = [] as NonNullable<TrafficState['occupants']>;
    const player = makePreviewPlayer(layout.playerStart);
    if (layout.action === 'exit') {
      const seat = layout.seats.find(candidate => candidate.index === (scenario as VehicleExitScenario).exitSeat);
      if (seat) {
        const point = layout.points.get(seat.door);
        occupants.push({ id: player.id, door: seat.door, state: 'seated', progress: 1 });
        player.vehicleId = vehicle.id; player.animation = { kind: 'seated', progress: 1 };
        if (point) { player.x = point.seatX; player.y = point.seatY; }
      }
    }
    let passengerSeats: readonly typeof layout.seats[number][] = [];
    if (layout.action === 'enter') passengerSeats = layout.seats.filter(candidate => layout.occupiedSeats.has(candidate.index));
    for (const seat of passengerSeats) {
      const point = layout.points.get(seat.door); if (!point) continue;
      // Seat zero represents the traffic driver in the occupied-entry case;
      // use the same NPC id shape as the authoritative runtime so the replay
      // exercises the carjacking/ejection path.
      const id = seat.index === 0 ? 'npc:1' : `scenario-passenger:${seat.index}`;
      occupants.push({ id, door: seat.door, state: 'seated', progress: 1 });
    }
    if (layout.action === 'exit') {
      for (const door of layout.blockedDoors) {
        const point = layout.points.get(door); if (!point) continue;
      }
    }
    vehicle.occupants = occupants; ensureVehicleOccupancy(vehicle, layout.info, layout.bounds);
    game.addPlayer(player.id, player);
    game.restoreWorld([], [vehicle, ...layout.blockades], []);
    return game;
  }

  private resetObjects() {
    const scenario = this.scenario(), vehiclePlacement = scenarioWorldPlacement(this.origin, scenario.vehicle);
    let vehicleLock: 'locked' | undefined;
    if (this.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked) vehicleLock = 'locked';
    const initialVehicle = makePreviewVehicle(this.selectedModel, vehiclePlacement.x, vehiclePlacement.y, 1, vehicleLock);
    initialVehicle.rotation = vehiclePlacement.rotation;
    const info = this.carInfo.get(this.selectedModel), bounds = vehicleBounds(this.selectedModel, this.carBounds);
    ensureVehicleOccupancy(initialVehicle, info, bounds); this.vehicleState = initialVehicle;
    this.game = this.createScenarioGame(this.layout());
    this.vehicleState = this.game.gameState.vehicleStates.find(vehicle => vehicle.id === 1)!; this.playerState = this.game.gameState.playerStates.get('entry-scenario-player')!;
    const layout = this.layout();
    const locked = this.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked;
    if (layout.action === 'exit') {
      if (layout.selected) this.phase = 'seated';
      else this.phase = 'blocked';
    } else if (layout.selected && !locked) this.phase = 'approaching';
    else this.phase = 'blocked';
    let ticksToDoor = 0;
    if (layout.selected) ticksToDoor = Math.ceil(layout.selected.distance / (tilesPerSecondToWorld(WORLD.player.walkSpeed) * STEP));
    this.totalTicks = Math.max(1, ticksToDoor + WORLD.vehicle.occupancyTransitionTicks + VEHICLE_DOOR_ANIMATION_FRAMES * (VEHICLE_DOOR_FRAME_DELAY + 1) + 8);
    this.elapsedTicks = 0; this.accumulator = 0; this.progress = 0; this.entryInputSent = false; this.inputSequence = 0; this.stripModel = -1; this.stripDoor = -1; this.stripObjects = [];
  }

  private syncPhase(layout: EntryLayout) {
    const state = this.vehicleState.occupants.find(occupant => occupant.id === this.playerState.id)?.state;
    if (layout.action === 'exit') {
      if (state === 'exiting') this.phase = 'exiting';
      else if (this.entryInputSent && this.playerState.vehicleId === undefined) this.phase = 'exited';
      else if (!layout.selected || this.entryInputSent) this.phase = 'blocked';
      return;
    }
    if (state === 'approaching' || state === 'entering' || state === 'seated') this.phase = state;
    else if (!layout.selected || (this.scenario() as VehicleEntryScenario).locked || this.entryInputSent) this.phase = 'blocked';
  }

  /** Advance one fixed authoritative GameWorld tick and send its real input. */
  private stepGame() {
    if (this.phase === 'blocked' || this.phase === 'exited') return;
    const layout = this.layout(); if (!layout.selected || !this.game) { this.phase = 'blocked'; return; }
    const input: Input = { seq: ++this.inputSequence, keys: 0 };
    if (!this.entryInputSent) {
      input.action = 'enter';
      if (layout.action === 'enter') input.vehicleId = this.vehicleState.id;
    }
    this.entryInputSent = true; this.game.step(new Map([[this.playerState.id, input]]));
    this.playerState = this.game.gameState.playerStates.get(this.playerState.id)!; this.vehicleState = this.game.gameState.vehicleStates.find(vehicle => vehicle.id === 1)!; this.syncPhase(this.layout());
    this.elapsedTicks = Math.min(this.totalTicks, this.elapsedTicks + 1); this.progress = Math.min(1, this.elapsedTicks / this.totalTicks);
    const selectedDoor = this.layout().selected?.door;
    if ((layout.action === 'enter' && this.phase === 'seated' && (selectedDoor === undefined || (this.vehicleState.doorStates[selectedDoor]?.frame ?? 0) === 0)) || (layout.action === 'exit' && this.playerState.vehicleId === undefined)) { this.playing = false; this.elapsedTicks = this.totalTicks; this.progress = 1; }
  }

  private render() { renderVehicleEntryLab(this); }

  private paint = (now: number) => {
    if (this.lastNow && this.playing && this.viewerVisible && !this.panel.hidden) {
      this.accumulator = Math.min(this.accumulator + Math.min(250, now - this.lastNow) / 1000 * this.simulationSpeed, STEP * MAX_SIMULATION_TICKS_PER_PAINT);
      let ticks = 0;
      while (this.playing && this.accumulator >= STEP && ticks < MAX_SIMULATION_TICKS_PER_PAINT) {
        this.stepGame();
        this.accumulator -= STEP;
        ticks += 1;
      }
    }
    this.lastNow = now;
    if (this.viewerVisible && !this.panel.hidden) this.render();
    this.request = requestAnimationFrame(this.paint);
  };
  private restart() { this.resetObjects(); this.playing = this.phase !== 'blocked'; this.updatePlayButton(); this.render(); }
  private updatePlayButton() {
    if (this.playing) this.playButton.textContent = 'Pause';
    else this.playButton.textContent = 'Play';
    this.playButton.setAttribute('aria-pressed', String(this.playing));
  }
  setViewerVisible(visible: boolean) {
    this.viewerVisible = visible;
    this.lastNow = 0;
    if (!visible) this.playing = false;
    else if (this.phase !== 'blocked' && this.phase !== 'seated' && this.phase !== 'exited') this.playing = true;
    this.updatePlayButton();
    if (visible) this.render();
  }
  setOpen(open: boolean) { this.panel.hidden = !open; if (open) { this.lastNow = 0; this.render(); } this.onOpenChange?.(open); }
  readonly keydown = (event: KeyboardEvent) => { if (this.panel.hidden) return; if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.setOpen(false); } };
  dispose() {
    cancelAnimationFrame(this.request); removeEventListener('keydown', this.keydown, true);
    this.mainSpriteEngine.dispose(); this.doorSpriteEngine.dispose();
    this.patternFloorMaterial.dispose(); this.patternFloorTexture.dispose();
    this.patternWallMaterial.dispose(); this.patternWallTexture.dispose();
    this.patternRoofMaterial.dispose(); this.patternRoofTexture.dispose();
    this.mainRenderer.dispose(); this.doorRenderer.dispose();
  }
}
