import { loadClientBootstrap } from './client-bootstrap';
import { Gta2Game } from '../../shared/game/gta2-game';
import { FixedClock } from '../../shared/engine/fixed-clock';
import { DEFAULT_STEP_SECONDS } from '../../shared/protocol/constants';
import type { ChatMessage, MatchState } from '../../shared/protocol/types';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';
import { Renderer } from '../rendering/renderer';
import { AudioBus, SOURCE_AUDIO_PAN_HALF_WIDTH, SOURCE_EVENT_AUDIO_MAX_DISTANCE, SOURCE_WEAPON_AUDIO_MAX_DISTANCE } from './audio';
import type { AudioPosition, AudioSpatialization } from './audio-spatial';

import { createPlayerHud, getSelectedLocalMode, isMenuOpen, setDebugMenuOpen, setLobbyOpen, setLocalMapOptions, setMapOptions, setMultiplayerMenuMode, setStatus, ui } from './main-ui';
import { multiplayerMapById } from '../../shared/engine/loader/multiplayer-maps';
import type { CarInfo } from '../../shared/engine/loader/style-parser';
import { createPlayerInputState } from './player-input';
import { DEBUG_SETTINGS_STORAGE_KEY, PLAYER_SESSION_STORAGE_KEY, readDebugSettings, type DebugSettings } from './debug-settings';
import { localPlayerIds, localPlayerMaskBindings } from './input-bindings';
import { installInputController } from './input-controller';
import { installTouchControls } from './touch-controls';
import { restoreClientSnapshot } from './client-snapshot';
import { createVehicleEntryTracer } from './vehicle-entry-tracer';
import { createPlayerDebugOverlay } from './player-debug-overlay';
import { createLocalSession } from './local-session';
import { createGameLoop } from './game-loop';
import { connectMultiplayer } from './game-client-network';
import { createGameFrame } from './game-client-frame';
import { updateMapTileDebugOverlay } from './tile-debug-overlay';
import { populateMapLevelSelect, selectedMapLevels, setSelectedMapLevels } from './map-level-select';


  const { reconnect, status, openMenu, menuResume, menuBackdrop, openDebug, closeDebug, debugGiveAllWeapons, debugPedestrianGraph, debugTraffic, debugCar, debugZones, debugPoliceAttack, debugVehicleDoors, debugClosestDoor, debugShowPlayerState, debugPlayerStateOverlay, debugMapTileOverlay, debugTilePicker, debugMapLevels, debugResetWorld, debugCameraMode, debugCameraSpeedZoom, debugCameraLookahead, debugSpriteFrameInterpolation, debugFps, nameInput, roomInput, teamInput, mapInput, modeInput, join, readyButton, localReset, localLeave, roomState, scoreboard, feed, chatLog, chatInput, fpsCounter, weaponHint, localPaused, localResume, localPauseLeave } = ui;

