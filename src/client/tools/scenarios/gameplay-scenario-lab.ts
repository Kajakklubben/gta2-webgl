import * as THREE from 'three';
import type { CarInfo } from '../../../shared/loader/style-parser';
import type { Style } from '../../../shared/loader/style-parser';
import type { CarPhysics } from '../../../shared/loader/gci';
import { Gta2Game } from '../../../shared/game/gta2-game';
import { newCombat } from '../../../shared/domain/combat/weapons';
import { STEP } from '../../../shared/protocol/constants';
import { WORLD } from '../../../shared/domain/world/world';
import type { VehicleBounds } from '../../../shared/loader/vehicle-bounds';
import type { GameMap } from '../../../shared/loader/map-parser';
import type { Input, NpcState, PlayerState, TrafficState } from '../../../shared/protocol/types';
import type { GameObjectDrawCommand } from '../../../shared/game/gameobjects/gameobject';
import {
  createGameplayScenarioLevel,
  gameplayScenario,
  gameplayTile,
  GAMEPLAY_SCENARIOS,
  type GameplayScenarioDefinition,
  type GameplayScenarioId,
  type GameplayScenarioLevel,
} from './gameplay-scenario-lab-layout';
import { populateScenarioSpeedSelect, type ScenarioSimulationSpeed } from './scenario-speed';
import { createTopDownCamera, setTopDownCamera } from '../../rendering/world-projection';
import { SpriteEngine } from '../../rendering/sprite-engine';
import { scenarioCameraHeight, scenarioViewScale } from './scenario-view';

type ReplayOutcome = 'active' | 'passed' | 'timeout';

const MAX_SIMULATION_TICKS_PER_PAINT = 64;

