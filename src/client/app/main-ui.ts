import type { loadClientAssets } from './assets';
import { pickups } from '../rendering/sprite';
import { DEFAULT_MULTIPLAYER_MAP_ID, MULTIPLAYER_MAPS, type MultiplayerMapDefinition } from '../../shared/engine/loader/multiplayer-maps';
import { createMenuSystem } from './menu-system';

const message = document.querySelector<HTMLParagraphElement>('#message')!;
const reconnect = document.querySelector<HTMLButtonElement>('#reconnect')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
export const setStatus = (text: string, state: 'loading' | 'error' = 'loading') => {
  message.textContent = text;
  status.dataset['state'] = state;
};
const lobby = document.querySelector<HTMLDivElement>('#lobby')!;
const modeInput = document.querySelector<HTMLSelectElement>('#mode')!;
const openMenu = document.querySelector<HTMLButtonElement>('#open-menu')!;
const gameMenu = document.querySelector<HTMLElement>('#game-menu')!;
const menuBackdrop = document.querySelector<HTMLDivElement>('#menu-backdrop')!;
const localMenu = document.querySelector<HTMLElement>('#local-menu')!;
const localMenuTitle = document.querySelector<HTMLElement>('#local-menu-title')!;
const closeLocalMenu = document.querySelector<HTMLButtonElement>('#close-local-menu')!;
const localMapInput = document.querySelector<HTMLSelectElement>('#local-map')!;
const startLocalGame = document.querySelector<HTMLButtonElement>('#start-local-game')!;
const closeLobby = document.querySelector<HTMLButtonElement>('#close-lobby')!;
const graphicsMenu = document.querySelector<HTMLElement>('#graphics-menu')!;
const closeChat = document.querySelector<HTMLButtonElement>('#close-chat')!;
const debugMenu = document.querySelector<HTMLElement>('#debug-menu')!;
const closeDebug = document.querySelector<HTMLButtonElement>('#close-debug')!;
const debugGiveAllWeapons = document.querySelector<HTMLButtonElement>('#debug-give-all-weapons')!;
const debugPedestrianGraph = document.querySelector<HTMLInputElement>('#debug-pedestrian-graph')!;
const debugTraffic = document.querySelector<HTMLInputElement>('#debug-traffic')!;
const debugCar = document.querySelector<HTMLInputElement>('#debug-car')!;
const debugZones = document.querySelector<HTMLInputElement>('#debug-zones')!;
const debugPoliceAttack = document.querySelector<HTMLInputElement>('#debug-police-attack')!;
const debugVehicleDoors = document.querySelector<HTMLInputElement>('#debug-vehicle-doors')!;
const debugClosestDoor = document.querySelector<HTMLInputElement>('#debug-closest-door')!;
const debugShowPlayerState = document.querySelector<HTMLInputElement>('#debug-show-player-state')!;
const debugPlayerStateOverlay = document.querySelector<HTMLOutputElement>('#debug-player-state-overlay')!;
const debugMapTileOverlay = document.querySelector<HTMLOutputElement>('#debug-map-tile-overlay')!;
const debugTilePicker = document.querySelector<HTMLInputElement>('#debug-tile-picker')!;
const debugMapLevels = document.querySelector<HTMLSelectElement>('#debug-map-levels')!;
const debugResetWorld = document.querySelector<HTMLButtonElement>('#debug-reset-world')!;
const debugCameraMode = document.querySelector<HTMLSelectElement>('#debug-camera-mode')!;
const nameInput = document.querySelector<HTMLInputElement>('#name')!;
const roomInput = document.querySelector<HTMLInputElement>('#room')!;
const teamInput = document.querySelector<HTMLSelectElement>('#team')!;
const mapInput = document.querySelector<HTMLSelectElement>('#map')!;
const join = document.querySelector<HTMLButtonElement>('#join')!;
const readyButton = document.querySelector<HTMLButtonElement>('#ready')!;
const localReset = document.querySelector<HTMLButtonElement>('#local-reset')!;
const localLeave = document.querySelector<HTMLButtonElement>('#local-leave')!;
const roomState = document.querySelector<HTMLSpanElement>('#roomstate')!;
const scoreboard = document.querySelector<HTMLDivElement>('#scoreboard')!;
const feed = document.querySelector<HTMLDivElement>('#feed')!;
const chat = document.querySelector<HTMLDivElement>('#chat')!;
const chatLog = document.querySelector<HTMLDivElement>('#chatlog')!;
const chatInput = document.querySelector<HTMLInputElement>('#chatinput')!;
const localPaused = document.querySelector<HTMLElement>('#local-paused')!;
const localResume = document.querySelector<HTMLButtonElement>('#local-resume')!;
const localPauseLeave = document.querySelector<HTMLButtonElement>('#local-pause-leave')!;