const localPlayerInputs = localPlayerIds.map((id, index) => createPlayerInputState(id, localPlayerMaskBindings[index]!));
const playerHuds = localPlayerIds.map((id, index) => createPlayerHud(id, `PLAYER ${index + 1}`));
const setMultiplayerMenuActionsEnabled = (enabled: boolean) => {
  ui.openScoreboard.disabled = !enabled;
  ui.openChat.disabled = !enabled;
};
let localSplitScreen = false;
let multiplayerMode = false;
let localPausedState = false;
let tiltCamera: (direction: -1 | 1) => void = () => {};
openMenu.addEventListener('click', () => { if (!multiplayerMode) { localPausedState = true; localPaused.hidden = true; } });
const resumeFromMenu = () => { if (!multiplayerMode && isMenuOpen() === false) { localPausedState = false; localPaused.hidden = true; } };
menuResume.addEventListener('click', resumeFromMenu);
menuBackdrop.addEventListener('click', resumeFromMenu);
for (const menuAction of [ui.openLobby, ui.openScoreboard, ui.openChat, ui.openDebug]) menuAction.addEventListener('click', resumeFromMenu);
const inputController = installInputController({
  players: localPlayerInputs,
  getLocalSplitScreen: () => localSplitScreen,
  getMultiplayerMode: () => multiplayerMode,
  getCameraDetached: () => debugCameraMode.value === 'detached',
  onCameraTilt: direction => tiltCamera(direction),
  onPauseChanged: paused => { localPausedState = paused; localPaused.hidden = true; },
  roomState,
});
const clearKeys = inputController.clear;
async function boot() {
  const bootstrap = await loadClientBootstrap();
  const { startup, availableMaps, activeMapId, assets } = bootstrap;
  const staticBuild = import.meta.env['VITE_STATIC_BUILD'] === 'true';
  if (staticBuild) {
    ui.openLobby.disabled = true;
    ui.openLobby.title = 'Multiplayer requires the Node server';
    const onlineOption = modeInput.querySelector<HTMLOptionElement>('option[value="online"]');
    if (onlineOption) onlineOption.disabled = true;
  }
  debugSpriteFrameInterpolation.checked = true;
  if (startup.clearSession) {
    localStorage.removeItem(DEBUG_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
  }
  localSplitScreen = startup.mode === 'split-screen';
  multiplayerMode = !staticBuild && startup.mode === 'multiplayer';
  setMultiplayerMenuActionsEnabled(multiplayerMode);
  modeInput.value = multiplayerMode ? 'online' : localSplitScreen ? 'local' : 'singleplayer';
  setMultiplayerMenuMode(multiplayerMode);
  setMapOptions(availableMaps, bootstrap.selectedMapId ?? activeMapId ?? '');
  setLocalMapOptions(availableMaps, bootstrap.selectedMapId ?? activeMapId ?? '');
  const level = assets.map.map, style = assets.style.style;
  setStatus('Building scene…');
  populateMapLevelSelect(debugMapLevels);
  const renderer = new Renderer(level, style, {
    ...(startup.view ? { initialView: startup.view } : {}),
    onTileSelected: selection => updateMapTileDebugOverlay(debugMapTileOverlay, selection),
  }), clock = new FixedClock(DEFAULT_STEP_SECONDS);
  tiltCamera = direction => renderer.rotateCameraX(direction);
  const storedDebugSettings = readDebugSettings();
  if (Array.isArray(storedDebugSettings.mapLevels)) setSelectedMapLevels(debugMapLevels, storedDebugSettings.mapLevels);
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
  if (typeof storedDebugSettings.showPlayerState === 'boolean') debugShowPlayerState.checked = storedDebugSettings.showPlayerState;
  if (typeof storedDebugSettings.tilePicker === 'boolean') debugTilePicker.checked = storedDebugSettings.tilePicker;
  const saveDebugSettings = () => {
    let cameraMode: 'follow' | 'detached' = 'follow';
    if (debugCameraMode.value === 'detached') cameraMode = 'detached';
    const settings: DebugSettings = {
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
      showPlayerState: debugShowPlayerState.checked,
      tilePicker: debugTilePicker.checked,
      mapLevels: selectedMapLevels(debugMapLevels),
    };
    try { localStorage.setItem(DEBUG_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage may be unavailable. */ }
  };
  let cameraMode: 'follow' | 'detached' = 'follow';
  if (debugCameraMode.value === 'detached') cameraMode = 'detached';
  renderer.setCameraMode(cameraMode);
  renderer.setCameraSpeedZoom(debugCameraSpeedZoom.checked);
  renderer.setCameraLookahead(debugCameraLookahead.checked);
  renderer.setSpriteFrameInterpolation(debugSpriteFrameInterpolation.checked);
  const audio = new AudioBus();
  const gameSurface = document.querySelector<HTMLElement>('#game')!;
  const playerDebugOverlay = createPlayerDebugOverlay({
    stateOverlay: debugPlayerStateOverlay,
  }, {
    getLocalId: () => id,
    getSplitScreen: () => localSplitScreen,
    getEnabled: () => debugShowPlayerState.checked,
    getRenderOrder: vehicleId => renderer.getVehicleRenderOrder(vehicleId),
  });
  let socket: WebSocket | undefined, game: Gta2Game | undefined;
  const touchControls = installTouchControls({
    renderer,
    gameSurface,
    joystick: document.querySelector<HTMLElement>('#touch-joystick')!,
    joystickKnob: document.querySelector<HTMLElement>('#touch-joystick-knob')!,
    players: localPlayerInputs,
    getGame: () => game,
    getSplitScreen: () => localSplitScreen,
    isConnected: () => document.body.dataset['connection'] === 'connected',
  });
  const carInfo = new Map<number, CarInfo>();
  for (const [model, car] of assets.cars.byModel) {
    if (car.info) carInfo.set(model, car.info);
  }
  const setDebugActionsEnabled = (enabled: boolean) => {
    debugResetWorld.disabled = !enabled;
    debugGiveAllWeapons.disabled = !enabled;
  };
  setDebugActionsEnabled(false);
  let id = '', disposed = false;
  let inputSequence = 0;
  let serverTick = 0;
  let authoritative: ClientSnapshot | undefined;
  let match: MatchState | undefined;
  const vehicleEntryTracer = createVehicleEntryTracer();
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
  const updatePlayerStateOverlayVisibility = () => { debugPlayerStateOverlay.hidden = !debugShowPlayerState.checked; };
  debugShowPlayerState.addEventListener('change', () => { updatePlayerStateOverlayVisibility(); saveDebugSettings(); });
  renderer.setTilePickerEnabled(debugTilePicker.checked);
  debugTilePicker.addEventListener('change', () => { renderer.setTilePickerEnabled(debugTilePicker.checked); saveDebugSettings(); });
  renderer.setMapLevelsEnabled(selectedMapLevels(debugMapLevels));
  debugMapLevels.addEventListener('change', () => { renderer.setMapLevelsEnabled(selectedMapLevels(debugMapLevels)); saveDebugSettings(); });
  updatePlayerStateOverlayVisibility();
  closeDebug.onclick = () => setDebugMenuOpen(false);
  const showEvents = (events: ClientSnapshot['events'] | undefined) => {
    const listener = authoritative?.players.find(player => player.id === id) ?? game?.gameState.playerStates.get(id);
    const spatialize = (event: { x: number; y: number; z: number }, maxDistance: number): AudioSpatialization | undefined => {
      if (!listener) return undefined;
      const listenerPosition: AudioPosition = { x: listener.x, y: listener.y, z: listener.z };
      return { source: event, listener: listenerPosition, maxDistance, panWidth: SOURCE_AUDIO_PAN_HALF_WIDTH };
    };
    for (const event of events ?? []) {
      if (seenEvents.has(event.id)) continue; seenEvents.add(event.id);
      if (event.type === 'hit' && event.lethal) feedEntries.unshift(`${event.actor?.slice(0, 6) ?? 'Player'} wasted ${event.target.slice(0, 6)}`);
      else if (event.type === 'vehicle-enter') feedEntries.unshift(`${event.actor.slice(0, 6)} entered a vehicle`);
      if (event.type === 'shot') audio.playShot(event.weapon, spatialize(event, SOURCE_WEAPON_AUDIO_MAX_DISTANCE));
      else if (event.type === 'pickup') audio.play('pickup', spatialize(event, SOURCE_EVENT_AUDIO_MAX_DISTANCE));
      else if (event.type === 'vehicle-enter') audio.play('enter', spatialize(event, SOURCE_EVENT_AUDIO_MAX_DISTANCE));
      else if (event.type === 'explosion') audio.play('explosion', spatialize(event, SOURCE_EVENT_AUDIO_MAX_DISTANCE));
      if (event.type === 'hit' && event.lethal) audio.play('wasted', spatialize(event, SOURCE_EVENT_AUDIO_MAX_DISTANCE));
    }
    while (feedEntries.length > 5) feedEntries.pop(); feed.textContent = feedEntries.join('\n'); feed.hidden = feedEntries.length === 0;
  };
  const addChat = (entry: ChatMessage) => { if (chats.some(existing => existing.id === entry.id && existing.sender === entry.sender)) return; chats.push(entry); while (chats.length > 40) chats.shift(); chatLog.textContent = chats.map(item => `${item.name}: ${item.text}`).join('\n'); chatLog.scrollTop = chatLog.scrollHeight; };
  function disconnected(reason: string) {
    if (!multiplayerMode) return;
    setMultiplayerMenuActionsEnabled(false);
    playerHuds[1]!.root.hidden = true;
    game = undefined; clock.reset(); clearKeys(); touchControls.reset();
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
    vehicleEntryTracer.clear();
    if (multiplayerMode && socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
    game = undefined; authoritative = undefined; inputSequence = 0; serverTick = 0; seenEvents.clear(); feedEntries.splice(0); feed.hidden = true; clock.reset();
    setDebugActionsEnabled(false);
    reconnect.hidden = true; status.hidden = false; setStatus('Connecting…');
    if (!multiplayerMode) {
      setMultiplayerMenuActionsEnabled(false);
      id = localPlayerIds[0]!;
      localPausedState = false; localPaused.hidden = true;
      const localSession = createLocalSession(bootstrap, carInfo, localSplitScreen);
      game = localSession.game;
      match = localSession.match;
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
    socket = connectMultiplayer({
      bootstrap, carInfo, activeMapId, renderer, clock, playerHuds,
      ui: { nameInput, roomInput, teamInput, roomState, readyButton, localReset, localLeave, status, reconnect },
      setGame: value => { game = value; }, getGame: () => game, setId: value => { id = value; }, setMatch: value => { match = value; },
      setAuthoritative: value => { authoritative = value; }, setServerTick: value => { serverTick = value; }, getAuthoritative: () => authoritative,
      getMatch: () => match, getServerTick: () => serverTick, showEvents, addChat, setDebugActionsEnabled, sendPoliceAttackSetting, setLobbyOpen, setStatus,
      onDisconnect: reason => { setMultiplayerMenuActionsEnabled(false); if (!disposed && document.body.dataset['connection'] !== 'disconnected') disconnected(reason); },
      restoreSnapshot: restoreClientSnapshot,
    });
  }
  const mapNeedsReload = () => {
    const selected = multiplayerMapById(mapInput.value);
    return Boolean(selected && selected.id !== activeMapId);
  };
  const restartSelectedMode = () => {
    localSplitScreen = modeInput.value === 'local';
    multiplayerMode = !staticBuild && modeInput.value === 'online';
    setMultiplayerMenuActionsEnabled(multiplayerMode);
    setMultiplayerMenuMode(multiplayerMode);
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
  ui.startLocalGame.onclick = () => {
    localStorage.setItem('gta2-map', ui.localMapInput.value);
    const target = new URL(location.href);
    target.searchParams.set('mapId', ui.localMapInput.value);
    target.searchParams.set('mode', getSelectedLocalMode() === 'split-screen' ? 'split' : 'singleplayer');
    target.searchParams.delete('map');
    target.searchParams.delete('style');
    location.assign(target.href);
  };
  modeInput.addEventListener('change', restartSelectedMode);
  localReset.onclick = () => { if (!multiplayerMode) restartSelectedMode(); };
  localLeave.onclick = () => {
    if (!localSplitScreen) return;
    localSplitScreen = false; multiplayerMode = false; modeInput.value = 'singleplayer'; game = undefined; renderer.setSplitScreen(false);
    setMultiplayerMenuActionsEnabled(false);
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
  const animateFrame = createGameFrame({
    renderer, style, clock, localPlayerInputs, localPlayerIds, playerHuds, touchControls, vehicleEntryTracer,
    playerDebugOverlay, scoreboard, weaponHint, debugCameraMode, updateFpsCounter,
    getGame: () => game, getSocket: () => socket, getId: () => id, getServerTick: () => serverTick,
    getAuthoritative: () => authoritative, getLocalSplitScreen: () => localSplitScreen, getMultiplayerMode: () => multiplayerMode,
    getPaused: () => localPausedState, nextInputSequence: () => ++inputSequence,
    onError: error => { console.error(error); socket?.close(); disconnected((error as Error).message); },
  });
  const loop = createGameLoop({ onFrame: animateFrame });
  connect(); loop.start();
  const dispose = () => {
    disposed = true; loop.stop(); touchControls.reset();
    touchControls.dispose();
    if (socket?.readyState === WebSocket.OPEN) socket.close(); renderer.dispose(); audio.dispose();
    inputController.dispose(); removeEventListener('offline', handleOffline);
  };
  addEventListener('pagehide', dispose, { once: true });
}
export function startGameClient() { return boot(); }
