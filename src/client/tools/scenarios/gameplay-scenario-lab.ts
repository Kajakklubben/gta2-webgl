import type { CarInfo } from '../../../shared/engine/loader/style-parser';
import type { Style } from '../../../shared/engine/loader/style-parser';
import type { CarPhysics } from '../../../shared/engine/loader/gci';
import { Gta2Game } from '../../../shared/game/gta2-game';
import { STEP } from '../../../shared/protocol/constants';
import type { VehicleBounds } from '../../../shared/engine/loader/vehicle-bounds';
import type { GameMap } from '../../../shared/engine/loader/map-parser';
import type { Input } from '../../../shared/protocol/types';
import { createCarDebugOverlay, createPlayerDebugOverlay } from '../../app/player-debug-overlay';
import { updateMapTileDebugOverlay } from '../../app/tile-debug-overlay';
import { Renderer } from '../../rendering/renderer';
import {
  createGameplayScenarioLevel,
  gameplayScenario,
  GAMEPLAY_SCENARIOS,
  type GameplayScenarioDefinition,
  type GameplayScenarioId,
  type GameplayScenarioLevel,
} from './gameplay-scenario-lab-layout';
import { populateScenarioSpeedSelect, type ScenarioSimulationSpeed } from './scenario-speed';
import { SCENARIO_VIEW_CAMERA_HEIGHT, TINY_TOWN_CAMERA_HEIGHT, scenarioCameraHeight, scenarioViewScale } from './scenario-view';
import { createScenarioReplayGame } from './scenario-replay-runtime';
import { ScenarioManualInput } from './scenario-manual-input';
import type { MapTileSelection } from '../../rendering/map-tile-selection';
import { populateMapLevelSelect, selectedMapLevels } from '../../app/map-level-select';

type ReplayOutcome = 'active' | 'passed' | 'failed' | 'timeout';

const MAX_SIMULATION_TICKS_PER_PAINT = 64;
const TINY_TOWN_DEFAULT_SURFACES = [
  { x: 83, y: 188, layer: 5, face: 'lid' },
  { x: 76, y: 189, layer: 2, face: 'lid' },
  { x: 75, y: 188, layer: 3, face: 'lid' },
  { x: 77, y: 189, layer: 2, face: 'lid' },
  { x: 73, y: 189, layer: 1, face: 'lid' },
  { x: 84, y: 187, layer: 3, face: 'lid' },
] as const;

const TINY_TOWN_RENDER_ORDER_EXPECTATION = [
  { label: 'z1 lid', target: { x: 73, y: 189, layer: 1, face: 'lid' } },
  { label: 'Car 2', vehicleId: 2 },
  { label: 'z2 lid', target: { x: 76, y: 189, layer: 2, face: 'lid' } },
  { label: 'z2 lid', target: { x: 77, y: 189, layer: 2, face: 'lid' } },
  { label: 'z3 lid', target: { x: 75, y: 188, layer: 3, face: 'lid' } },
  { label: 'z3 lid', target: { x: 84, y: 187, layer: 3, face: 'lid' } },
  { label: 'Car 1', vehicleId: 1 },
  { label: 'Car 5', vehicleId: 5 },
  { label: 'Car 3', vehicleId: 3 },
  { label: 'Car 4', vehicleId: 4 },
  { label: 'z5 lid', target: { x: 83, y: 188, layer: 5, face: 'lid' } },
] as const;

