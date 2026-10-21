import type { Gta2Game } from '../../shared/game/gta2-game';
import { queueVehicleEntryRequest, type LocalPlayerInputState } from './player-input';
import { localPlayerIds } from './input-bindings';
import { Renderer } from '../rendering/renderer';
import type { PlayerState } from '../../shared/protocol/types';

export function installTouchControls(options: {
  renderer: Renderer;
  gameSurface: HTMLElement;
  joystick: HTMLElement;
  joystickKnob: HTMLElement;
  players: readonly LocalPlayerInputState[];
  getGame(): Gta2Game | undefined;
  getSplitScreen(): boolean;
  isConnected(): boolean;
}) {
  const { renderer, gameSurface, joystick, joystickKnob, players, getGame, getSplitScreen, isConnected } = options;
  let joystickPointerId: number | undefined;
  let touchPointerId: number | undefined;
  let touchOrigin: { x: number; y: number } | undefined;
  let touchDragged = false;
  const directions: Array<{ x: number; y: number } | undefined> = [undefined, undefined];
  let touchVehicleIds: number[] = [];
  let touchPlayerIndex = 0;
  let touchPlayerId: string = localPlayerIds[0]!;

  const clearDirections = () => { directions[0] = undefined; directions[1] = undefined; };
  const resetJoystick = () => { joystickPointerId = undefined; clearDirections(); joystickKnob.style.transform = 'translate(-50%, -50%)'; };
  const updateJoystick = (x: number, y: number) => {
    const bounds = joystick.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2, centerY = bounds.top + bounds.height / 2;
    const maxDistance = Math.max(1, Math.min(bounds.width, bounds.height) * .29);
    const rawX = x - centerX, rawY = y - centerY, distance = Math.hypot(rawX, rawY);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const offsetX = rawX * scale, offsetY = rawY * scale;
    joystickKnob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    if (distance < 8) { clearDirections(); return; }
    directions[0] = { x: offsetX / maxDistance, y: -offsetY / maxDistance };
  };
  const joystickStart = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !isConnected()) return;
    event.preventDefault(); joystickPointerId = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event.clientX, event.clientY);
  };
  const joystickMove = (event: PointerEvent) => { if (event.pointerId === joystickPointerId) { event.preventDefault(); updateJoystick(event.clientX, event.clientY); } };
  const joystickEnd = (event: PointerEvent) => { if (event.pointerId === joystickPointerId) { event.preventDefault(); resetJoystick(); } };
  const endTouch = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    event.preventDefault(); clearDirections(); touchPointerId = undefined; touchOrigin = undefined; touchVehicleIds = [];
  };
  const touchStart = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !(event.target instanceof HTMLCanvasElement) || !isConnected()) return;
    event.preventDefault(); touchPointerId = event.pointerId; touchOrigin = { x: event.clientX, y: event.clientY }; touchDragged = false; clearDirections();
    touchVehicleIds = []; touchPlayerIndex = getSplitScreen() && event.clientX >= innerWidth / 2 ? 1 : 0; touchPlayerId = localPlayerIds[touchPlayerIndex]!;
    const game = getGame();
    if (game) touchVehicleIds = renderer.vehicleIdsAtScreen(event.clientX, event.clientY, game.gameState.vehicleStates, touchPlayerId);
    gameSurface.setPointerCapture(event.pointerId);
  };
  const touchMove = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    event.preventDefault(); if (!touchOrigin) return;
    const dx = event.clientX - touchOrigin.x, dy = event.clientY - touchOrigin.y, distance = Math.hypot(dx, dy);
    if (distance < 18) { clearDirections(); return; }
    touchDragged = true; directions[touchPlayerIndex] = { x: dx / distance, y: -dy / distance };
  };
  const touchEnd = (event: PointerEvent) => {
    if (event.pointerId !== touchPointerId) return;
    const game = getGame();
    if (!touchDragged && game) {
      let vehicleIds = touchVehicleIds;
      if (!vehicleIds.length) vehicleIds = renderer.vehicleIdsAtScreen(event.clientX, event.clientY, game.gameState.vehicleStates, touchPlayerId);
      const localPlayer: PlayerState | undefined = game.gameState.playerStates.get(touchPlayerId);
      const enteredVehicle = localPlayer?.vehicleId === undefined ? undefined : game.gameState.vehicleStates.find(vehicle => vehicle.id === localPlayer.vehicleId);
      const enteredOccupant = enteredVehicle?.occupants.find(occupant => occupant.id === localPlayer?.id);
      const entering = enteredOccupant?.state === 'approaching' || enteredOccupant?.state === 'entering';
      if (!entering) for (const vehicleId of vehicleIds) { queueVehicleEntryRequest(players[touchPlayerIndex]!, vehicleId); break; }
    }
    endTouch(event);
  };
  joystick.addEventListener('pointerdown', joystickStart); joystick.addEventListener('pointermove', joystickMove); joystick.addEventListener('pointerup', joystickEnd); joystick.addEventListener('pointercancel', joystickEnd); joystick.addEventListener('lostpointercapture', joystickEnd);
  gameSurface.addEventListener('pointerdown', touchStart); gameSurface.addEventListener('pointermove', touchMove); gameSurface.addEventListener('pointerup', touchEnd); gameSurface.addEventListener('pointercancel', endTouch); gameSurface.addEventListener('lostpointercapture', endTouch);
  addEventListener('blur', resetJoystick);
  return {
    directions,
    reset: resetJoystick,
    dispose() {
      resetJoystick();
      joystick.removeEventListener('pointerdown', joystickStart); joystick.removeEventListener('pointermove', joystickMove); joystick.removeEventListener('pointerup', joystickEnd); joystick.removeEventListener('pointercancel', joystickEnd); joystick.removeEventListener('lostpointercapture', joystickEnd);
      gameSurface.removeEventListener('pointerdown', touchStart); gameSurface.removeEventListener('pointermove', touchMove); gameSurface.removeEventListener('pointerup', touchEnd); gameSurface.removeEventListener('pointercancel', endTouch); gameSurface.removeEventListener('lostpointercapture', endTouch);
      removeEventListener('blur', resetJoystick);
    },
  };
}
