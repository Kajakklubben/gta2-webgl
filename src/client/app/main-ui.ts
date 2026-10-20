import type { loadClientAssets } from './assets';
import { pickups } from '../rendering/sprite';
import { DEFAULT_MULTIPLAYER_MAP_ID, MULTIPLAYER_MAPS, type MultiplayerMapDefinition } from '../../shared/loader/multiplayer-maps';

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
const menuResume = document.querySelector<HTMLButtonElement>('#menu-resume')!;
const gameMenu = document.querySelector<HTMLElement>('#game-menu')!;
const menuBackdrop = document.querySelector<HTMLDivElement>('#menu-backdrop')!;
const openLobby = document.querySelector<HTMLButtonElement>('#open-lobby')!;
const openScoreboard = document.querySelector<HTMLButtonElement>('#open-scoreboard')!;
const openChat = document.querySelector<HTMLButtonElement>('#open-chat')!;
const openDebug = document.querySelector<HTMLButtonElement>('#open-debug')!;
const debugMenu = document.querySelector<HTMLElement>('#debug-menu')!;
const closeDebug = document.querySelector<HTMLButtonElement>('#close-debug')!;
const debugTabGraphs = document.querySelector<HTMLButtonElement>('#debug-tab-graphs')!;
const debugTabPlayer = document.querySelector<HTMLButtonElement>('#debug-tab-player')!;
const debugTabCamera = document.querySelector<HTMLButtonElement>('#debug-tab-camera')!;
const debugGraphs = document.querySelector<HTMLElement>('#debug-graphs')!;
const debugPlayer = document.querySelector<HTMLElement>('#debug-player')!;
const debugCamera = document.querySelector<HTMLElement>('#debug-camera')!;
const debugGiveAllWeapons = document.querySelector<HTMLButtonElement>('#debug-give-all-weapons')!;
const debugPedestrianGraph = document.querySelector<HTMLInputElement>('#debug-pedestrian-graph')!;
const debugTraffic = document.querySelector<HTMLInputElement>('#debug-traffic')!;
const debugCar = document.querySelector<HTMLInputElement>('#debug-car')!;
const debugZones = document.querySelector<HTMLInputElement>('#debug-zones')!;
const debugPoliceAttack = document.querySelector<HTMLInputElement>('#debug-police-attack')!;
const debugVehicleDoors = document.querySelector<HTMLInputElement>('#debug-vehicle-doors')!;
const debugClosestDoor = document.querySelector<HTMLInputElement>('#debug-closest-door')!;
const debugShowCoordinates = document.querySelector<HTMLInputElement>('#debug-show-coordinates')!;
const debugCoordinates = document.querySelector<HTMLOutputElement>('#debug-coordinates')!;
const debugCoordinateOverlay = document.querySelector<HTMLOutputElement>('#debug-coordinate-overlay')!;
const debugShowPlayerState = document.querySelector<HTMLInputElement>('#debug-show-player-state')!;
const debugPlayerStateOverlay = document.querySelector<HTMLOutputElement>('#debug-player-state-overlay')!;
const debugResetWorld = document.querySelector<HTMLButtonElement>('#debug-reset-world')!;
const debugCameraMode = document.querySelector<HTMLSelectElement>('#debug-camera-mode')!;
const debugCameraSpeedZoom = document.querySelector<HTMLInputElement>('#debug-camera-speed-zoom')!;
const debugCameraLookahead = document.querySelector<HTMLInputElement>('#debug-camera-lookahead')!;
const debugSpriteFrameInterpolation = document.querySelector<HTMLInputElement>('#debug-sprite-frame-interpolation')!;
const debugFps = document.querySelector<HTMLInputElement>('#debug-fps')!;
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

