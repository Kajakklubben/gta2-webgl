import { fetchAsset, fetchAvailableMultiplayerMaps, loadClientAssets } from './assets';
import { Gta2Game } from '../../shared/game/gta2-game';
import { FixedClock } from '../../shared/engine/fixed-clock';
import { fromClientHazard, fromClientNpc, fromClientPickup, fromClientPlayer, fromClientTraffic } from '../../shared/protocol/client-dto';
import { DEFAULT_STEP_SECONDS } from '../../shared/protocol/constants';
import { parseServerMessage } from '../../shared/protocol/validation';
import type { ChatMessage, Input, MatchState, PlayerControl, PlayerState } from '../../shared/protocol/types';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import { Renderer } from '../rendering/renderer';
import { AudioBus } from './audio';
import { WORLD } from '../../shared/domain/world/world';

import { createPlayerHud, drawHudWeaponIcon, isGameMenuOpen, setGameMenuOpen, setLobbyOpen, setMapOptions, setStatus, ui } from './main-ui';
import { DEFAULT_MULTIPLAYER_MAP_ID, multiplayerMapById, multiplayerMapForFiles } from '../../shared/loader/multiplayer-maps';
import { parseStartupOptions } from './startup-options';
import type { CarInfo } from '../../shared/loader/style-parser';
import { buildPlayerInput, clearPlayerInputState, createPlayerInputState, queueVehicleEntryRequest } from './player-input';
import { occupantForPlayer, vehicleDoorPoint } from '../../shared/domain/vehicles/vehicle-occupancy';
import { directionFromRotation } from '../../shared/domain/physics/motion-vector';

const DEBUG_SETTINGS_STORAGE_KEY = 'gta2-debug-settings';
const PLAYER_SESSION_STORAGE_KEY = 'gta2-player-session';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DebugTab = 'graphs' | 'player' | 'camera';
type DebugSettings = {
  tab: DebugTab;
  pedestrianGraph: boolean;
  traffic: boolean;
  car: boolean;
  zones: boolean;
  policeAttack: boolean;
  vehicleDoors: boolean;
  closestDoor: boolean;
  cameraMode: 'follow' | 'detached';
  cameraSpeedZoom: boolean;
  cameraLookahead: boolean;
  spriteFrameInterpolation: boolean;
  fpsCounter: boolean;
  showCoordinates: boolean;
  showPlayerState: boolean;
};

function readDebugSettings() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DEBUG_SETTINGS_STORAGE_KEY) ?? 'null');
    if (value && typeof value === 'object') return value as Partial<DebugSettings>;
    return {};
  } catch {
    return {};
  }
}

function getPlayerSessionId() {
  const stored = localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);
  if (stored && UUID_PATTERN.test(stored)) return stored;
  const sessionId = crypto.randomUUID();
  localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

  const { reconnect, status, openMenu, menuResume, menuBackdrop, openDebug, debugMenu, closeDebug, debugTabGraphs, debugTabPlayer, debugTabCamera, debugGraphs, debugPlayer, debugCamera, debugGiveAllWeapons, debugPedestrianGraph, debugTraffic, debugCar, debugZones, debugPoliceAttack, debugVehicleDoors, debugClosestDoor, debugShowCoordinates, debugCoordinates, debugCoordinateOverlay, debugShowPlayerState, debugPlayerStateOverlay, debugResetWorld, debugCameraMode, debugCameraSpeedZoom, debugCameraLookahead, debugSpriteFrameInterpolation, debugFps, nameInput, roomInput, teamInput, mapInput, modeInput, join, readyButton, localReset, localLeave, roomState, scoreboard, feed, chatLog, chatInput, fpsCounter, weaponHint, localPaused, localResume, localPauseLeave } = ui;

// iOS Safari can still start pinch-zoom from overlay elements even when the
// game surface has touch-action: none. Cancel its gesture events globally;
// camera zoom remains available through the game's own controls.
const preventBrowserZoom = (event: Event) => event.preventDefault();
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(eventName, preventBrowserZoom, { passive: false });