function playerState(id: string, x: number, y: number, rotation: number, vehicleId?: number): PlayerState {
  const state: PlayerState = {
    id,
    x,
    y,
    z: 1,
    rotation,
    vx: 0,
    vy: 0,
    name: id,
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
  if (vehicleId !== undefined) {
    state.vehicleId = vehicleId;
    state.animation = { kind: 'seated', progress: 1 };
  }
  return state;
}

function npcState(id: number, x: number, y: number, rotation = Math.PI * 1.5): NpcState {
  return {
    id,
    x,
    y,
    z: 1,
    rotation,
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

function vehicleState(
  id: number,
  model: number,
  x: number,
  y: number,
  rotation: number,
  vx = 0,
  vy = 0,
  driver?: string,
): TrafficState {
  const vehicle: TrafficState = {
    id,
    model,
    x,
    y,
    z: 1,
    rotation,
    speed: Math.hypot(vx, vy),
    color: 0xd04b4b,
    health: 100,
    vx,
    vy,
    angularVelocity: 0,
    throttle: 0,
    brakePressure: 1,
    handbrakeForce: 0,
    passengers: [],
    occupants: [],
    doorStates: [],
  };
  if (driver !== undefined) {
    vehicle.passengers = [driver];
    vehicle.occupants = [{ id: driver, door: 0, state: 'seated', progress: 1 }];
  }
  return vehicle;
}

function addFillerNpcs(count: number, startX = 118, startY = 118) {
  return Array.from({ length: count }, (_, index) => npcState(
    40 + index,
    (startX + (index % 4) * 2) * WORLD.tileSize,
    -(startY + Math.floor(index / 4) * 2) * WORLD.tileSize,
  ));
}

function directionLabel(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

/**
 * Deterministic replay room for the gameplay systems added after the vehicle
 * entry lab. The visible canvas is a diagnostic projection; every transition
 * is still produced by Gta2Game.step and the normal authoritative phases.
 */
export class GameplayScenarioLab {
  readonly panel = document.querySelector<HTMLElement>('#gameplay-scenario-lab')!;
  readonly scenarioSelect = document.querySelector<HTMLSelectElement>('#gameplay-scenario')!;
  readonly speedSelect = document.querySelector<HTMLSelectElement>('#gameplay-speed')!;
  readonly restartButton = document.querySelector<HTMLButtonElement>('#gameplay-restart')!;
  readonly playButton = document.querySelector<HTMLButtonElement>('#gameplay-play')!;
  readonly stepButton = document.querySelector<HTMLButtonElement>('#gameplay-step')!;
  readonly progressOutput = document.querySelector<HTMLOutputElement>('#gameplay-progress')!;
  readonly title = document.querySelector<HTMLElement>('#gameplay-title')!;
  readonly status = document.querySelector<HTMLElement>('#gameplay-status')!;
  readonly detail = document.querySelector<HTMLElement>('#gameplay-detail')!;
  readonly canvas = document.querySelector<HTMLCanvasElement>('#gameplay-preview')!;
  readonly context = this.canvas.getContext('2d')!;
  readonly spriteCanvas = document.querySelector<HTMLCanvasElement>('#gameplay-sprites')!;
  readonly spriteScene = new THREE.Scene();
  readonly spriteCamera = createTopDownCamera(this.spriteCanvas.width, this.spriteCanvas.height);
  readonly spriteRenderer: THREE.WebGLRenderer;
  readonly spriteEngine: SpriteEngine;
  readonly style: Style;
  readonly carNames: ReadonlyMap<number, string>;
  readonly carPhysics: ReadonlyMap<number, CarPhysics>;
  readonly carBounds: ReadonlyMap<number, VehicleBounds>;
  readonly carInfo: ReadonlyMap<number, CarInfo>;
  readonly sourceLevel: GameMap;
  readonly selectedModel: number;
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
  request = 0;
  jumpStarted = false;
  carStartX: number | undefined;
  readonly traces = new Map<string, Array<{ x: number; y: number }>>();

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
    this.spriteRenderer = new THREE.WebGLRenderer({ canvas: this.spriteCanvas, antialias: false, alpha: true });
    this.spriteRenderer.setPixelRatio(1);
    this.spriteRenderer.setSize(this.spriteCanvas.width, this.spriteCanvas.height, false);
    this.spriteRenderer.setClearColor(0x000000, 0);
    this.spriteEngine = new SpriteEngine(this.spriteScene, style);
    this.selectedModel = [...carInfo.keys()][0] ?? [...carBounds.keys()][0] ?? 0;
    this.scenarioSelect.replaceChildren(...GAMEPLAY_SCENARIOS.map(scenario => new Option(scenario.title, scenario.id)));
    this.scenarioSelect.value = this.selectedScenario;
    this.scenarioSelect.onchange = () => {
      this.selectedScenario = this.scenarioSelect.value as GameplayScenarioId;
      this.restart();
    };
    populateScenarioSpeedSelect(this.speedSelect, speed => {
      this.simulationSpeed = speed;
      this.accumulator = 0;
      this.render();
    });
    this.restartButton.onclick = () => this.restart();
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

  private useVehicleCatalog() {
    return this.scenario.arrange.vehicleCatalog === true;
  }

  private setupScenario() {
    const useCatalog = this.useVehicleCatalog();
    this.game = new Gta2Game(
      this.scenarioLevel.level,
      undefined,
      [],
      useCatalog ? this.carPhysics : new Map(),
      [],
      this.carBounds,
      useCatalog ? this.carInfo : new Map(),
    );
    const center = gameplayTile(128, 128);
    const actors = this.scenario.arrange.actors;
    const worldPlacement = (placement: { readonly x: number; readonly y: number; readonly rotation?: number }) => ({
      x: center.x + placement.x,
      y: center.y + placement.y,
      rotation: placement.rotation ?? Math.PI * 1.5,
    });
    const vehicles: TrafficState[] = [];
    const npcs: NpcState[] = [];
    const players: PlayerState[] = [];
    for (const actor of actors) {
      const placement = worldPlacement(actor.placement);
      if (actor.kind === 'vehicle' || actor.kind === 'blockade') {
        const vehicle = vehicleState(
          actor.runtimeId ?? vehicles.length + 1,
          actor.model === 'selected' || actor.model === undefined ? this.selectedModel : actor.model,
          placement.x,
          placement.y,
          placement.rotation,
          actor.velocity?.x ?? 0,
          actor.velocity?.y ?? 0,
          actor.driver,
        );
        if (actor.kind === 'blockade') vehicle.doorLock = 'locked';
        vehicles.push(vehicle);
      } else if (actor.kind === 'player') {
        players.push(playerState(actor.id, placement.x, placement.y, placement.rotation, actor.vehicleId));
      } else if (actor.kind === 'npc') {
        npcs.push(npcState(actor.runtimeId ?? npcs.length + 1, placement.x, placement.y, placement.rotation));
      }
    }
    if (npcs.length === 0) npcs.push(...addFillerNpcs(2));
    for (const player of players) this.game.addPlayer(player.id, player);
    this.game.restoreWorld([], vehicles, [], npcs);
  }

  private inputForTick(): ReadonlyMap<string, Input> {
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
    }
  }

  private stepGame() {
    if (!this.playing || this.outcome !== 'active') return;
    this.game.step(this.inputForTick());
    this.elapsedTicks++;
    const player = this.player();
    const npc = this.npc();
    if (player?.jump || npc?.jump) this.jumpStarted = true;
    this.recordTrace();
    if (this.completed()) {
      this.outcome = 'passed';
      this.playing = false;
    } else if (this.elapsedTicks >= this.scenario.act.maxTicks) {
      this.outcome = 'timeout';
      this.playing = false;
    }
    this.render();
  }

  private recordTrace() {
    const add = (id: string, x: number, y: number) => {
      const trace = this.traces.get(id) ?? [];
      trace.push({ x, y });
      if (trace.length > 80) trace.shift();
      this.traces.set(id, trace);
    };
    for (const player of this.game.gameState.playerStates.values()) add(`player:${player.id}`, player.x, player.y);
    for (const npc of this.game.gameState.npcStates.filter(item => item.id < 10)) add(`npc:${npc.id}`, npc.x, npc.y);
    const vehicle = this.vehicle();
    if (vehicle) add(`vehicle:${vehicle.id}`, vehicle.x, vehicle.y);
  }

  private screenPoint(x: number, y: number, scale: number) {
    return {
      x: this.canvas.width / 2 + (x - this.scenarioLevel.origin.x) * scale,
      y: this.canvas.height / 2 - (y - this.scenarioLevel.origin.y) * scale,
    };
  }

  private drawTrace(id: string, scale: number, color: string) {
    const trace = this.traces.get(id);
    if (!trace || trace.length < 2) return;
    this.context.save();
    this.context.strokeStyle = color;
    this.context.globalAlpha = .45;
    this.context.lineWidth = 2;
    this.context.beginPath();
    trace.forEach((point, index) => {
      const screen = this.screenPoint(point.x, point.y, scale);
      if (index === 0) this.context.moveTo(screen.x, screen.y);
      else this.context.lineTo(screen.x, screen.y);
    });
    this.context.stroke();
    this.context.restore();
  }

  private renderActors(now: number) {
    const commands: GameObjectDrawCommand[] = [];
    this.game.drawGameObjects({ now, submit: (command: GameObjectDrawCommand) => commands.push(command) });
    const scale = scenarioViewScale(this.spriteCanvas.width, this.spriteCanvas.height);
    setTopDownCamera(
      this.spriteCamera,
      this.scenarioLevel.origin.x,
      this.scenarioLevel.origin.y,
      scenarioCameraHeight(this.spriteCanvas.height, scale),
      this.spriteCanvas.width,
      this.spriteCanvas.height,
    );
    this.spriteEngine.render(commands, now);
    this.spriteRenderer.render(this.spriteScene, this.spriteCamera);
  }

  private render() {
    const scale = scenarioViewScale(this.canvas.width, this.canvas.height);
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = '#0a1118'; context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let x = this.scenarioLevel.room.minX; x <= this.scenarioLevel.room.maxX; x++) {
      for (let y = this.scenarioLevel.room.minY; y <= this.scenarioLevel.room.maxY; y++) {
        const water = this.scenarioLevel.water && x >= this.scenarioLevel.water.minX && x <= this.scenarioLevel.water.maxX && y >= this.scenarioLevel.water.minY && y <= this.scenarioLevel.water.maxY;
        const topLeft = this.screenPoint(x * WORLD.tileSize - WORLD.tileSize / 2, -y * WORLD.tileSize + WORLD.tileSize / 2, scale);
        context.fillStyle = water ? '#176889' : '#286e4a';
        context.fillRect(topLeft.x, topLeft.y, WORLD.tileSize * scale + 1, WORLD.tileSize * scale + 1);
        context.strokeStyle = water ? '#2b8daf' : '#347d55';
        context.lineWidth = 1;
        context.strokeRect(topLeft.x, topLeft.y, WORLD.tileSize * scale, WORLD.tileSize * scale);
      }
    }
    const vehicle = this.vehicle();
    if (vehicle) this.drawTrace(`vehicle:${vehicle.id}`, scale, '#d04b4b');
    for (const player of this.game.gameState.playerStates.values()) this.drawTrace(`player:${player.id}`, scale, '#f6ca66');
    for (const npc of this.game.gameState.npcStates.filter(item => item.id < 10)) this.drawTrace(`npc:${npc.id}`, scale, '#78d6a1');
    this.renderActors(performance.now());
    context.save();
    context.fillStyle = '#ecf2f8'; context.font = 'bold 13px system-ui, sans-serif'; context.textAlign = 'left'; context.textBaseline = 'top';
    context.fillText(`${this.scenario.title} · ${this.scenario.level.toUpperCase()} LEVEL`, 12, 10);
    context.fillStyle = '#b6c9dc'; context.font = '12px system-ui, sans-serif';
    context.fillText('Green = pavement · blue = AIR/water · traces = movement history · actors use normal sprites', 12, 28);
    context.restore();

    const player = this.player();
    const npc = this.npc();
    const stateBits: string[] = [`tick ${this.elapsedTicks}/${this.scenario.act.maxTicks}`];
    if (player) stateBits.push(`player hp ${player.combat.health}`, `drown ${player.drowningTimer ?? '—'}`, `jump ${player.jump?.phase ?? '—'}`);
    if (npc) stateBits.push(`npc hp ${npc.health}`, `cause ${npc.deathCause ?? '—'}`, `jump ${npc.jump?.phase ?? '—'}`);
    if (vehicle) stateBits.push(`car x ${directionLabel(vehicle.x)}`, `speed ${directionLabel(Math.hypot(vehicle.vx, vehicle.vy))}`);
    context.save(); context.fillStyle = '#c9d7e4'; context.font = '12px ui-monospace, SFMono-Regular, monospace'; context.textAlign = 'left'; context.textBaseline = 'bottom'; context.fillText(stateBits.join(' · '), 12, this.canvas.height - 10); context.restore();

    let status = `running · ${this.scenario.description}`;
    if (this.outcome === 'passed') status = `PASS · ${this.scenario.assert.expected}`;
    if (this.outcome === 'timeout') status = `TIMEOUT · ${this.scenario.assert.expected}`;
    this.title.textContent = this.scenario.title;
    this.status.textContent = status;
    this.detail.textContent = `${this.scenario.description} · car model ${this.carNames.get(this.selectedModel) ?? this.selectedModel} · ${stateBits.join(' · ')}`;
    this.panel.dataset['scenario'] = this.scenario.id;
    this.panel.dataset['level'] = this.scenario.level;
    this.panel.dataset['simulationSpeed'] = String(this.simulationSpeed);
    this.panel.dataset['outcome'] = this.outcome;
    this.panel.dataset['tick'] = String(this.elapsedTicks);
    this.panel.dataset['playerHealth'] = String(player?.combat.health ?? '');
    this.panel.dataset['playerDrowning'] = String(player?.drowningTimer ?? '');
    this.panel.dataset['npcHealth'] = String(npc?.health ?? '');
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

  restart() {
    this.scenario = gameplayScenario(this.selectedScenario);
    this.scenarioLevel = createGameplayScenarioLevel(this.sourceLevel, this.scenario.level);
    this.outcome = 'active';
    this.elapsedTicks = 0;
    this.inputSequence = 0;
    this.jumpStarted = false;
    this.carStartX = undefined;
    this.lastNow = 0;
    this.accumulator = 0;
    this.traces.clear();
    this.setupScenario();
    this.carStartX = this.vehicle()?.x;
    this.playing = true;
    this.updatePlayButton();
    this.render();
  }

  dispose() {
    cancelAnimationFrame(this.request);
    this.spriteEngine.dispose();
    this.spriteRenderer.dispose();
  }
}