export function setMapOptions(maps: readonly MultiplayerMapDefinition[], selectedId = mapInput.value || DEFAULT_MULTIPLAYER_MAP_ID) {
  const available = maps.length ? maps : MULTIPLAYER_MAPS;
  mapInput.replaceChildren(...available.map(map => {
    const option = new Option(map.label, map.id);
    option.title = `${map.map} · ${map.style}`;
    return option;
  }));
  if (available.some(map => map.id === selectedId)) mapInput.value = selectedId;
  else if (available[0]) mapInput.value = available[0].id;
}
setMapOptions(MULTIPLAYER_MAPS, localStorage.getItem('gta2-map') || DEFAULT_MULTIPLAYER_MAP_ID);

export const setLobbyOpen = (open: boolean) => {
  lobby.hidden = !open;
  openLobby.setAttribute('aria-expanded', String(open));
  if (open) openLobby.textContent = 'Close lobby';
  else openLobby.textContent = 'Lobby';
};
export const setScoreboardOpen = (open: boolean) => {
  scoreboard.hidden = !open;
  openScoreboard.setAttribute('aria-expanded', String(open));
  if (open) openScoreboard.textContent = 'Close score';
  else openScoreboard.textContent = 'Score';
};
export const setChatOpen = (open: boolean) => {
  chat.hidden = !open;
  openChat.setAttribute('aria-expanded', String(open));
  if (open) openChat.textContent = 'Close chat';
  else openChat.textContent = 'Chat';
};
let gameMenuOpen = false;
export const setGameMenuOpen = (open: boolean) => {
  gameMenuOpen = open;
  gameMenu.hidden = !open;
  menuBackdrop.hidden = !open;
  openMenu.setAttribute('aria-expanded', String(open));
  if (open) {
    menuResume.focus({ preventScroll: true });
  } else if (document.activeElement instanceof HTMLElement && gameMenu.contains(document.activeElement)) {
    openMenu.focus({ preventScroll: true });
  }
};
export const isGameMenuOpen = () => gameMenuOpen;
setLobbyOpen(false); setScoreboardOpen(false); setChatOpen(false);
setGameMenuOpen(false);
openMenu.onclick = () => setGameMenuOpen(!gameMenuOpen);
menuResume.onclick = () => setGameMenuOpen(false);
menuBackdrop.onclick = () => setGameMenuOpen(false);
const menuButtons = [menuResume, openLobby, openScoreboard, openChat, openDebug];
gameMenu.addEventListener('keydown', event => {
  if (!gameMenuOpen || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const current = Math.max(0, menuButtons.indexOf(document.activeElement as HTMLButtonElement));
  const direction = event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1;
  menuButtons[(current + direction + menuButtons.length) % menuButtons.length]!.focus({ preventScroll: true });
});
openLobby.onclick = () => { setLobbyOpen(Boolean(lobby.hidden)); setGameMenuOpen(false); };
openScoreboard.onclick = () => { setScoreboardOpen(Boolean(scoreboard.hidden)); setGameMenuOpen(false); };
openChat.onclick = () => { setChatOpen(Boolean(chat.hidden)); setGameMenuOpen(false); };

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
  message, reconnect, status, lobby, openMenu, menuResume, gameMenu, menuBackdrop, openLobby, openScoreboard, openChat, openDebug, debugMenu, closeDebug,
  debugTabGraphs, debugTabPlayer, debugTabCamera, debugPlayer, debugCamera, debugGraphs,
  debugGiveAllWeapons,
  debugPedestrianGraph, debugTraffic, debugCar, debugZones, debugPoliceAttack, debugVehicleDoors, debugClosestDoor, debugShowCoordinates, debugCoordinates, debugCoordinateOverlay, debugShowPlayerState, debugPlayerStateOverlay, debugResetWorld, debugCameraMode, debugCameraSpeedZoom, debugCameraLookahead, debugSpriteFrameInterpolation, debugFps,
  nameInput, roomInput, teamInput, mapInput, join, readyButton, localReset, localLeave, roomState, scoreboard, feed, chat, chatLog, chatInput,
  modeInput,
  fpsCounter, weaponHint, localPaused, localResume, localPauseLeave,
};