export interface PlayerHud {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly weaponIcon: HTMLCanvasElement;
  readonly weaponName: HTMLElement;
  readonly ammo: HTMLElement;
  readonly hearts: HTMLElement;
  readonly armor: HTMLElement;
  readonly wanted: HTMLElement;
  readonly money: HTMLElement;
  readonly score: HTMLElement;
  readonly vehicle: HTMLElement;
  readonly vehicleValue: HTMLElement;
  readonly status: HTMLElement;
}

function playerHudField<T extends HTMLElement>(root: HTMLElement, field: string) {
  const element = root.querySelector<T>(`[data-field="${field}"]`);
  if (!element) throw new Error(`Missing player HUD field: ${field}`);
  return element;
}

export function createPlayerHud(playerId: string, label: string): PlayerHud {
  const template = document.querySelector<HTMLTemplateElement>('#player-hud-template');
  const container = document.querySelector<HTMLElement>('#player-huds');
  if (!template || !container) throw new Error('Player HUD template is unavailable');
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.firstElementChild as HTMLElement;
  root.dataset['playerId'] = playerId;
  root.querySelector<HTMLElement>('[data-field="name"]')!.textContent = label;
  container.append(root);
  return {
    root,
    name: playerHudField(root, 'name'),
    weaponIcon: playerHudField<HTMLCanvasElement>(root, 'weapon-icon'),
    weaponName: playerHudField(root, 'weapon-name'), ammo: playerHudField(root, 'ammo'),
    hearts: playerHudField(root, 'hearts'), armor: playerHudField(root, 'armor'),
    wanted: playerHudField(root, 'wanted'), money: playerHudField(root, 'money'), score: playerHudField(root, 'score'),
    vehicle: playerHudField(root, 'vehicle'), vehicleValue: playerHudField(root, 'vehicle-value'), status: playerHudField(root, 'status'),
  };
}
const fpsCounter = document.querySelector<HTMLElement>('#fps-counter')!;

const weaponHint = document.createElement('div');
weaponHint.id = 'weapon-hint'; weaponHint.setAttribute('role', 'status'); weaponHint.hidden = true;
document.body.append(weaponHint);
const storedName = localStorage.getItem('gta2-name') || '';
if (storedName.toLocaleLowerCase() === 'player') nameInput.value = '';
else nameInput.value = storedName;
roomInput.value = localStorage.getItem('gta2-room') || roomInput.value;

function replaceMapOptions(input: HTMLSelectElement, maps: readonly MultiplayerMapDefinition[], selectedId: string) {
  const available = maps.length ? maps : MULTIPLAYER_MAPS;
  input.replaceChildren(...available.map(map => {
    const option = new Option(map.label, map.id);
    option.title = `${map.map} · ${map.style}`;
    return option;
  }));
  if (available.some(map => map.id === selectedId)) input.value = selectedId;
  else if (available[0]) input.value = available[0].id;
}
export function setMapOptions(maps: readonly MultiplayerMapDefinition[], selectedId = mapInput.value || DEFAULT_MULTIPLAYER_MAP_ID) {
  replaceMapOptions(mapInput, maps, selectedId);
}
export function setLocalMapOptions(maps: readonly MultiplayerMapDefinition[], selectedId = localMapInput.value || DEFAULT_MULTIPLAYER_MAP_ID) {
  replaceMapOptions(localMapInput, maps, selectedId);
}
setMapOptions(MULTIPLAYER_MAPS, localStorage.getItem('gta2-map') || DEFAULT_MULTIPLAYER_MAP_ID);
setLocalMapOptions(MULTIPLAYER_MAPS, localStorage.getItem('gta2-map') || DEFAULT_MULTIPLAYER_MAP_ID);

