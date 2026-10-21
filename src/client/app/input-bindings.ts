import { clearPlayerInputState, type LocalPlayerInputState } from './player-input';
import type { PlayerControl } from '../../shared/protocol/types';

export const localPlayerIds = ['local-player-1', 'local-player-2'] as const;
export const keyboardBindings: Record<string, number> = {
  ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8,
  Space: 16, ControlLeft: 16, ControlRight: 16,
  KeyZ: 64, KeyX: 64, ShiftLeft: 32, ShiftRight: 32, Tab: 64,
};
export const localPlayerMaskBindings = [keyboardBindings, { KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8, KeyF: 16, KeyT: 32 }];
export const localPlayerKeyCodes = [
  new Set([...Object.keys(keyboardBindings), 'KeyE', 'KeyP']),
  new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyR', 'KeyT', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyO']),
] as const;
export const weaponKeyActions: Record<string, 'previous' | 'next'> = { KeyZ: 'previous', KeyX: 'next', Tab: 'next' };
export const cameraKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'PageUp', 'PageDown']);

export function controlTransitions(previous: number, current: number) {
  const controls: PlayerControl[] = [];
  const transitions: readonly [number, PlayerControl, PlayerControl][] = [
    [1, 'forwardStart', 'forwardEnd'], [2, 'backwardStart', 'backwardEnd'],
    [4, 'leftStart', 'leftEnd'], [8, 'rightStart', 'rightEnd'],
    [16, 'shootStart', 'shootEnd'], [32, 'sprintStart', 'sprintEnd'],
  ];
  for (const [bit, start, end] of transitions) {
    const wasDown = (previous & bit) !== 0;
    const isDown = (current & bit) !== 0;
    if (!wasDown && isDown) controls.push(start);
    else if (wasDown && !isDown) controls.push(end);
  }
  return controls;
}

export function gamepadMask(gamepad: Gamepad | null) {
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

export function gamepadActions(gamepad: Gamepad | null) {
  if (!gamepad) return 0;
  let actions = 0;
  if (gamepad.buttons[1]?.pressed) actions |= 1;
  if (gamepad.buttons[0]?.pressed) actions |= 2;
  if (gamepad.buttons[2]?.pressed) actions |= 4;
  if (gamepad.buttons[3]?.pressed) actions |= 8;
  return actions;
}

export function gamepadFor(index: number) {
  return navigator.getGamepads?.()[index] ?? null;
}

export function clearInputStates(players: readonly LocalPlayerInputState[]) {
  for (const player of players) clearPlayerInputState(player);
}