const bindings: Record<string, number> = { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8, Space: 16, ControlLeft: 16, ControlRight: 16, KeyZ: 64, KeyX: 64, ShiftLeft: 32, ShiftRight: 32, Tab: 64 };
const localPlayerIds = ['local-player-1', 'local-player-2'] as const;
const localPlayerMaskBindings = [bindings, { KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8, KeyF: 16, KeyT: 32 }];
const localPlayerKeyCodes = [
  new Set([...Object.keys(bindings), 'KeyE', 'KeyP']),
  new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyR', 'KeyT', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyO']),
] as const;
const localPlayerInputs = localPlayerIds.map((id, index) => createPlayerInputState(id, localPlayerMaskBindings[index]!));
const playerHuds = localPlayerIds.map((id, index) => createPlayerHud(id, `PLAYER ${index + 1}`));
let localSplitScreen = false;
let multiplayerMode = false;
let localPausedState = false;
const weaponKeyActions: Record<string, 'previous' | 'next'> = { KeyZ: 'previous', KeyX: 'next', Tab: 'next' };
const cameraKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'PageUp', 'PageDown']);
const controlTransitions = (previous: number, current: number) => {
  const controls: PlayerControl[] = [];
  const transitions: readonly [number, PlayerControl, PlayerControl][] = [
    [1, 'forwardStart', 'forwardEnd'], [2, 'backwardStart', 'backwardEnd'],
    [4, 'leftStart', 'leftEnd'], [8, 'rightStart', 'rightEnd'],
    [16, 'shootStart', 'shootEnd'], [32, 'sprintStart', 'sprintEnd'],
  ];
  for (const [bit, start, end] of transitions) {
    const wasDown = (previous & bit) !== 0, isDown = (current & bit) !== 0;
    if (!wasDown && isDown) controls.push(start);
    else if (wasDown && !isDown) controls.push(end);
  }
  return controls;
};
function gamepadMask(gamepad: Gamepad | null) {
  if (!gamepad) return 0;
  const pressed = (index: number) => gamepad.buttons[index]?.pressed === true;
  const axis = (index: number) => gamepad.axes[index] ?? 0;
  let mask = 0;
  if (pressed(12) || axis(1) < -.35) mask |= 1;
  if (pressed(13) || axis(1) > .35) mask |= 2;
  if (pressed(14) || axis(0) < -.35) mask |= 4;
  if (pressed(15) || axis(0) > .35) mask |= 8;
  if (pressed(4) || pressed(5)) mask |= 32;
  if (pressed(7)) mask |= 64;
  return mask;
}
const gamepadFor = (index: number) => navigator.getGamepads?.()[index] ?? null;
const gamepadActions = (gamepad: Gamepad | null) => {
  if (!gamepad) return 0;
  let actions = 0;
  if (gamepad.buttons[1]?.pressed) actions |= 1; // B: enter/exit
  if (gamepad.buttons[0]?.pressed) actions |= 2; // A: jump
  if (gamepad.buttons[2]?.pressed) actions |= 4; // X: previous weapon
  if (gamepad.buttons[3]?.pressed) actions |= 8; // Y: next weapon
  return actions;
};
const localPlayerIndexForKey = (code: string) => localSplitScreen && localPlayerKeyCodes[1]!.has(code) ? 1 : 0;
const keydown = (event: KeyboardEvent) => {
  if (event.code === 'Escape') {
    event.preventDefault();
    clearKeys();
    const open = !isGameMenuOpen();
    setGameMenuOpen(open);
    if (!multiplayerMode) {
      localPausedState = open;
      localPaused.hidden = true;
    }
    return;
  }
  const playerIndex = localPlayerIndexForKey(event.code);
  const player = localPlayerInputs[playerIndex]!;
  const playerKey = localPlayerKeyCodes[playerIndex]!.has(event.code);
  const bound = player.maskBindings[event.code] !== undefined;
  const cameraKey = cameraKeys.has(event.code) && (!localSplitScreen || playerIndex === 0);
  if (bound || cameraKey || playerKey) {
    event.preventDefault();
    if (!event.repeat && weaponKeyActions[event.code] === 'next') player.weaponPulses++;
    if (!event.repeat && weaponKeyActions[event.code] === 'previous') player.weaponPreviousPulses++;
    if (!event.repeat && event.code === (playerIndex === 0 ? 'KeyE' : 'KeyG')) player.vehiclePulses++;
    if (!event.repeat && event.code === (playerIndex === 0 ? 'KeyP' : 'KeyR')) player.jumpPulses++;
    player.keys.add(event.code);
  }
};
const keyup = (event: KeyboardEvent) => {
  const playerIndex = localPlayerIndexForKey(event.code);
  const player = localPlayerInputs[playerIndex]!;
  if (player.maskBindings[event.code] !== undefined || cameraKeys.has(event.code) || localPlayerKeyCodes[playerIndex]!.has(event.code)) {
    event.preventDefault(); player.keys.delete(event.code);
  }
};
const clearKeys = () => { for (const player of localPlayerInputs) clearPlayerInputState(player); };
const handleInputBlur = () => {
  // Releasing input focus must not pause the game. Clearing held keys avoids
  // a movement or action continuing while the user is interacting elsewhere.
  clearKeys();
};
const handleVisibilityChange = () => { if (document.hidden) handleInputBlur(); };
addEventListener('keydown', keydown); addEventListener('keyup', keyup); addEventListener('blur', handleInputBlur); addEventListener('visibilitychange', handleVisibilityChange);
openMenu.addEventListener('click', () => { if (!multiplayerMode) { localPausedState = true; localPaused.hidden = true; } });
const resumeFromMenu = () => { if (!multiplayerMode && isGameMenuOpen() === false) { localPausedState = false; localPaused.hidden = true; } };
menuResume.addEventListener('click', resumeFromMenu);
menuBackdrop.addEventListener('click', resumeFromMenu);
for (const menuAction of [ui.openLobby, ui.openScoreboard, ui.openChat, ui.openDebug]) menuAction.addEventListener('click', resumeFromMenu);
addEventListener('gamepadconnected', event => { if (!multiplayerMode) roomState.textContent = `LOCAL · ${event.gamepad.index === 0 ? 'P1' : 'P2'} controller connected`; });
addEventListener('gamepaddisconnected', event => { if (!multiplayerMode) roomState.textContent = `LOCAL · ${event.gamepad.index === 0 ? 'P1' : 'P2'} controller disconnected`; });
const primaryPlayerInput = localPlayerInputs[0]!;
for (const button of document.querySelectorAll<HTMLButtonElement>('#touch-controls button')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    const key = button.dataset['key']; if (key) primaryPlayerInput.keys.add(key);
    if (button.dataset['pulse'] === 'weapon') primaryPlayerInput.weaponPulses++;
    if (button.dataset['pulse'] === 'weapon-next') primaryPlayerInput.weaponPulses++;
    if (button.dataset['pulse'] === 'weapon-previous') primaryPlayerInput.weaponPreviousPulses++;
    if (button.dataset['pulse'] === 'vehicle') primaryPlayerInput.vehiclePulses++;
    if (button.dataset['pulse'] === 'jump') primaryPlayerInput.jumpPulses++;
  });
  const release = (event: PointerEvent) => { event.preventDefault(); const key = button.dataset['key']; if (key) primaryPlayerInput.keys.delete(key); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
async function boot() {
  const search = new URLSearchParams(location.search);
  const startup = parseStartupOptions(location.search);
  if (startup.clearSession) {
    localStorage.removeItem(DEBUG_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
  }
  localSplitScreen = startup.mode === 'split-screen';
  multiplayerMode = startup.mode === 'multiplayer';
  modeInput.value = multiplayerMode ? 'online' : localSplitScreen ? 'local' : 'singleplayer';
  const availableMaps = await fetchAvailableMultiplayerMaps();
  const fileMap = multiplayerMapForFiles(search.get('map'), search.get('style'));
  const availableMapById = new Map(availableMaps.map(map => [map.id, map] as const));
  const requestedMapId = search.get('mapId') ?? localStorage.getItem('gta2-map');
  const configuredMap = fileMap ?? availableMapById.get(requestedMapId ?? '') ?? availableMaps[0] ?? availableMapById.get(DEFAULT_MULTIPLAYER_MAP_ID) ?? multiplayerMapById(DEFAULT_MULTIPLAYER_MAP_ID)!;
  const fileMapId = fileMap && availableMapById.has(fileMap.id) ? fileMap.id : undefined;
  const queryMapId = search.get('mapId');
  let selectedMapId: string | undefined = fileMapId;
  if (selectedMapId === undefined && queryMapId !== null && availableMapById.has(queryMapId)) selectedMapId = queryMapId;
  if (selectedMapId === undefined && !search.has('map') && !search.has('style')) selectedMapId = configuredMap.id;
  setMapOptions(availableMaps, selectedMapId ?? configuredMap.id);
  const requestedMap = search.get('map') || configuredMap.map;
  const requestedStyle = search.get('style') || configuredMap.style;
  const activeMapId = selectedMapId && multiplayerMapById(selectedMapId) ? selectedMapId : undefined;
  const assets = await loadClientAssets(fetchAsset, { map: requestedMap, style: requestedStyle, carNames: 'nyc.gci', pickupScript: configuredMap.script });
  const level = assets.map.map, style = assets.style.style;
  setStatus('Building scene…');
  const renderer = new Renderer(level, style, startup.view ? { initialView: startup.view } : undefined), clock = new FixedClock(DEFAULT_STEP_SECONDS);
  const storedDebugSettings = readDebugSettings();
  let storedTab: DebugTab = 'graphs';
  if (storedDebugSettings.tab === 'player' || storedDebugSettings.tab === 'camera') storedTab = storedDebugSettings.tab;
  let storedCameraMode: 'follow' | 'detached' = startup.view ? 'detached' : 'follow';
  if (!startup.view && storedDebugSettings.cameraMode === 'detached') storedCameraMode = 'detached';
  if (typeof storedDebugSettings.pedestrianGraph === 'boolean') debugPedestrianGraph.checked = storedDebugSettings.pedestrianGraph;
  if (typeof storedDebugSettings.traffic === 'boolean') debugTraffic.checked = storedDebugSettings.traffic;
  if (typeof storedDebugSettings.car === 'boolean') debugCar.checked = storedDebugSettings.car;
  if (typeof storedDebugSettings.zones === 'boolean') debugZones.checked = storedDebugSettings.zones;
  if (typeof storedDebugSettings.policeAttack === 'boolean') debugPoliceAttack.checked = storedDebugSettings.policeAttack;
  if (typeof storedDebugSettings.vehicleDoors === 'boolean') debugVehicleDoors.checked = storedDebugSettings.vehicleDoors;
  if (typeof storedDebugSettings.closestDoor === 'boolean') debugClosestDoor.checked = storedDebugSettings.closestDoor;
  debugCameraMode.value = storedCameraMode;
  if (typeof storedDebugSettings.cameraSpeedZoom === 'boolean') debugCameraSpeedZoom.checked = storedDebugSettings.cameraSpeedZoom;
  if (typeof storedDebugSettings.cameraLookahead === 'boolean') debugCameraLookahead.checked = storedDebugSettings.cameraLookahead;
  if (typeof storedDebugSettings.spriteFrameInterpolation === 'boolean') debugSpriteFrameInterpolation.checked = storedDebugSettings.spriteFrameInterpolation;
  if (typeof storedDebugSettings.fpsCounter === 'boolean') debugFps.checked = storedDebugSettings.fpsCounter;
  if (typeof storedDebugSettings.showCoordinates === 'boolean') debugShowCoordinates.checked = storedDebugSettings.showCoordinates;
  if (typeof storedDebugSettings.showPlayerState === 'boolean') debugShowPlayerState.checked = storedDebugSettings.showPlayerState;
  let activeDebugTab: DebugTab = storedTab;
  const saveDebugSettings = () => {
    let cameraMode: 'follow' | 'detached' = 'follow';
    if (debugCameraMode.value === 'detached') cameraMode = 'detached';
    const settings: DebugSettings = {
      tab: activeDebugTab,
      pedestrianGraph: debugPedestrianGraph.checked,
      traffic: debugTraffic.checked,
      car: debugCar.checked,
      zones: debugZones.checked,
      policeAttack: debugPoliceAttack.checked,
      vehicleDoors: debugVehicleDoors.checked,
      closestDoor: debugClosestDoor.checked,
      cameraMode,
      cameraSpeedZoom: debugCameraSpeedZoom.checked,
      cameraLookahead: debugCameraLookahead.checked,
      spriteFrameInterpolation: debugSpriteFrameInterpolation.checked,
      fpsCounter: debugFps.checked,
      showCoordinates: debugShowCoordinates.checked,
      showPlayerState: debugShowPlayerState.checked,
    };
    try { localStorage.setItem(DEBUG_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage may be unavailable. */ }
  };
  const setDebugTab = (tab: DebugTab) => {
    activeDebugTab = tab;
    debugGraphs.hidden = tab !== 'graphs';
    debugPlayer.hidden = tab !== 'player';
    debugCamera.hidden = tab !== 'camera';
    for (const [button, selected] of [[debugTabGraphs, tab === 'graphs'], [debugTabPlayer, tab === 'player'], [debugTabCamera, tab === 'camera']] as const) {
      button.setAttribute('aria-selected', String(selected));
    }
    saveDebugSettings();
  };
  debugTabGraphs.onclick = () => setDebugTab('graphs');
  debugTabPlayer.onclick = () => setDebugTab('player');
  debugTabCamera.onclick = () => setDebugTab('camera');
  setDebugTab(storedTab);
  let cameraMode: 'follow' | 'detached' = 'follow';
  if (debugCameraMode.value === 'detached') cameraMode = 'detached';
  renderer.setCameraMode(cameraMode);
  renderer.setCameraSpeedZoom(debugCameraSpeedZoom.checked);
  renderer.setCameraLookahead(debugCameraLookahead.checked);
  renderer.setSpriteFrameInterpolation(debugSpriteFrameInterpolation.checked);
  const audio = new AudioBus();
  const gameSurface = document.querySelector<HTMLElement>('#game')!;
  const joystick = document.querySelector<HTMLElement>('#touch-joystick')!;
  const joystickKnob = document.querySelector<HTMLElement>('#touch-joystick-knob')!;
  let joystickPointerId: number | undefined;
  let touchPointerId: number | undefined;
  let touchOrigin: { x: number; y: number } | undefined;
  let touchDragged = false;
  const touchDirections: Array<{ x: number; y: number } | undefined> = [undefined, undefined];
  let touchVehicleIds: number[] = [];
  let touchPlayerIndex = 0;
  let touchPlayerId: string = localPlayerIds[0]!;
  const clearTouchDirection = () => { touchDirections[0] = undefined; touchDirections[1] = undefined; };
  const resetJoystick = () => {
    joystickPointerId = undefined;
    clearTouchDirection();
    joystickKnob.style.transform = 'translate(-50%, -50%)';
  };
  const updateJoystick = (x: number, y: number) => {
    const bounds = joystick.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2, centerY = bounds.top + bounds.height / 2;
    const maxDistance = Math.max(1, Math.min(bounds.width, bounds.height) * .29);
    const rawX = x - centerX, rawY = y - centerY;
    const distance = Math.hypot(rawX, rawY);
    let scale = 1;
    if (distance > maxDistance) scale = maxDistance / distance;
    const offsetX = rawX * scale, offsetY = rawY * scale;
    joystickKnob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    if (distance < 8) { clearTouchDirection(); return; }
    // Screen Y grows down while world Y grows up. Preserve the joystick's
    // analog magnitude so a light thumb movement produces a slower walk.
    touchDirections[0] = { x: offsetX / maxDistance, y: -offsetY / maxDistance };
  };
  const joystickStart = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || document.body.dataset['connection'] !== 'connected') return;
    event.preventDefault(); joystickPointerId = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event.clientX, event.clientY);
  };
  const joystickMove = (event: PointerEvent) => {
    if (event.pointerId !== joystickPointerId) return;
    event.preventDefault(); updateJoystick(event.clientX, event.clientY);
  };
  const joystickEnd = (event: PointerEvent) => {
    if (event.pointerId !== joystickPointerId) return;
    event.preventDefault(); resetJoystick();
  };
  const endTouch = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    event.preventDefault();
    clearTouchDirection();
    touchPointerId = undefined; touchOrigin = undefined; touchVehicleIds = [];
  };
  const touchStart = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !(event.target instanceof HTMLCanvasElement) || document.body.dataset['connection'] !== 'connected') return;
    event.preventDefault();
    touchPointerId = event.pointerId;
    touchOrigin = { x: event.clientX, y: event.clientY };
    touchDragged = false;
    clearTouchDirection();
    // A tap selects a vehicle; a swipe sends its direction directly as
    // walking/driving input, just like the joystick.
    touchVehicleIds = [];
    touchPlayerIndex = game && localSplitScreen && event.clientX >= innerWidth / 2 ? 1 : 0;
    touchPlayerId = localPlayerIds[touchPlayerIndex]!;
    if (game) touchVehicleIds = renderer.vehicleIdsAtScreen(event.clientX, event.clientY, game.gameState.vehicleStates, touchPlayerId);
    gameSurface.setPointerCapture(event.pointerId);
  };
  const touchMove = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    event.preventDefault();
    if (!touchOrigin) return;
    const dx = event.clientX - touchOrigin.x, dy = event.clientY - touchOrigin.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 18) { clearTouchDirection(); return; }
    touchDragged = true;
    const direction = { x: dx / distance, y: -dy / distance };
    touchDirections[touchPlayerIndex] = direction;
  };
  const touchEnd = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    // A short touch on a visible vehicle is the mobile equivalent of E.
    if (!touchDragged && game) {
      let vehicleIds = touchVehicleIds;
      if (!vehicleIds.length) vehicleIds = renderer.vehicleIdsAtScreen(event.clientX, event.clientY, game.gameState.vehicleStates, touchPlayerId);
      let localPlayer: PlayerState | undefined;
      if (id) localPlayer = game.gameState.playerStates.get(touchPlayerId);
      // A short mobile tap can produce a second pointer-up while the first
      // tap is still being applied by the authoritative entry transition.
      let enteredVehicle;
      if (localPlayer?.vehicleId !== undefined) enteredVehicle = game.gameState.vehicleStates.find(vehicle => vehicle.id === localPlayer.vehicleId);
      const enteredOccupant = enteredVehicle?.occupants.find(occupant => occupant.id === localPlayer?.id);
      const entering = enteredOccupant?.state === 'approaching' || enteredOccupant?.state === 'entering';
      if (!entering) {
        for (const vehicleId of vehicleIds) {
          // Repeat an explicit mobile target for a few fixed ticks. The
          // server's recent-entry guard makes an accepted request idempotent,
          // while a single lost/rejected packet no longer makes car entry feel
          // like a 50/50 interaction.
          queueVehicleEntryRequest(localPlayerInputs[touchPlayerIndex]!, vehicleId);
          break;
        }
      }
    }
    endTouch(event);
  };
  joystick.addEventListener('pointerdown', joystickStart);
  joystick.addEventListener('pointermove', joystickMove);
  joystick.addEventListener('pointerup', joystickEnd);
  joystick.addEventListener('pointercancel', joystickEnd);
  joystick.addEventListener('lostpointercapture', joystickEnd);
  gameSurface.addEventListener('pointerdown', touchStart);
  gameSurface.addEventListener('pointermove', touchMove);
  gameSurface.addEventListener('pointerup', touchEnd);
  gameSurface.addEventListener('pointercancel', endTouch);
  gameSurface.addEventListener('lostpointercapture', endTouch);
  addEventListener('blur', resetJoystick);
  let socket: WebSocket | undefined, game: Gta2Game | undefined;
  const carInfo = new Map<number, CarInfo>();
  for (const [model, car] of assets.cars.byModel) {
    if (car.info) carInfo.set(model, car.info);
  }
  const setDebugActionsEnabled = (enabled: boolean) => {
    debugResetWorld.disabled = !enabled;
    debugGiveAllWeapons.disabled = !enabled;
  };
  setDebugActionsEnabled(false);
  let id = '', frame = 0, disposed = false;
  let inputSequence = 0;
  let serverTick = 0;
  let inputAck = 0;
  let authoritative: ClientSnapshot | undefined;
  let match: MatchState | undefined;
  type ClientVehicleEntryTrace = { vehicleId: number; occupantState: string; door: number; x: number; y: number };
  const clientVehicleEntryTraces = new Map<string, ClientVehicleEntryTrace>();
  const chats: ChatMessage[] = [];
  const seenEvents = new Set<number>();
  const feedEntries: string[] = [];
  let fpsWindowStart: number | undefined;
  let fpsWindowFrames = 0;
  const updateFpsCounter = (now: number) => {
    if (!debugFps.checked) {
      fpsCounter.hidden = true;
      fpsWindowStart = undefined;
      fpsWindowFrames = 0;
      return;
    }
    fpsCounter.hidden = false;
    if (fpsWindowStart === undefined) {
      fpsWindowStart = now;
      fpsWindowFrames = 1;
      fpsCounter.textContent = 'FPS —';
      return;
    }
    fpsWindowFrames++;
    const elapsed = now - fpsWindowStart;
    if (elapsed < 500) return;
    fpsCounter.textContent = `FPS ${Math.round(fpsWindowFrames * 1000 / Math.max(1, elapsed))}`;
    fpsWindowStart = now;
    fpsWindowFrames = 0;
  };
  const setDebugVisible = (visible: boolean) => {
    renderer.setDebugVisible(visible);
    openDebug.textContent = 'Debug';
    if (visible) openDebug.textContent = 'Debug ✓';
  };
  const setDebugMenuOpen = (open: boolean) => {
    debugMenu.hidden = !open;
    openDebug.setAttribute('aria-expanded', String(open));
  };
  const setDebugGroups = () => {
    const groups = {
      pedestrianGraph: debugPedestrianGraph.checked,
      traffic: debugTraffic.checked,
      car: debugCar.checked,
      zones: debugZones.checked,
      vehicleDoors: debugVehicleDoors.checked,
      closestDoor: debugClosestDoor.checked,
    };
    renderer.setDebugGroups(groups);
    setDebugVisible(Object.values(groups).some(Boolean));
    saveDebugSettings();
  };
  for (const input of [debugPedestrianGraph, debugTraffic, debugCar, debugZones, debugVehicleDoors, debugClosestDoor]) input.addEventListener('change', setDebugGroups);
  const sendPoliceAttackSetting = () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'set-police-attack', enabled: debugPoliceAttack.checked }));
  };
  debugPoliceAttack.addEventListener('change', () => { saveDebugSettings(); sendPoliceAttackSetting(); });
  setDebugGroups();
  setDebugMenuOpen(false);
  debugCameraMode.addEventListener('change', () => {
    let mode: 'follow' | 'detached' = 'follow';
    if (debugCameraMode.value === 'detached') mode = 'detached';
    renderer.setCameraMode(mode); saveDebugSettings();
  });
  debugCameraSpeedZoom.addEventListener('change', () => { renderer.setCameraSpeedZoom(debugCameraSpeedZoom.checked); saveDebugSettings(); });
  debugCameraLookahead.addEventListener('change', () => { renderer.setCameraLookahead(debugCameraLookahead.checked); saveDebugSettings(); });
  debugSpriteFrameInterpolation.addEventListener('change', () => { renderer.setSpriteFrameInterpolation(debugSpriteFrameInterpolation.checked); saveDebugSettings(); });
  debugFps.addEventListener('change', saveDebugSettings);
  const updateCoordinateOverlayVisibility = () => { debugCoordinateOverlay.hidden = !debugShowCoordinates.checked; };
  debugShowCoordinates.addEventListener('change', () => { updateCoordinateOverlayVisibility(); saveDebugSettings(); });
  updateCoordinateOverlayVisibility();
  const updatePlayerStateOverlayVisibility = () => { debugPlayerStateOverlay.hidden = !debugShowPlayerState.checked; };
  debugShowPlayerState.addEventListener('change', () => { updatePlayerStateOverlayVisibility(); saveDebugSettings(); });
  updatePlayerStateOverlayVisibility();
  openDebug.onclick = () => {
    setDebugMenuOpen(debugMenu.hasAttribute('hidden'));
    setGameMenuOpen(false);
    // Opening debug from the paused game menu closes that menu. Keep the
    // single-player clock/input state in sync with the visible UI.
    resumeFromMenu();
  };
  closeDebug.onclick = () => setDebugMenuOpen(false);
  const showEvents = (events: ClientSnapshot['events'] | undefined) => {
    for (const event of events ?? []) {
      if (seenEvents.has(event.id)) continue; seenEvents.add(event.id);
      if (event.type === 'hit' && event.lethal) feedEntries.unshift(`${event.actor?.slice(0, 6) ?? 'Player'} wasted ${event.target.slice(0, 6)}`);
      else if (event.type === 'vehicle-enter') feedEntries.unshift(`${event.actor.slice(0, 6)} entered a vehicle`);
      if (event.type === 'shot') audio.playShot(event.weapon);
      else if (event.type === 'pickup') audio.play('pickup');
      else if (event.type === 'vehicle-enter') audio.play('enter');
      else if (event.type === 'explosion') audio.play('explosion');
      if (event.type === 'hit' && event.lethal) audio.play('wasted');
    }
    while (feedEntries.length > 5) feedEntries.pop(); feed.textContent = feedEntries.join('\n'); feed.hidden = feedEntries.length === 0;
  };
  const addChat = (entry: ChatMessage) => { chats.push(entry); while (chats.length > 40) chats.shift(); chatLog.textContent = chats.map(item => `${item.name}: ${item.text}`).join('\n'); chatLog.scrollTop = chatLog.scrollHeight; };
  function expandSnapshot(snapshot: ClientSnapshot) {
    if (snapshot.full || !authoritative) {
      authoritative = { ...snapshot, npcs: snapshot.npcs?.map(npc => ({ ...npc })) ?? [], players: snapshot.players.map(player => ({ ...player, combat: { ...player.combat, ammo: [...player.combat.ammo], shots: player.combat.shots.map(shot => ({ ...shot })) } })) };
      return authoritative;
    }
    const current = authoritative;
    if (!current) throw new Error('Missing authoritative snapshot');
    const players = new Map(current.players.map(player => [player.id, player]));
    const npcs = new Map((current.npcs ?? []).map(npc => [npc.id, npc]));
    for (const removed of snapshot.removedPlayers ?? []) players.delete(removed);
    for (const removed of snapshot.removedNpcs ?? []) npcs.delete(removed);
    for (const player of snapshot.players) players.set(player.id, player);
    for (const npc of snapshot.npcs ?? []) npcs.set(npc.id, npc);
    authoritative = { ...current, ...snapshot, npcs: [...npcs.values()], players: [...players.values()] };
    return authoritative;
  }
  const restoreAuthoritativeState = (snapshot: ClientSnapshot) => {
    if (!game) return;
    const playerIds = new Set(snapshot.players.map(player => player.id));
    for (const playerId of game.gameState.playerStates.keys()) if (!playerIds.has(playerId)) game.removePlayer(playerId);
    game.restoreWorld(snapshot.pickups?.map(fromClientPickup), snapshot.traffic?.map(fromClientTraffic), snapshot.hazards?.map(fromClientHazard), snapshot.npcs?.map(fromClientNpc));
    for (const player of snapshot.players) game.restore(fromClientPlayer(player));
  };
  const logVehicleEntry = (label: string, details: Record<string, unknown>) => {
    // Keep the payload in the message itself so browser log readers do not
    // collapse the second console argument to the unhelpful string "Object".
    console.info(`[vehicle-entry][client] ${label} ${JSON.stringify(details)}`);
  };
  const logClientVehicleEntry = (currentGame: Gta2Game, playerId: string) => {
    const previous = clientVehicleEntryTraces.get(playerId);
    const player = currentGame.gameState.playerStates.get(playerId);
    const vehicleId = player?.vehicleId;
    const vehicle = vehicleId === undefined
      ? undefined
      : currentGame.gameState.vehicleStates.find(item => item.id === vehicleId);
    const occupant = vehicle === undefined ? undefined : occupantForPlayer(vehicle, playerId);
    const vehicleObject = vehicle === undefined ? undefined : currentGame.gameObjects.findVehicle(vehicle.id);

    if (!player || !vehicle || !occupant || !vehicleObject) {
      if (previous) {
        logVehicleEntry('entry ended', {
          playerId,
          previous,
          playerVehicleId: vehicleId,
        });
      }
      clientVehicleEntryTraces.delete(playerId);
      return;
    }

    const point = vehicleDoorPoint(vehicle, occupant.door, vehicleObject.info, vehicleObject.bounds);
    const distance = Math.hypot(point.outsideX - player.x, point.outsideY - player.y);
    const sameEntry = previous?.vehicleId === vehicle.id && previous.door === occupant.door;
    const movement = sameEntry && previous
      ? { x: player.x - previous.x, y: player.y - previous.y }
      : undefined;
    const moved = movement !== undefined && Math.hypot(movement.x, movement.y) > 1e-6;
    const stateChanged = previous?.occupantState !== occupant.state;

    if (occupant.state === 'approaching') {
      logVehicleEntry('approaching door', {
        playerId,
        vehicleId: vehicle.id,
        seat: vehicle.passengers.indexOf(playerId),
        door: occupant.door,
        player: { x: player.x, y: player.y, z: player.z },
        target: { x: point.outsideX, y: point.outsideY, z: vehicle.z },
        distance,
        movement,
        movementStatus: movement === undefined ? 'first-observation' : moved ? 'moved' : 'not-moving',
        dt: DEFAULT_STEP_SECONDS,
        doorPhase: vehicle.doorStates[occupant.door]?.phase,
        vehicle: { x: vehicle.x, y: vehicle.y, vx: vehicle.vx, vy: vehicle.vy, rotation: vehicle.rotation },
      });
    } else if (stateChanged) {
      logVehicleEntry('state transition', {
        playerId,
        vehicleId: vehicle.id,
        from: previous?.occupantState,
        to: occupant.state,
        door: occupant.door,
        distance,
        progress: occupant.progress,
        doorPhase: vehicle.doorStates[occupant.door]?.phase,
      });
    }

    clientVehicleEntryTraces.set(playerId, {
      vehicleId: vehicle.id,
      occupantState: occupant.state,
      door: occupant.door,
      x: player.x,
      y: player.y,
    });
  };
  const coordinateText = (player: PlayerState) => `X ${player.x.toFixed(2)} · Y ${player.y.toFixed(2)} · Z ${player.z.toFixed(2)} · layer ${player.collisionLayer ?? '—'}`;
  const updateClientCoordinates = (player: PlayerState) => {
    const text = coordinateText(player);
    debugCoordinates.textContent = text;
    debugCoordinateOverlay.textContent = text;
  };
  const debugNumber = (value: number | undefined, digits = 2) =>
    value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : '—';
  const debugValue = (value: boolean | number | string | undefined) => value === undefined ? '—' : String(value);
  const playerStateDebugText = (player: PlayerState, currentGame: Gta2Game, label: string) => {
    const forward = directionFromRotation(player.rotation);
    const mapX = Math.round(player.x / WORLD.tileSize), mapY = Math.round(-player.y / WORLD.tileSize);
    const floor = currentGame.level.map[mapX]?.[mapY]?.[0];
    const lines = [
      `${label} PLAYER ${player.id}`,
      `pos      x ${debugNumber(player.x)} · y ${debugNumber(player.y)} · z ${debugNumber(player.z)} · layer ${debugValue(player.collisionLayer)}`,
      `forward  x ${debugNumber(forward.x)} · y ${debugNumber(forward.y)} · rotation ${debugNumber(player.rotation)} rad`,
      `velocity vx ${debugNumber(player.vx)} · vy ${debugNumber(player.vy)} · grounded ${debugValue(player.grounded)} · vertical ${debugNumber(player.verticalVelocity)}`,
      `state    animation ${player.animation?.kind ?? 'none'} · vehicle ${player.vehicleId ?? 'none'} · jump ${player.jump?.phase ?? 'none'}`,
      `combat   health ${Math.round(player.combat.health)} · armor ${Math.round(player.armor)} · weapon ${player.combat.weapon} · respawn ${player.combat.respawn}`,
      `surface  water ${currentGame.pedestrianNavigation.isWaterAt({ x: player.x, y: player.y, z: player.z })} · ground ${currentGame.pedestrianNavigation.groundTypeAt({ x: player.x, y: player.y, z: player.z })}`,
      `map      cell ${mapX},${mapY} · floor ${floor?.groundType ?? 'none'} · lid ${floor?.Lid.tileNumber ?? 'none'}`,
    ];
    if (player.movement) lines.push(`movement speed ${debugNumber(player.movement.speed)} · turn ${debugNumber(player.movement.turnSpeed)} · direction ${player.movement.moveDirection}`);
    if (player.drowningTimer !== undefined || player.combat.onFire) {
      lines.push(`status   drowning ${debugValue(player.drowningTimer)} · onFire ${player.combat.onFire} · fireTimer ${player.combat.fireTimer}`);
    }
    if (player.jump) lines.push(`jump     phase ${player.jump.phase} · progress ${debugNumber(player.jump.progress)} · height ${debugNumber(player.jump.height)} · carry ${debugNumber(player.jump.vx)}, ${debugNumber(player.jump.vy)}`);

    if (player.vehicleId !== undefined) {
      const vehicle = currentGame.gameState.vehicleStates.find(item => item.id === player.vehicleId);
      const occupant = vehicle ? occupantForPlayer(vehicle, player.id) : undefined;
      if (!vehicle) {
        lines.push('', 'CAR      missing from current game state');
      } else {
        const passengerIndex = vehicle.passengers.indexOf(player.id);
        const occupants = vehicle.occupants.length
          ? vehicle.occupants.map(item => `${item.id}:${item.state}@${item.progress.toFixed(2)}`).join(', ')
          : 'none';
        lines.push(
          '',
          `CAR ${vehicle.id} · model ${debugValue(vehicle.model)} · seat ${passengerIndex < 0 ? '—' : passengerIndex === 0 ? 'driver' : `passenger ${passengerIndex}`}`,
          `pos      x ${debugNumber(vehicle.x)} · y ${debugNumber(vehicle.y)} · z ${debugNumber(vehicle.z)} · layer ${debugValue(vehicle.collisionLayer)}`,
          `heading  rotation ${debugNumber(vehicle.rotation)} rad · angular ${debugNumber(vehicle.angularVelocity)} · speed ${debugNumber(vehicle.speed)}`,
          `velocity vx ${debugNumber(vehicle.vx)} · vy ${debugNumber(vehicle.vy)} · grounded ${debugValue(vehicle.grounded)} · vertical ${debugNumber(vehicle.verticalVelocity)}`,
          `input    throttle ${debugNumber(vehicle.throttle)} · brake ${debugNumber(vehicle.brakePressure)} · handbrake ${debugNumber(vehicle.handbrakeForce)}`,
          `damage   health ${Math.round(vehicle.health)} · raw ${debugValue(vehicle.damage)} · level ${debugValue(vehicle.damageLevel)} · phase ${vehicle.damagePhase ?? 'new'}`,
          `ai       state ${vehicle.aiState ?? 'none'} · route ${debugValue(vehicle.routeNode)} → target ${debugValue(vehicle.targetNode)} · junction ${debugValue(vehicle.junction)} · signal ${vehicle.signal ?? 'none'}`,
          `lights   brake ${vehicle.brakeLights ?? false} · head ${vehicle.headlights ?? false} · emergency ${vehicle.emergencyLights ?? false} · horn ${vehicle.horn ?? false}`,
          `doors    mask ${debugValue(vehicle.doors)} · lock ${vehicle.doorLock ?? '—'} · occupant ${occupant?.state ?? 'not-listed'} · all ${occupants}`,
        );
        if (vehicle.transport || vehicle.serviceStop !== undefined || vehicle.pursuitTarget) {
          lines.push(`service  ${vehicle.transport ?? 'none'} · stop ${debugValue(vehicle.serviceStop)} · pursuit ${vehicle.pursuitTarget ?? 'none'}`);
        }
        if (vehicle.fireTicks !== undefined || vehicle.collisionCooldown !== undefined || vehicle.wreckTimer !== undefined) {
          lines.push(`timers   fire ${debugValue(vehicle.fireTicks)} · collision ${debugValue(vehicle.collisionCooldown)} · wreck ${debugValue(vehicle.wreckTimer)}`);
        }
      }
    }
    return lines.join('\n');
  };
  const updatePlayerStateOverlay = (currentGame: Gta2Game, states: readonly PlayerState[]) => {
    if (!debugShowPlayerState.checked) {
      debugPlayerStateOverlay.hidden = true;
      return;
    }
    const ids = localSplitScreen ? localPlayerIds.slice(0, 2) : [id];
    const players = ids
      .map(playerId => currentGame.gameState.playerStates.get(playerId) ?? states.find(state => state.id === playerId))
      .filter((player): player is PlayerState => Boolean(player));
    debugPlayerStateOverlay.textContent = players.length
      ? players.map((player, index) => playerStateDebugText(player, currentGame, localSplitScreen ? `P${index + 1}` : 'LOCAL')).join('\n\n')
      : 'No local player state';
    debugPlayerStateOverlay.hidden = false;
  };
  function disconnected(reason: string) {
    if (!multiplayerMode) return;
    playerHuds[1]!.root.hidden = true;
    game = undefined; clock.reset(); clearKeys(); clearTouchDirection();
    debugPlayerStateOverlay.hidden = true;
    setDebugActionsEnabled(false);
    readyButton.disabled = true;
    status.hidden = false; setStatus(reason, 'error'); reconnect.hidden = false;
    document.body.dataset['connection'] = 'disconnected';
  }
  const handleOffline = () => {
    if (disposed || document.body.dataset['connection'] === 'disconnected') return;
    socket?.close();
    disconnected('Offline. Reconnect when your connection returns.');
  };
  addEventListener('offline', handleOffline);
  function connect() {
    clearKeys();
    clientVehicleEntryTraces.clear();
    if (multiplayerMode && socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    game = undefined; authoritative = undefined; inputSequence = 0; serverTick = 0; inputAck = 0; seenEvents.clear(); feedEntries.splice(0); feed.hidden = true; clock.reset();
    setDebugActionsEnabled(false);
    reconnect.hidden = true; status.hidden = false; setStatus('Connecting…');
    if (!multiplayerMode) {
      id = localPlayerIds[0]!;
      localPausedState = false; localPaused.hidden = true;
      const currentGame = new Gta2Game(level, undefined, assets.pickups.map(pickup => ({ ...pickup })), assets.cars.physics, assets.cars.recyclingModels, assets.cars.bounds, carInfo, assets.style.style.mapObjects);
      game = currentGame;
      const localPlayers = localPlayerIds.slice(0, localSplitScreen ? 2 : 1).map((playerId, index) => {
        const player = currentGame.addPlayer(playerId);
        player.name = `Player ${index + 1}`;
        player.color = [0x65a9e8, 0xf0a35b][index]!;
        return player;
      });
      if (localSplitScreen) {
        const secondaryPlayer = localPlayers[1]!;
        // The source spawn zone is shared by all players. Give the second local
        // player a nearby deterministic starting point so both cameras have a
        // useful subject immediately.
        secondaryPlayer.x += 48; secondaryPlayer.y += 48;
        currentGame.restore(secondaryPlayer);
      }
      match = { room: 'LOCAL', status: 'playing', maxPlayers: localSplitScreen ? 2 : 1, elapsed: 0, ready: localSplitScreen ? 2 : 1 };
      renderer.setSplitScreen(localSplitScreen);
      playerHuds[0]!.root.hidden = false; playerHuds[1]!.root.hidden = !localSplitScreen;
      readyButton.disabled = true;
      localReset.hidden = false; localLeave.hidden = !localSplitScreen;
      setDebugActionsEnabled(true);
      roomState.textContent = localSplitScreen ? 'LOCAL SPLIT-SCREEN' : 'SINGLE PLAYER';
      status.hidden = true;
      document.body.dataset['connection'] = 'connected';
      setLobbyOpen(false);
      clock.reset();
      return;
    }
    const requestedName = nameInput.value.trim();
    const params = new URLSearchParams({ room: roomInput.value.trim() || 'main', team: teamInput.value, session: getPlayerSessionId() });
    if (activeMapId) params.set('mapId', activeMapId);
    if (requestedName) params.set('name', requestedName);
    if (requestedName) localStorage.setItem('gta2-name', requestedName); else localStorage.removeItem('gta2-name');
    localStorage.setItem('gta2-room', roomInput.value.trim() || 'main');
    let websocketProtocol = 'ws:';
    if (location.protocol === 'https:') websocketProtocol = 'wss:';
    const connection = new WebSocket(`${websocketProtocol}//${location.host}/ws?${params}`);
    socket = connection;
    connection.onmessage = event => {
      if (socket !== connection) return;
      try {
        const data = parseServerMessage(JSON.parse(event.data));
        if (data.type === 'chat') { addChat(data.message); return; }
        if (data.type === 'welcome') {
          id = data.id; match = data.room; roomState.textContent = `${data.room.room} · ${data.room.status}`; data.chat?.forEach(addChat); game = new Gta2Game(level, id, assets.pickups.map(pickup => ({ ...pickup })), assets.cars.physics, [], assets.cars.bounds, carInfo, assets.style.style.mapObjects);
          renderer.setSplitScreen(false);
          playerHuds[1]!.root.hidden = true;
          readyButton.disabled = false;
          localReset.hidden = true; localLeave.hidden = true;
          readyButton.textContent = 'Ready';
          if (data.players.find(player => player.id === id)?.ready) readyButton.textContent = 'Unready';
          for (const state of data.players) game.addPlayer(state.id, fromClientPlayer(state));
          game.restoreWorld(data.pickups?.map(fromClientPickup), data.traffic?.map(fromClientTraffic), data.hazards?.map(fromClientHazard), data.npcs?.map(fromClientNpc));
          setDebugActionsEnabled(true);
          sendPoliceAttackSetting();
          serverTick = data.tick;
          inputAck = data.inputAck ?? 0;
          authoritative = { type: 'snapshot', tick: data.tick, inputAck, full: true, players: data.players, pickups: data.pickups, traffic: data.traffic, npcs: data.npcs, hazards: data.hazards, events: data.events, match };
          status.hidden = true; status.dataset['state'] = 'loading'; document.body.dataset['connection'] = 'connected'; setLobbyOpen(false); clock.reset();
        } else if (data.type === 'snapshot' && game) {
          if (data.tick <= serverTick) return;
          const expanded = expandSnapshot(data);
          showEvents(expanded.events);
          match = expanded.match ?? match; if (match) roomState.textContent = `${match.room} · ${match.status} · ${match.ready} ready`;
          expanded.chat?.forEach(entry => { if (!chats.some(existing => existing.id === entry.id && existing.sender === entry.sender)) addChat(entry); });
          restoreAuthoritativeState(expanded);
          logClientVehicleEntry(game, id);
          setDebugActionsEnabled(true);
          serverTick = expanded.tick;
          if (data.inputAck !== undefined) inputAck = data.inputAck;
          document.body.dataset['tick'] = String(data.tick);
        }
      } catch (error) { console.error(error); connection.close(4002, 'Protocol error'); disconnected((error as Error).message); }
    };
    connection.onclose = () => { if (socket === connection && !disposed && document.body.dataset['connection'] !== 'disconnected') disconnected('Disconnected. Reconnect to join the game.'); };
    connection.onerror = () => { setStatus('Connection failed.', 'error'); };
  }
  const mapNeedsReload = () => {
    const selected = multiplayerMapById(mapInput.value);
    return Boolean(selected && selected.id !== activeMapId);
  };
  const restartSelectedMode = () => {
    localSplitScreen = modeInput.value === 'local';
    multiplayerMode = modeInput.value === 'online';
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      const previous = socket; socket = undefined; previous.close();
    }
    connect();
  };
  const reloadForSelectedMap = () => {
    const selected = multiplayerMapById(mapInput.value);
    if (!selected || selected.id === activeMapId) return false;
    localStorage.setItem('gta2-map', selected.id);
    const target = new URL(location.href);
    target.searchParams.set('mapId', selected.id);
    target.searchParams.delete('map');
    target.searchParams.delete('style');
    location.assign(target.href);
    return true;
  };
  const updateMapActionLabel = () => { join.textContent = mapNeedsReload() ? 'Load selected map' : 'Apply & reconnect'; };
  mapInput.addEventListener('change', () => { localStorage.setItem('gta2-map', mapInput.value); updateMapActionLabel(); });
  updateMapActionLabel();
  join.onclick = () => {
    if (reloadForSelectedMap()) return;
    restartSelectedMode();
  };
  modeInput.addEventListener('change', restartSelectedMode);
  localReset.onclick = () => { if (!multiplayerMode) restartSelectedMode(); };
  localLeave.onclick = () => {
    if (!localSplitScreen) return;
    localSplitScreen = false; multiplayerMode = false; modeInput.value = 'singleplayer'; game = undefined; renderer.setSplitScreen(false);
    playerHuds[1]!.root.hidden = true; localReset.hidden = true; localLeave.hidden = true; localPaused.hidden = true;
    document.body.dataset['connection'] = 'disconnected'; setLobbyOpen(true); roomState.textContent = 'LOCAL MATCH ENDED';
  };
  localResume.onclick = () => { if (multiplayerMode) return; localPausedState = false; localPaused.hidden = true; clock.reset(); };
  localPauseLeave.onclick = () => localLeave.click();
  readyButton.onclick = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const next = readyButton.textContent !== 'Unready';
    socket.send(JSON.stringify({ type: 'ready', ready: next }));
    readyButton.textContent = 'Ready';
    if (next) readyButton.textContent = 'Unready';
  };
  debugResetWorld.onclick = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    seenEvents.clear(); feedEntries.splice(0); feed.hidden = true;
    debugResetWorld.disabled = true;
    socket.send(JSON.stringify({ type: 'reset-world' }));
  };
  debugGiveAllWeapons.onclick = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'give-all-weapons' }));
      return;
    }
    // Local and split-screen games have no websocket. Keep the debug action
    // useful there by applying it to the first local player directly.
    if (!multiplayerMode) game?.playerSystem.loadout.giveAllWeapons(game.gameState.playerStates.get(localPlayerIds[0]!));
  };
  chatInput.addEventListener('keydown', event => { if (event.key === 'Enter' && chatInput.value.trim() && socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'chat', text: chatInput.value })); chatInput.value = ''; } });
  reconnect.onclick = () => { if (!reloadForSelectedMap()) connect(); };
  const updateHud = (player: PlayerState, elements: {
    weaponName: HTMLElement; ammo: HTMLElement; hearts: HTMLElement; armor: HTMLElement; wanted: HTMLElement; money: HTMLElement; score: HTMLElement; vehicle: HTMLElement; vehicleValue: HTMLElement; status: HTMLElement; weaponIcon: HTMLCanvasElement;
  }) => {
    const combat = player.combat;
    const weapon = combat.weapon >= 0 ? WEAPONS[combat.weapon] : undefined;
    const wanted = Math.max(0, Math.min(5, player.wanted));
    const healthyHearts = Math.max(0, Math.min(5, Math.ceil(Math.max(0, combat.health) / 20)));
    elements.weaponName.textContent = weapon?.name.toUpperCase() ?? 'NO WEAPON';
    elements.ammo.textContent = weapon ? `AMMO ${combat.ammo[combat.weapon] ?? 0}` : 'AMMO —';
    elements.hearts.textContent = `${'♥'.repeat(healthyHearts)}${'♡'.repeat(5 - healthyHearts)}`;
    elements.hearts.setAttribute('aria-label', `Health ${Math.max(0, Math.round(combat.health))} percent`);
    elements.armor.textContent = String(Math.max(0, Math.round(player.armor))).padStart(3, '0');
    elements.wanted.textContent = `${'★'.repeat(wanted)}${'☆'.repeat(5 - wanted)}`;
    elements.money.textContent = `$${Math.max(0, Math.round(player.money)).toString().padStart(6, '0')}`;
    elements.score.textContent = Math.max(0, Math.round(player.score)).toString().padStart(6, '0');
    const drivenVehicle = player.vehicleId === undefined ? undefined : game?.gameState.vehicleStates.find(vehicle => vehicle.id === player.vehicleId);
    elements.vehicle.hidden = !drivenVehicle;
    if (drivenVehicle) elements.vehicleValue.textContent = `${Math.max(0, Math.round(drivenVehicle.health))}%`;
    elements.status.textContent = combat.respawn ? `WASTED · ${Math.ceil(combat.respawn / 30)}s` : '';
    elements.status.hidden = !combat.respawn;
    drawHudWeaponIcon(style, combat.weapon, elements.weaponIcon);
  };
  function animate(now: number) {
    if (disposed) return;
    updateFpsCounter(now);
    try {
      const cameraDetached = debugCameraMode.value === 'detached';
      renderer.setCameraInput({
        north: cameraDetached && localPlayerInputs[0]!.keys.has('KeyW'),
        south: cameraDetached && localPlayerInputs[0]!.keys.has('KeyS'),
        west: cameraDetached && localPlayerInputs[0]!.keys.has('KeyA'),
        east: cameraDetached && localPlayerInputs[0]!.keys.has('KeyD'),
        zoomIn: localPlayerInputs[0]!.keys.has('PageUp'),
        zoomOut: localPlayerInputs[0]!.keys.has('PageDown'),
      });
      renderer.setCameraInput({
        north: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyI'),
        south: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyK'),
        west: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyJ'),
        east: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyL'),
        zoomIn: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyU'),
        zoomOut: localSplitScreen && localPlayerInputs[1]!.keys.has('KeyO'),
      }, 2);
      if (localPausedState) clock.reset();
      else clock.advance(now / 1000, () => {
        if (!game || localPausedState || (multiplayerMode && socket?.readyState !== WebSocket.OPEN)) return;
        const primaryGamepad = !multiplayerMode ? gamepadFor(0) : null;
        const primaryInput = buildPlayerInput(localPlayerInputs[0]!, {
          gamepadMask: !multiplayerMode ? gamepadMask(primaryGamepad) : 0,
          gamepadActions: !multiplayerMode ? gamepadActions(primaryGamepad) : 0,
          controlTransitions,
        });
        const primaryDirection = touchDirections[0];
        if (primaryDirection !== undefined) {
          primaryInput.moveX = primaryDirection.x;
          primaryInput.moveY = primaryDirection.y;
        }
        if (!multiplayerMode) {
          const tick = game.tick;
          const inputs: Array<[string, Input]> = [[localPlayerIds[0]!, { ...primaryInput, seq: ++inputSequence, clientTick: tick }]];
          if (localSplitScreen) {
            const secondaryGamepad = gamepadFor(1);
            const secondaryInput = buildPlayerInput(localPlayerInputs[1]!, {
              gamepadMask: gamepadMask(secondaryGamepad),
              gamepadActions: gamepadActions(secondaryGamepad),
              controlTransitions,
            });
            const secondaryDirection = touchDirections[1];
            if (secondaryDirection !== undefined) {
              secondaryInput.moveX = secondaryDirection.x;
              secondaryInput.moveY = secondaryDirection.y;
            }
            inputs.push([localPlayerIds[1]!, { ...secondaryInput, seq: ++inputSequence, clientTick: tick }]);
          }
          game.step(new Map(inputs));
          for (const playerId of localPlayerIds.slice(0, localSplitScreen ? 2 : 1)) logClientVehicleEntry(game, playerId);
          return;
        }
        const input = { ...primaryInput, seq: ++inputSequence, clientTick: serverTick } satisfies Input;
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', input }));
      });
      if (game) {
        const currentGame = game;
        const states = currentGame.snapshot();
        const local = currentGame.gameState.playerStates.get(id)!;
        updateClientCoordinates(local);
        updatePlayerStateOverlay(currentGame, states);
        const world = authoritative;
        const pickups = world?.pickups ?? currentGame.gameState.pickupStates;
        renderer.render({ now, localId: id, paused: !multiplayerMode && localPausedState, ...(localSplitScreen ? { localIds: localPlayerIds } : {}), players: states, pickups, traffic: currentGame.gameState.vehicleStates, hazards: world?.hazards ?? currentGame.gameState.hazardStates, objects: currentGame.gameObjects.values() });
        document.body.dataset['players'] = String(states.length);
        const rows = states.slice().sort((a, b) => b.score - a.score).map(state => `<tr><td>${state.name.replace(/[&<>]/g, '')}</td><td>${state.score}</td><td>${state.kills}/${state.deaths}</td></tr>`).join('');
        scoreboard.innerHTML = `<strong>Scoreboard</strong><table><tbody>${rows}</tbody></table>`;
        const combat = local.combat;
        const weapon = combat.weapon >= 0 ? WEAPONS[combat.weapon] : undefined;
        const hudPlayers = localSplitScreen
          ? localPlayerIds.map(playerId => currentGame.gameState.playerStates.get(playerId))
          : [local];
        for (const [index, player] of hudPlayers.entries()) if (player) updateHud(player, playerHuds[index]!);
        const activePickups = pickups.filter(pickup => pickup.active);
        const nearest = activePickups.sort((a, b) => Math.hypot(a.x - local.x, a.y - local.y) - Math.hypot(b.x - local.x, b.y - local.y))[0];
        if (!combat.respawn && weapon && combat.ammo[combat.weapon] === 0) {
          if (nearest) {
            const pickupWeapon = WEAPONS[nearest.weapon];
            const pickupName = pickupWeapon?.name ?? 'Weapon';
            weaponHint.textContent = `No ${weapon.name} ammo · ${pickupName} pickup ${Math.round(Math.hypot(nearest.x - local.x, nearest.y - local.y) / WORLD.tileSize)} blocks away`;
          } else {
            weaponHint.textContent = `No ${weapon.name} ammo · find a marked pickup`;
          }
          weaponHint.hidden = false;
        } else weaponHint.hidden = true;
        document.body.dataset['position'] = JSON.stringify({ x: local.x, y: local.y });
      }
    } catch (error) { console.error(error); socket?.close(); disconnected((error as Error).message); }
    frame = requestAnimationFrame(animate);
  }
  connect(); frame = requestAnimationFrame(animate);
  const dispose = () => {
    disposed = true; cancelAnimationFrame(frame); resetJoystick();
    joystick.removeEventListener('pointerdown', joystickStart); joystick.removeEventListener('pointermove', joystickMove); joystick.removeEventListener('pointerup', joystickEnd); joystick.removeEventListener('pointercancel', joystickEnd); joystick.removeEventListener('lostpointercapture', joystickEnd);
    gameSurface.removeEventListener('pointerdown', touchStart); gameSurface.removeEventListener('pointermove', touchMove); gameSurface.removeEventListener('pointerup', touchEnd); gameSurface.removeEventListener('pointercancel', endTouch); gameSurface.removeEventListener('lostpointercapture', endTouch);
    if (socket?.readyState === WebSocket.OPEN) socket.close(); renderer.dispose(); audio.dispose();
    removeEventListener('offline', handleOffline); removeEventListener('keydown', keydown); removeEventListener('keyup', keyup); removeEventListener('blur', handleInputBlur); removeEventListener('blur', resetJoystick); removeEventListener('visibilitychange', handleVisibilityChange);
  };
  addEventListener('pagehide', dispose, { once: true });
}
boot().catch(error => { status.hidden = false; setStatus(error.message, 'error'); document.body.dataset['connection'] = 'error'; });