const menuSystem = createMenuSystem(menuBackdrop, [
  {
    id: 'game',
    surface: gameMenu,
    trigger: openMenu,
    initialFocusId: 'menu-resume',
    render: {
      title: 'GTA2',
      headerClass: 'game-menu-header',
      entryContainerClass: 'game-menu-actions',
      entryContainerTag: 'ul',
      entries: [
        { kind: 'action', id: 'menu-resume', label: 'Resume', action: 'resume' },
        { kind: 'action', id: 'open-single-player', label: 'Single player', action: 'singleplayer' },
        { kind: 'action', id: 'open-split-screen', label: 'Split screen', action: 'split-screen' },
        { kind: 'action', id: 'open-lobby', label: 'Multiplayer', action: 'multiplayer' },
        { kind: 'action', id: 'open-graphics', label: 'Graphics', action: 'graphics' },
        { kind: 'action', id: 'open-scoreboard', label: 'Scoreboard', action: 'scoreboard' },
        { kind: 'action', id: 'open-chat', label: 'Chat', action: 'chat' },
        { kind: 'action', id: 'open-debug', label: 'Debug', action: 'debug' },
      ],
    },
  },
  { id: 'local', surface: localMenu, triggerId: 'open-single-player', initialFocus: localMapInput },
  { id: 'lobby', surface: lobby, triggerId: 'open-lobby', initialFocus: nameInput },
  {
    id: 'graphics',
    surface: graphicsMenu,
    triggerId: 'open-graphics',
    initialFocusId: 'debug-camera-speed-zoom',
    render: {
      title: 'Graphics',
      headerClass: 'menu-surface-header',
      entryContainerClass: 'menu-actions',
      back: { id: 'close-graphics', label: 'Back' },
      entries: [
        { kind: 'checkbox', id: 'debug-camera-speed-zoom', label: 'Speed zoom-out', checked: true },
        { kind: 'checkbox', id: 'debug-camera-lookahead', label: 'Look ahead at speed', checked: true },
        { kind: 'checkbox', id: 'debug-sprite-frame-interpolation', label: 'Sprite frame interpolation', checked: true },
        { kind: 'checkbox', id: 'debug-fps', label: 'FPS counter' },
      ],
    },
  },
  { id: 'scoreboard', surface: scoreboard, triggerId: 'open-scoreboard' },
  { id: 'chat', surface: chat, triggerId: 'open-chat', initialFocus: chatInput },
  { id: 'debug', surface: debugMenu, triggerId: 'open-debug', initialFocus: debugPedestrianGraph },
], { onAction: handleMenuAction });

const menuResume = menuSystem.element<HTMLButtonElement>('game', 'menu-resume');
const openSinglePlayer = menuSystem.element<HTMLButtonElement>('game', 'open-single-player');
const openSplitScreen = menuSystem.element<HTMLButtonElement>('game', 'open-split-screen');
const openLobby = menuSystem.element<HTMLButtonElement>('game', 'open-lobby');
const openGraphics = menuSystem.element<HTMLButtonElement>('game', 'open-graphics');
const closeGraphics = menuSystem.element<HTMLButtonElement>('graphics', 'close-graphics');
const openScoreboard = menuSystem.element<HTMLButtonElement>('game', 'open-scoreboard');
const openChat = menuSystem.element<HTMLButtonElement>('game', 'open-chat');
const openDebug = menuSystem.element<HTMLButtonElement>('game', 'open-debug');
const debugCameraSpeedZoom = menuSystem.element<HTMLInputElement>('graphics', 'debug-camera-speed-zoom');
const debugCameraLookahead = menuSystem.element<HTMLInputElement>('graphics', 'debug-camera-lookahead');
const debugSpriteFrameInterpolation = menuSystem.element<HTMLInputElement>('graphics', 'debug-sprite-frame-interpolation');
const debugFps = menuSystem.element<HTMLInputElement>('graphics', 'debug-fps');

let selectedLocalMode: 'singleplayer' | 'split-screen' = 'singleplayer';

function handleMenuAction(action: string) {
  switch (action) {
    case 'resume': setGameMenuOpen(false); break;
    case 'singleplayer': selectedLocalMode = 'singleplayer'; setLocalMenuOpen(true, selectedLocalMode); break;
    case 'split-screen': selectedLocalMode = 'split-screen'; setLocalMenuOpen(true, selectedLocalMode); break;
    case 'multiplayer': setLobbyOpen(true); break;
    case 'graphics': menuSystem.open('graphics'); break;
    case 'scoreboard': setScoreboardOpen(true); break;
    case 'chat': setChatOpen(true); break;
    case 'debug': setDebugMenuOpen(true); break;
  }
}