function directionLabel(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

/**
 * Deterministic replay room for the gameplay systems added after the vehicle
 * entry lab. The visible canvas embeds the production singleplayer Renderer;
 * every transition is still produced by Gta2Game.step and the normal
 * authoritative phases.
 */
export class GameplayScenarioLab {
  readonly panel = document.querySelector<HTMLElement>('#gameplay-scenario-lab')!;
  readonly speedSelect = document.querySelector<HTMLSelectElement>('#gameplay-speed')!;
  readonly restartButton = document.querySelector<HTMLButtonElement>('#gameplay-restart')!;
  readonly playButton = document.querySelector<HTMLButtonElement>('#gameplay-play')!;
  readonly stepButton = document.querySelector<HTMLButtonElement>('#gameplay-step')!;
  readonly manualButton = document.querySelector<HTMLButtonElement>('#gameplay-manual')!;
  readonly progressOutput = document.querySelector<HTMLOutputElement>('#gameplay-progress')!;
  readonly title = document.querySelector<HTMLElement>('#gameplay-title')!;
  readonly status = document.querySelector<HTMLElement>('#gameplay-status')!;
  readonly detail = document.querySelector<HTMLElement>('#gameplay-detail')!;
  readonly canvas = document.querySelector<HTMLCanvasElement>('#gameplay-preview')!;
  readonly selectSurfaceInput = document.querySelector<HTMLInputElement>('#gameplay-select-surface')!;
  readonly showPlayerStateInput = document.querySelector<HTMLInputElement>('#gameplay-show-player-state')!;
  readonly showCarStateInput = document.querySelector<HTMLInputElement>('#gameplay-show-car-state')!;
  readonly mapLevelsSelect = document.querySelector<HTMLSelectElement>('#gameplay-map-levels')!;
  readonly surfaceSelectionOutput = document.querySelector<HTMLOutputElement>('#gameplay-surface-selection')!;
  readonly playerStateOverlay = document.querySelector<HTMLOutputElement>('#gameplay-player-state-overlay')!;
  readonly carStateOverlay = document.querySelector<HTMLOutputElement>('#gameplay-car-state-overlay')!;
  readonly playerDebugOverlay: ReturnType<typeof createPlayerDebugOverlay>;
  readonly carDebugOverlay: ReturnType<typeof createCarDebugOverlay>;
  selectedSurfaceSelections: readonly MapTileSelection[] = [];
  readonly renderer: Renderer;
  readonly style: Style;
  readonly carNames: ReadonlyMap<number, string>;
  readonly carPhysics: ReadonlyMap<number, CarPhysics>;
  readonly carBounds: ReadonlyMap<number, VehicleBounds>;
  readonly carInfo: ReadonlyMap<number, CarInfo>;
  readonly sourceLevel: GameMap;
  selectedModel: number;
  scenario!: GameplayScenarioDefinition;
  scenarioLevel!: GameplayScenarioLevel;
  game!: Gta2Game;
  selectedScenario: GameplayScenarioId = GAMEPLAY_SCENARIOS[0]!.id;
  outcome: ReplayOutcome = 'active';
  elapsedTicks = 0;
  inputSequence = 0;
  playing = true;
  viewerVisible = false;
  lastNow = 0;
  accumulator = 0;
  simulationSpeed: ScenarioSimulationSpeed = 1;
  manualControl = false;
  readonly manualInput = new ScenarioManualInput(() => this.manualControl && !this.panel.hidden && this.hasPlayer());
  request = 0;
  jumpStarted = false;
  carStartX: number | undefined;

  constructor(
    sourceLevel: GameMap,
    carNames: ReadonlyMap<number, string> = new Map(),
    carPhysics: ReadonlyMap<number, CarPhysics> = new Map(),
    carBounds: ReadonlyMap<number, VehicleBounds> = new Map(),
    carInfo: ReadonlyMap<number, CarInfo> = new Map(),
    style: Style,
  ) {
    this.sourceLevel = sourceLevel;
    this.carNames = carNames;
    this.carPhysics = carPhysics;
    this.carBounds = carBounds;
    this.carInfo = carInfo;
    this.style = style;
    this.playerDebugOverlay = createPlayerDebugOverlay({ stateOverlay: this.playerStateOverlay }, {
      getLocalId: () => this.primaryPlayerId() ?? 'scenario-camera',
      getSplitScreen: () => false,
      getEnabled: () => this.showPlayerStateInput.checked,
      getRenderOrder: vehicleId => this.renderer.getVehicleRenderOrder(vehicleId),
    });
    this.carDebugOverlay = createCarDebugOverlay({ stateOverlay: this.carStateOverlay }, {
      getEnabled: () => this.showCarStateInput.checked,
      getRenderOrder: vehicleId => this.renderer.getVehicleRenderOrder(vehicleId),
    });
    this.renderer = new Renderer(sourceLevel, style, {
      canvas: this.canvas,
      viewport: { width: this.canvas.width, height: this.canvas.height },
      initialView: { x: 78.5, y: 188.5 },
      cameraHeight: TINY_TOWN_CAMERA_HEIGHT,
      onTileSelected: selections => {
        this.selectedSurfaceSelections = selections;
        updateMapTileDebugOverlay(this.surfaceSelectionOutput, selections);
      },
    });
    populateMapLevelSelect(this.mapLevelsSelect);
    this.renderer.setMapLevelsEnabled(selectedMapLevels(this.mapLevelsSelect));
    this.mapLevelsSelect.addEventListener('change', () => {
      this.renderer.setMapLevelsEnabled(selectedMapLevels(this.mapLevelsSelect));
      this.render();
    });
    this.renderer.setTilePickerEnabled(this.selectSurfaceInput.checked);
    this.selectSurfaceInput.addEventListener('change', () => this.renderer.setTilePickerEnabled(this.selectSurfaceInput.checked));
    this.showPlayerStateInput.addEventListener('change', () => this.render());
    this.showCarStateInput.addEventListener('change', () => this.render());
    this.selectedModel = carInfo.has(0) || carBounds.has(0) ? 0 : [...carInfo.keys()][0] ?? [...carBounds.keys()][0] ?? 0;
    populateScenarioSpeedSelect(this.speedSelect, speed => {
      this.simulationSpeed = speed;
      this.accumulator = 0;
      this.render();
    });
    this.restartButton.onclick = () => this.restart();
    this.manualButton.onclick = () => this.setManualControl(!this.manualControl);
    this.playButton.onclick = () => {
      this.playing = !this.playing;
      this.updatePlayButton();
    };
    this.stepButton.onclick = () => {
      this.playing = false;
      this.stepGame();
      this.updatePlayButton();
    };
    this.restart();
    this.request = requestAnimationFrame(this.paint);
  }

  private setupScenario() {
    this.game = createScenarioReplayGame({
      level: this.scenarioLevel,
      scenario: this.scenario,
      selectedModel: this.selectedModel,
      carPhysics: this.carPhysics,
      carBounds: this.carBounds,
      carInfo: this.carInfo,
    }).game;
  }

  private hasPlayer() {
    return this.primaryPlayerId() !== undefined;
  }

  private manualInputForTick(): ReadonlyMap<string, Input> {
    const playerId = this.primaryPlayerId();
    if (!playerId) return new Map();
    return new Map([[playerId, this.manualInput.inputForTick(++this.inputSequence)]]);
  }

  private setManualControl(enabled: boolean) {
    // Switching modes starts a fresh run. Otherwise the scripted replay can
    // finish while the user is reaching for the toggle, leaving manual input
    // attached to an already-passed scenario.
    this.restart(enabled);
    if (this.manualControl) this.canvas.focus();
  }

  private inputForTick(): ReadonlyMap<string, Input> {
    if (this.manualControl) return this.manualInputForTick();
    const input = new Map<string, Input>();
    this.inputSequence++;
    const actorId = this.scenario.act.inputActor;
    if (!actorId) return input;
    if (this.scenario.act.input === 'jump-right') {
      input.set(actorId, {
        seq: this.inputSequence,
        keys: 0,
        action: this.elapsedTicks === 0 ? 'jump' : undefined,
        moveX: 1,
        moveY: 0,
      });
    } else if (this.scenario.act.input === 'drive-right') {
      input.set(actorId, { seq: this.inputSequence, keys: 0, moveX: 1, moveY: 0 });
    }
    return input;
  }

  private primaryPlayerId() {
    return this.scenario.arrange.actors.find(actor => actor.kind === 'player')?.id;
  }

  private player(id = this.primaryPlayerId()) {
    return id === undefined ? undefined : this.game.gameState.playerStates.get(id);
  }

  private npc(id = 1) {
    return this.game.gameState.npcStates.find(item => item.id === id);
  }

  private vehicle() {
    return this.game.gameState.vehicleStates.find(item => item.id === 1);
  }

  private tinyTownRenderOrderItems() {
    return TINY_TOWN_RENDER_ORDER_EXPECTATION.map(item => ({
      label: item.label,
      renderOrder: 'vehicleId' in item
        ? this.renderer.getVehicleRenderOrder(item.vehicleId)
        : this.renderer.getTileRenderOrder(item.target),
    }));
  }

  private tinyTownRenderOrderMatches() {
    const items = this.tinyTownRenderOrderItems();
    return items.every((item, index) => item.renderOrder !== undefined && (index === 0 || item.renderOrder >= items[index - 1]!.renderOrder!));
  }

  private completed() {
    const player = this.player();
    const npc = this.npc();
    const vehicle = this.vehicle();
    switch (this.scenario.assert.completion) {
      case 'jump-over-car':
        return Boolean(player && vehicle && this.jumpStarted && this.elapsedTicks >= 18 && !player.jump && player.combat.health > 0 && player.x > (this.carStartX ?? vehicle.x) + 32);
      case 'npc-jump-over-car':
        return Boolean(npc && vehicle && this.jumpStarted && this.elapsedTicks >= 18 && !npc.jump && npc.health > 0);
      case 'player-car-impact':
        return Boolean(player && player.combat.health <= 0 && player.combat.respawn > 0);
      case 'npc-car-impact':
        return Boolean(npc && npc.health <= 0 && npc.deathCause === 'run-over');
      case 'player-water':
      case 'driver-water':
        return Boolean(player && player.combat.health <= 0 && player.drowningTimer === undefined);
      case 'npc-water':
        return Boolean(npc && npc.health <= 0 && npc.deathCause === 'water');
      case 'tiny-town-rendering':
        return this.elapsedTicks >= 1 && this.tinyTownRenderOrderMatches();
    }
  }

  private stepGame() {
    if (!this.playing || this.outcome !== 'active') return;
    this.game.step(this.inputForTick());
    this.elapsedTicks++;
    const player = this.player();
    const npc = this.npc();
    if (player?.jump || npc?.jump) this.jumpStarted = true;
    if (this.completed()) {
      this.outcome = 'passed';
      this.playing = false;
    } else if (this.elapsedTicks >= this.scenario.act.maxTicks) {
      this.outcome = this.scenario.id === 'tiny-town-rendering' ? 'failed' : 'timeout';
      this.playing = false;
    }
    this.render();
  }

  private scenarioScale(viewHeight: number) {
    const scale = scenarioViewScale(this.canvas.width, viewHeight);
    return this.scenario.level === 'tiny-town'
      ? scale * SCENARIO_VIEW_CAMERA_HEIGHT / TINY_TOWN_CAMERA_HEIGHT
      : scale;
  }

  private render() {
    const now = performance.now();
    const states = this.game.snapshot();
    this.renderer.render({
      now,
      paused: !this.playing,
      localId: this.primaryPlayerId() ?? 'scenario-camera',
      players: states,
      traffic: this.game.gameState.vehicleStates,
      hazards: this.game.gameState.hazardStates,
      objects: this.game.gameObjects.values(),
    });
    this.playerDebugOverlay.update(this.game, states);
    this.carDebugOverlay.update(this.game);
    const vehicle = this.vehicle();
    const player = this.player();
    const npc = this.npc();
    const stateBits: string[] = [`tick ${this.elapsedTicks}/${this.scenario.act.maxTicks}`];
    if (player) stateBits.push(`player hp ${player.combat.health}`, `drown ${player.drowningTimer ?? '—'}`, `jump ${player.jump?.phase ?? '—'}`);
    if (npc) stateBits.push(`npc hp ${npc.health}`, `cause ${npc.deathCause ?? '—'}`, `jump ${npc.jump?.phase ?? '—'}`);
    if (vehicle) stateBits.push(`car x ${directionLabel(vehicle.x)}`, `speed ${directionLabel(Math.hypot(vehicle.vx, vehicle.vy))}`);
    if (this.scenario.level === 'tiny-town') stateBits.push(`cars ${this.game.gameState.vehicleStates.length}/${this.game.gameObjects.vehicles.length}`);
    let status = `running · ${this.scenario.description}`;
    if (this.outcome === 'passed') status = `PASS · ${this.scenario.assert.expected}`;
    if (this.outcome === 'failed') status = `FAIL · ${this.scenario.assert.expected}`;
    if (this.outcome === 'timeout') status = `TIMEOUT · ${this.scenario.assert.expected}`;
    this.title.textContent = this.scenario.title;
    this.status.textContent = status;
    this.detail.textContent = `${this.scenario.description} · car model ${this.carNames.get(this.selectedModel) ?? this.selectedModel} · ${stateBits.join(' · ')}`;
    this.panel.dataset['scenario'] = this.scenario.id;
    this.panel.dataset['level'] = this.scenario.level;
    this.panel.dataset['controlMode'] = this.manualControl ? 'manual' : 'scripted';
    this.panel.dataset['simulationSpeed'] = String(this.simulationSpeed);
    this.panel.dataset['outcome'] = this.outcome;
    this.panel.dataset['tick'] = String(this.elapsedTicks);
    this.panel.dataset['playerHealth'] = String(player?.combat.health ?? '');
    this.panel.dataset['playerDrowning'] = String(player?.drowningTimer ?? '');
    this.panel.dataset['npcHealth'] = String(npc?.health ?? '');
    this.panel.dataset['npcCount'] = String(this.game.gameState.npcStates.length);
    this.panel.dataset['trafficCount'] = String(this.game.gameState.vehicleStates.length);
    this.panel.dataset['npcDeathCause'] = npc?.deathCause ?? '';
    this.panel.dataset['vehicleX'] = String(vehicle?.x ?? '');
    this.panel.dataset['vehicleSpeed'] = String(vehicle ? Math.hypot(vehicle.vx, vehicle.vy) : '');
    this.panel.dataset['playerX'] = String(player?.x ?? '');
    this.panel.dataset['npcX'] = String(npc?.x ?? '');
    this.progressOutput.value = `${this.elapsedTicks}/${this.scenario.act.maxTicks}`;
    this.progressOutput.textContent = `${this.elapsedTicks}/${this.scenario.act.maxTicks}`;
  }

  private paint = (now: number) => {
    if (this.lastNow && this.playing && this.viewerVisible && !this.panel.hidden && this.outcome === 'active') {
      this.accumulator = Math.min(this.accumulator + Math.min(250, now - this.lastNow) / 1000 * this.simulationSpeed, STEP * MAX_SIMULATION_TICKS_PER_PAINT);
      let ticks = 0;
      while (this.playing && this.outcome === 'active' && this.accumulator >= STEP && ticks < MAX_SIMULATION_TICKS_PER_PAINT) {
        this.accumulator -= STEP;
        this.stepGame();
        ticks += 1;
      }
    }
    this.lastNow = now;
    if (this.viewerVisible && !this.panel.hidden) this.render();
    this.request = requestAnimationFrame(this.paint);
  };

  private updatePlayButton() {
    this.playButton.textContent = this.playing ? 'Pause' : 'Play';
    this.playButton.setAttribute('aria-pressed', String(this.playing));
  }

  setOpen(open: boolean) {
    this.viewerVisible = open;
    this.panel.hidden = !open;
    this.lastNow = 0;
    if (open) this.render();
  }

  setScenario(scenario: GameplayScenarioId) {
    this.selectedScenario = scenario;
    this.showCarStateInput.checked = scenario === 'tiny-town-rendering';
    const globalScenario = document.querySelector<HTMLSelectElement>('#scenario-select');
    if (globalScenario?.querySelector(`option[value="${scenario}"]`)) globalScenario.value = scenario;
    this.restart();
  }

  setCarModel(model: number) {
    if (!this.carInfo.has(model) && !this.carBounds.has(model)) return;
    this.selectedModel = model;
    this.restart();
  }

  restart(manualControl = false) {
    this.scenario = gameplayScenario(this.selectedScenario);
    this.scenarioLevel = createGameplayScenarioLevel(this.sourceLevel, this.scenario.level);
    const scale = this.scenarioScale(this.canvas.height);
    this.renderer.setCameraHeight(scenarioCameraHeight(this.canvas.height, scale));
    this.renderer.setStaticView({ x: this.scenarioLevel.origin.x, y: this.scenarioLevel.origin.y });
    this.renderer.setTilePickerEnabled(false);
    this.renderer.setTilePickerEnabled(this.selectSurfaceInput.checked);
    this.outcome = 'active';
    this.elapsedTicks = 0;
    this.inputSequence = 0;
    this.jumpStarted = false;
    this.carStartX = undefined;
    this.lastNow = 0;
    this.accumulator = 0;
    this.manualControl = false;
    this.manualInput.setEnabled(false);
    this.setupScenario();
    this.carStartX = this.vehicle()?.x;
    this.manualControl = manualControl && this.hasPlayer();
    this.manualInput.setEnabled(this.manualControl);
    this.playing = true;
    this.manualButton.disabled = !this.hasPlayer();
    this.manualButton.textContent = this.manualControl ? 'Scripted replay' : 'Manual control';
    this.manualButton.setAttribute('aria-pressed', String(this.manualControl));
    this.updatePlayButton();
    this.render();
    if (this.selectSurfaceInput.checked && this.scenario.id === 'tiny-town-rendering') {
      this.renderer.setTileSelectionTargets(TINY_TOWN_DEFAULT_SURFACES);
      this.render();
    }
  }

  dispose() {
    cancelAnimationFrame(this.request);
    this.manualInput.dispose();
    this.renderer.dispose();
  }
}
