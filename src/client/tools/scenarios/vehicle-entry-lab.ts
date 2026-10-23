import * as THREE from 'three';
import { mapWallSegments, type GameMap } from '../../../shared/engine/loader/map-parser';
import type { CarInfo, Style } from '../../../shared/engine/loader/style-parser';
import type { CarPhysics } from '../../../shared/engine/loader/gci';
import { Gta2Game } from '../../../shared/game/gta2-game';
import { VehicleObject } from '../../../shared/game/gameobjects/vehicle';
import { loadVehicleBounds, vehicleBounds, type VehicleBounds } from '../../../shared/engine/loader/vehicle-bounds';
import { VEHICLE_DOOR_ANIMATION_FRAMES, VEHICLE_DOOR_FRAME_DELAY, ensureVehicleOccupancy, vehicleDoorDefinitions, vehicleDoorPoint, vehicleSeatDefinitions, type VehicleDoorPoint } from '../../../shared/domain/vehicles/vehicle-occupancy';
import { STEP } from '../../../shared/protocol/constants';
import type { Input, PlayerState, TrafficState } from '../../../shared/protocol/types';
import { WORLD, tilesPerSecondToWorld } from '../../../shared/domain/world/world';
import { SpriteEngine } from '../../rendering/sprite-engine';
import { VEHICLE_PROPERTY_CASE_MODELS } from './vehicle-property-cases';
import { ENTRY_SCENARIO_APPROACHES, EXIT_SCENARIO_IDS, scenarioOptionValue, scenarioSeatSet, scenarioWorldPlacement, vehicleEntryScenario, vehicleExitScenario, type VehicleEntryScenario, type VehicleExitScenario } from './vehicle-entry-scenarios';
import { MapRender } from '../../rendering/map/map-render';
import { createTopDownCamera } from '../../rendering/world-projection';
import { renderVehicleEntryLab } from './vehicle-entry-lab-render';
import {
  createScenarioLevel, makePreviewBlockade,
  makePreviewVehicle, propertyTags, segmentHitsVehicle, segmentsIntersect, vehicleBlockadePlacement,
  type EntryApproach, type EntryCandidate, type EntryLayout, type EntryPhase, type EntryScenarioId,
  type ExitScenarioId, type ScenarioAction,
} from './vehicle-entry-lab-layout';
import { populateScenarioSpeedSelect, type ScenarioSimulationSpeed } from './scenario-speed';
import { createScenarioReplayGame } from './scenario-replay-runtime';
import { scenarioDefinition } from './scenario-definitions';
import { ScenarioManualInput } from './scenario-manual-input';

const MAX_SIMULATION_TICKS_PER_PAINT = 64;

export class VehicleEntryLab {
  onOpenChange: ((open: boolean) => void) | undefined;
  onModelChange: ((model: number) => void) | undefined;
  readonly panel = document.querySelector<HTMLElement>('#vehicle-entry-lab')!;
  readonly closeButton = document.querySelector<HTMLButtonElement>('#close-entry-lab')!;
  readonly modelSelect = document.querySelector<HTMLSelectElement>('#entry-car')!;
  readonly speedSelect = document.querySelector<HTMLSelectElement>('#entry-speed')!;
  readonly propertyCases = document.querySelector<HTMLElement>('#entry-property-cases')!;
  readonly propertySummary = document.querySelector<HTMLElement>('#entry-property-summary')!;
  readonly playButton = document.querySelector<HTMLButtonElement>('#entry-play')!;
  readonly restartButton = document.querySelector<HTMLButtonElement>('#entry-restart')!;
  readonly stepButton = document.querySelector<HTMLButtonElement>('#entry-step')!;
  readonly manualButton = document.querySelector<HTMLButtonElement>('#entry-manual')!;
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
  readonly surfaceZ: number;
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
  manualControl = false;
  readonly manualInput = new ScenarioManualInput(() => this.manualControl && !this.panel.hidden && this.playerState !== undefined);
  stripModel = -1;
  stripDoor = -1;
  stripObjects: VehicleObject[] = [];
  propertyCaseButtons: HTMLButtonElement[] = [];
  request = 0;