export function setLobbyOpen(open: boolean) {
  if (open) menuSystem.open('lobby', { focus: nameInput });
  else menuSystem.dismiss('lobby');
}
export function setMultiplayerMenuMode(enabled: boolean) {
  for (const button of [openSinglePlayer, openSplitScreen]) {
    button.hidden = enabled;
    const item = button.closest('li');
    if (item) item.hidden = enabled;
  }
  for (const value of ['singleplayer', 'local']) {
    const option = modeInput.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
    if (option) option.hidden = enabled;
  }
  if (enabled) modeInput.value = 'online';
}
export function setLocalMenuOpen(open: boolean, mode: 'singleplayer' | 'split-screen' = 'singleplayer') {
  if (open) {
    localMenuTitle.textContent = mode === 'split-screen' ? 'Split screen' : 'Single player';
    menuSystem.open('local', { focus: localMapInput });
  } else menuSystem.backIf('local');
}
export const getSelectedLocalMode = () => selectedLocalMode;
export function setScoreboardOpen(open: boolean) {
  if (open) menuSystem.open('scoreboard');
  else menuSystem.dismiss('scoreboard');
}
export function setChatOpen(open: boolean) {
  if (open) menuSystem.open('chat', { focus: chatInput });
  else menuSystem.dismiss('chat');
}
export function setGameMenuOpen(open: boolean) {
  if (open) menuSystem.openRoot('game');
  else menuSystem.closeAll();
}
export function setDebugMenuOpen(open: boolean) {
  if (open) menuSystem.open('debug', { focus: debugPedestrianGraph });
  else menuSystem.backIf('debug');
}
export const isGameMenuOpen = () => menuSystem.isOpen('game');
export const isMenuOpen = (id?: string) => menuSystem.isOpen(id);
export const handleMenuEscape = () => menuSystem.handleEscape();
setLobbyOpen(false); setLocalMenuOpen(false); setScoreboardOpen(false); setChatOpen(false); setDebugMenuOpen(false);
setGameMenuOpen(false);
openMenu.onclick = () => menuSystem.toggleRoot('game');
menuBackdrop.onclick = () => menuSystem.handleEscape();
closeLobby.onclick = () => setLobbyOpen(false);
closeLocalMenu.onclick = () => setLocalMenuOpen(false);
closeChat.onclick = () => setChatOpen(false);
closeDebug.onclick = () => setDebugMenuOpen(false);
scoreboard.addEventListener('click', event => {
  if ((event.target as HTMLElement).closest('[data-menu-back]')) setScoreboardOpen(false);
});

const drawnHudWeapons = new WeakMap<HTMLCanvasElement, number>();
export function drawHudWeaponIcon(style: Awaited<ReturnType<typeof loadClientAssets>>['style']['style'], weapon: number, target: HTMLCanvasElement) {
  if (drawnHudWeapons.get(target) === weapon) return;
  drawnHudWeapons.set(target, weapon);
  const context = target.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, target.width, target.height);
  const range = pickups.rangeForWeapon(weapon);
  let frame: typeof style.sprites.codeObjects[number][number] | undefined;
  if (range) frame = style.sprites.codeObjects[range.start + Math.min(4, range.count - 1)]?.[0];
  if (!frame) return;
  const image = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const source = document.createElement('canvas'); source.width = frame.width; source.height = frame.height;
  source.getContext('2d')?.putImageData(image, 0, 0);
  const scale = Math.min((target.width - 6) / frame.width, (target.height - 6) / frame.height);
  const width = frame.width * scale, height = frame.height * scale;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, (target.width - width) / 2, (target.height - height) / 2, width, height);
}

export const ui = {
  message, reconnect, status, lobby, openMenu, menuResume, gameMenu, menuBackdrop, localMenu, localMenuTitle, closeLocalMenu, openSinglePlayer, openSplitScreen, localMapInput, startLocalGame, openLobby, graphicsMenu, openGraphics, closeGraphics, openScoreboard, openChat, openDebug, debugMenu, closeDebug,
  debugGiveAllWeapons,
  debugPedestrianGraph, debugTraffic, debugCar, debugZones, debugPoliceAttack, debugVehicleDoors, debugClosestDoor, debugShowPlayerState, debugPlayerStateOverlay, debugMapTileOverlay, debugTilePicker, debugMapLevels, debugResetWorld, debugCameraMode, debugCameraSpeedZoom, debugCameraLookahead, debugSpriteFrameInterpolation, debugFps,
  nameInput, roomInput, teamInput, mapInput, join, readyButton, localReset, localLeave, roomState, scoreboard, feed, chat, chatLog, chatInput,
  modeInput,
  fpsCounter, weaponHint, localPaused, localResume, localPauseLeave,
};
