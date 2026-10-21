import { clearPlayerInputState, type LocalPlayerInputState } from './player-input';
import { cameraKeys, localPlayerKeyCodes, weaponKeyActions } from './input-bindings';
import { isGameMenuOpen, setGameMenuOpen } from './main-ui';

export function installInputController(options: {
  players: readonly LocalPlayerInputState[];
  getLocalSplitScreen: () => boolean;
  getMultiplayerMode: () => boolean;
  onPauseChanged: (paused: boolean) => void;
  roomState: HTMLElement;
}) {
  const { players, getLocalSplitScreen, getMultiplayerMode, onPauseChanged, roomState } = options;
  const clear = () => { for (const player of players) clearPlayerInputState(player); };
  const localPlayerIndexForKey = (code: string) => getLocalSplitScreen() && localPlayerKeyCodes[1]!.has(code) ? 1 : 0;
  const keydown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      event.preventDefault(); clear();
      const open = !isGameMenuOpen(); setGameMenuOpen(open);
      if (!getMultiplayerMode()) onPauseChanged(open);
      return;
    }
    const playerIndex = localPlayerIndexForKey(event.code);
    const player = players[playerIndex]!;
    const playerKey = localPlayerKeyCodes[playerIndex]!.has(event.code);
    const bound = player.maskBindings[event.code] !== undefined;
    const cameraKey = cameraKeys.has(event.code) && (!getLocalSplitScreen() || playerIndex === 0);
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
    const player = players[playerIndex]!;
    if (player.maskBindings[event.code] !== undefined || cameraKeys.has(event.code) || localPlayerKeyCodes[playerIndex]!.has(event.code)) {
      event.preventDefault(); player.keys.delete(event.code);
    }
  };
  const handleInputBlur = () => clear();
  const handleVisibilityChange = () => { if (document.hidden) handleInputBlur(); };
  const gamepadConnected = (event: GamepadEvent) => {
    if (!getMultiplayerMode()) roomState.textContent = `LOCAL · ${event.gamepad.index === 0 ? 'P1' : 'P2'} controller connected`;
  };
  const gamepadDisconnected = (event: GamepadEvent) => {
    if (!getMultiplayerMode()) roomState.textContent = `LOCAL · ${event.gamepad.index === 0 ? 'P1' : 'P2'} controller disconnected`;
  };
  const primaryPlayer = players[0]!;
  const touchButtons = [...document.querySelectorAll<HTMLButtonElement>('#touch-controls button')];
  const touchHandlers = touchButtons.map(button => {
    const press = (event: PointerEvent) => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      const key = button.dataset['key']; if (key) primaryPlayer.keys.add(key);
      if (button.dataset['pulse'] === 'weapon' || button.dataset['pulse'] === 'weapon-next') primaryPlayer.weaponPulses++;
      if (button.dataset['pulse'] === 'weapon-previous') primaryPlayer.weaponPreviousPulses++;
      if (button.dataset['pulse'] === 'vehicle') primaryPlayer.vehiclePulses++;
      if (button.dataset['pulse'] === 'jump') primaryPlayer.jumpPulses++;
    };
    const release = (event: PointerEvent) => { event.preventDefault(); const key = button.dataset['key']; if (key) primaryPlayer.keys.delete(key); };
    button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    return { button, press, release };
  });

  addEventListener('keydown', keydown); addEventListener('keyup', keyup); addEventListener('blur', handleInputBlur); addEventListener('visibilitychange', handleVisibilityChange);
  addEventListener('gamepadconnected', gamepadConnected); addEventListener('gamepaddisconnected', gamepadDisconnected);

  return {
    clear,
    dispose() {
      removeEventListener('keydown', keydown); removeEventListener('keyup', keyup); removeEventListener('blur', handleInputBlur); removeEventListener('visibilitychange', handleVisibilityChange);
      removeEventListener('gamepadconnected', gamepadConnected); removeEventListener('gamepaddisconnected', gamepadDisconnected);
      for (const { button, press, release } of touchHandlers) {
        button.removeEventListener('pointerdown', press); button.removeEventListener('pointerup', release); button.removeEventListener('pointercancel', release); button.removeEventListener('lostpointercapture', release);
      }
    },
  };
}
