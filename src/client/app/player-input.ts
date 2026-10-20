import type { Input, PlayerControl } from '../../shared/protocol/types';

export type PlayerInputPayload = Omit<Input, 'seq' | 'clientTick'>;

/**
 * Input state shared by every locally controlled player.
 *
 * The browser can have several input sources (keyboard, touch and gamepad),
 * but they all feed this same state machine. Keeping the retry target here is
 * important: every retry must carry the same vehicle id until it is consumed.
 */
export interface LocalPlayerInputState {
  readonly id: string;
  readonly maskBindings: Readonly<Record<string, number>>;
  readonly keys: Set<string>;
  vehiclePulses: number;
  vehicleTarget: number | undefined;
  jumpPulses: number;
  weaponPulses: number;
  weaponPreviousPulses: number;
  previousControlMask: number;
  previousGamepadActions: number;
}

export interface BuildPlayerInputOptions {
  gamepadMask: number;
  gamepadActions: number;
  controlTransitions: (previous: number, current: number) => PlayerControl[];
}

export function createPlayerInputState(id: string, maskBindings: Readonly<Record<string, number>>): LocalPlayerInputState {
  return {
    id,
    maskBindings,
    keys: new Set<string>(),
    vehiclePulses: 0,
    vehicleTarget: undefined,
    jumpPulses: 0,
    weaponPulses: 0,
    weaponPreviousPulses: 0,
    previousControlMask: 0,
    previousGamepadActions: 0,
  };
}

export function queueVehicleEntryRequest(player: LocalPlayerInputState, vehicleId: number, retries = 3): void {
  player.vehicleTarget = vehicleId;
  player.vehiclePulses = Math.max(player.vehiclePulses, retries);
}

export function clearPlayerInputState(player: LocalPlayerInputState): void {
  player.keys.clear();
  player.vehiclePulses = 0;
  player.vehicleTarget = undefined;
  player.jumpPulses = 0;
  player.weaponPulses = 0;
  player.weaponPreviousPulses = 0;
  player.previousControlMask = 0;
  player.previousGamepadActions = 0;
}

export function buildPlayerInput(player: LocalPlayerInputState, options: BuildPlayerInputOptions): PlayerInputPayload {
  const keyboardMask = [...player.keys].reduce((value, key) => value | (player.maskBindings[key] ?? 0), 0);
  const weaponPulse = player.weaponPulses > 0;
  const weaponPreviousPulse = player.weaponPreviousPulses > 0;
  let mask = keyboardMask | options.gamepadMask;
  if (weaponPulse) mask |= 64;
  if (weaponPulse) player.weaponPulses--;
  if (weaponPreviousPulse) player.weaponPreviousPulses--;

  const controls = options.controlTransitions(player.previousControlMask, mask);
  player.previousControlMask = mask;
  if (weaponPulse) controls.push('weaponNext');
  if (weaponPreviousPulse) controls.push('weaponPrevious');

  const gamepadActionEdges = options.gamepadActions & ~player.previousGamepadActions;
  player.previousGamepadActions = options.gamepadActions;
  const addControl = (control: PlayerControl) => {
    if (!controls.includes(control)) controls.push(control);
  };

  let action: Input['action'];
  if (player.vehiclePulses > 0) action = 'enter';
  else if (player.jumpPulses > 0) action = 'jump';

  if (gamepadActionEdges & 1) {
    addControl('enterVehicle');
    action = 'enter';
  }
  if (gamepadActionEdges & 2) {
    addControl('jump');
    action = 'jump';
  }
  if (gamepadActionEdges & 4) addControl('weaponPrevious');
  if (gamepadActionEdges & 8) addControl('weaponNext');

  const vehicleId = player.vehiclePulses > 0 ? player.vehicleTarget : undefined;
  if (action === 'enter') addControl('enterVehicle');
  if (action === 'jump') addControl('jump');
  if (player.vehiclePulses > 0) {
    player.vehiclePulses--;
    if (player.vehiclePulses === 0) player.vehicleTarget = undefined;
  }
  if (player.jumpPulses > 0 && action === 'jump') player.jumpPulses--;

  const input: PlayerInputPayload = { keys: mask, controls };
  if (action !== undefined) input.action = action;
  if (vehicleId !== undefined) input.vehicleId = vehicleId;
  return input;
}