  constructor(sourceLevel: GameMap, style: Style, carNames: ReadonlyMap<number, string> = new Map(), carPhysics: ReadonlyMap<number, CarPhysics> = new Map(), carBounds: ReadonlyMap<number, VehicleBounds> = loadVehicleBounds(style.cars)) {
    const scenarioLevel = createScenarioLevel(sourceLevel);
    this.level = scenarioLevel.level;
    this.origin = scenarioLevel.origin;
    this.surfaceZ = scenarioLevel.origin.z;
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
    this.patternMap.CreateMesh(this.level, style, { renderOrder: -20 });
    const models = style.cars.filter(car => (style.sprites.cars[car.model] ?? []).length > 0);
    this.modelSelect.replaceChildren(...models.map(car => new Option(this.carLabel(car), String(car.model))));
    this.selectedModel = models.find(model => model.model === 0)?.model ?? models[0]?.model ?? 0;
    this.modelSelect.value = String(this.selectedModel);
    this.buildPropertyCases(models);
    this.closeButton.onclick = () => this.setOpen(false);
    this.modelSelect.onchange = () => this.setCarModel(Number(this.modelSelect.value));
    populateScenarioSpeedSelect(this.speedSelect, speed => {
      this.simulationSpeed = speed;
      this.accumulator = 0;
      this.render();
    });
    this.playButton.onclick = () => { this.playing = !this.playing; this.updatePlayButton(); };
    this.restartButton.onclick = () => this.restart();
    this.stepButton.onclick = () => { this.playing = false; this.stepGame(); this.updatePlayButton(); this.render(); };
    this.manualButton.onclick = () => this.setManualControl(!this.manualControl);
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
        this.setCarModel(car.model);
        this.setScenario('clear', 'left');
      };
      this.propertyCases.append(button); this.propertyCaseButtons.push(button);
    }
  }

  private scenario(): VehicleEntryScenario | VehicleExitScenario {
    if (this.selectedAction === 'enter') return vehicleEntryScenario(this.selectedScenario as EntryScenarioId);
    return vehicleExitScenario(this.selectedScenario as ExitScenarioId);
  }

  private scenarioDefinition() {
    return scenarioDefinition(this.selectedScenario);
  }

  private layout(): EntryLayout {
    const info = this.carInfo.get(this.selectedModel);
    const bounds = vehicleBounds(this.selectedModel, this.carBounds);
    const scenario = this.scenario();
    let exitSeatIndex = -1;
    if (this.selectedAction === 'exit') exitSeatIndex = (scenario as VehicleExitScenario).exitSeat;
    const placement = scenarioWorldPlacement(this.origin, scenario.vehicle);
    const vehicle = this.vehicleState ?? makePreviewVehicle(this.selectedModel, placement.x, placement.y, 1, undefined, this.surfaceZ);
    if (!this.vehicleState) vehicle.rotation = placement.rotation;
    const doors = vehicleDoorDefinitions(info, bounds);
    const seats = vehicleSeatDefinitions(info, bounds);
    let occupiedDoors: Set<number>;
    if (this.selectedAction === 'enter') occupiedDoors = scenarioSeatSet(scenario as VehicleEntryScenario, seats.length);
    else occupiedDoors = this.playerState?.vehicleId === vehicle.id ? new Set([exitSeatIndex]) : new Set();
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
    if (this.selectedAction === 'exit' && this.playerState?.vehicleId !== vehicle.id) {
      playerPlacement = { x: this.playerState?.x ?? vehicle.x, y: this.playerState?.y ?? vehicle.y };
    } else if (this.selectedAction === 'exit') {
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

  private createScenarioGame(_layout: EntryLayout) {
    const replay = createScenarioReplayGame({
      level: { level: this.level, origin: { ...this.origin, z: this.surfaceZ }, surfaceZ: this.surfaceZ, room: { minX: 0, maxX: 0, minY: 0, maxY: 0 } },
      scenario: this.scenarioDefinition(),
      variantId: this.selectedAction === 'enter' ? this.selectedApproach : 'default',
      selectedModel: this.selectedModel,
      carPhysics: this.carPhysics,
      carBounds: this.carBounds,
      carInfo: this.carInfo,
    });
    return replay.game;
  }

  private resetObjects() {
    const scenario = this.scenario(), vehiclePlacement = scenarioWorldPlacement(this.origin, scenario.vehicle);
    let vehicleLock: 'locked' | undefined;
    if (this.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked) vehicleLock = 'locked';
    const initialVehicle = makePreviewVehicle(this.selectedModel, vehiclePlacement.x, vehiclePlacement.y, 1, vehicleLock, this.surfaceZ);
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
    if (state === 'approaching' || state === 'entering' || state === 'seated' || state === 'exiting') {
      if (this.phase === 'blocked' && !layout.selected) return;
      this.phase = state;
      return;
    }
    if (this.phase === 'exited' && this.playerState.vehicleId === undefined) return;
    if (this.phase === 'exiting' && this.playerState.vehicleId === undefined) {
      this.phase = 'exited';
      return;
    }
    if (!layout.selected || (layout.action === 'enter' && (this.scenario() as VehicleEntryScenario).locked) || this.entryInputSent) this.phase = 'blocked';
  }

  /** Advance one fixed authoritative GameWorld tick and send its real input. */
  private stepGame() {
    if (this.phase === 'exited' && !this.manualControl) return;
    const layout = this.layout(); if (!this.game) { this.phase = 'blocked'; return; }
    let input: Input;
    if (this.manualControl) {
      input = this.manualInput.inputForTick(++this.inputSequence);
    } else {
      if (!this.entryInputSent) {
        this.manualInput.queueVehicleToggle();
      }
      input = this.manualInput.inputForTick(++this.inputSequence, false);
    }
    if (input.action === 'enter') this.entryInputSent = true;
    this.game.step(new Map([[this.playerState.id, input]]));
    this.playerState = this.game.gameState.playerStates.get(this.playerState.id)!; this.vehicleState = this.game.gameState.vehicleStates.find(vehicle => vehicle.id === 1)!; this.syncPhase(this.layout());
    this.elapsedTicks = Math.min(this.totalTicks, this.elapsedTicks + 1); this.progress = Math.min(1, this.elapsedTicks / this.totalTicks);
    if (!this.manualControl && this.phase === 'blocked' && this.entryInputSent) {
      this.playing = false;
      this.elapsedTicks = this.totalTicks;
      this.progress = 1;
    }
    const selectedDoor = this.layout().selected?.door;
    if ((layout.action === 'enter' && this.phase === 'seated' && (selectedDoor === undefined || (this.vehicleState.doorStates[selectedDoor]?.frame ?? 0) === 0)) || (layout.action === 'exit' && this.playerState.vehicleId === undefined)) {
      this.elapsedTicks = this.totalTicks;
      this.progress = 1;
      if (!this.manualControl) this.playing = false;
    }
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
  private setManualControl(enabled: boolean) {
    this.restart(enabled);
    if (this.manualControl) this.canvas.focus();
  }
  private restart(manualControl = false) {
    this.manualControl = false;
    this.manualInput.setEnabled(false);
    this.resetObjects();
    this.manualControl = manualControl;
    this.manualInput.setEnabled(this.manualControl);
    this.playing = this.manualControl || this.phase !== 'exited';
    this.manualButton.disabled = false;
    this.manualButton.textContent = this.manualControl ? 'Scripted replay' : 'Manual control';
    this.manualButton.setAttribute('aria-pressed', String(this.manualControl));
    this.updatePlayButton(); this.render();
  }
  setScenario(scenario: EntryScenarioId | ExitScenarioId, approach?: EntryApproach) {
    this.selectedAction = (EXIT_SCENARIO_IDS as readonly string[]).includes(scenario) ? 'exit' : 'enter';
    this.selectedScenario = scenario;
    if (this.selectedAction === 'enter') {
      const availableApproaches = ENTRY_SCENARIO_APPROACHES[scenario as EntryScenarioId];
      this.selectedApproach = approach && (availableApproaches as readonly string[]).includes(approach) ? approach : availableApproaches[0]!;
    }
    const globalScenario = document.querySelector<HTMLSelectElement>('#scenario-select');
    const value = this.selectedAction === 'enter' ? scenarioOptionValue(scenario as EntryScenarioId, this.selectedApproach) : scenario;
    if (globalScenario?.querySelector(`option[value="${value}"]`)) globalScenario.value = value;
    this.restart();
  }
  setCarModel(model: number) {
    if (!this.carInfo.has(model) && !this.carBounds.has(model)) return;
    this.selectedModel = model;
    this.modelSelect.value = String(model);
    this.onModelChange?.(model);
    this.restart();
  }
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
    this.manualInput.dispose();
    this.mainSpriteEngine.dispose(); this.doorSpriteEngine.dispose();
    this.mainRenderer.dispose(); this.doorRenderer.dispose();
  }
}
