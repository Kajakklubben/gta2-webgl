import type { Input } from '../../../shared/protocol/types';
import { buildPlayerInput, clearPlayerInputState, createPlayerInputState } from '../../app/player-input';
import { controlTransitions, gamepadActions, gamepadFor, gamepadMask, keyboardBindings, localPlayerKeyCodes, weaponKeyActions } from '../../app/input-bindings';

/**
 * The common manual-input bridge for every scenario replay. A lab supplies
 * only its active-state predicate; keyboard, gamepad, and action-edge handling
 * then follow the same normal player-input path everywhere.
 */
export class ScenarioManualInput {
  private readonly state = createPlayerInputState('scenario-manual-player', keyboardBindings);
  private enabled = false;

  constructor(private readonly isActive: () => boolean) {
    addEventListener('keydown', this.keydown, true);
    addEventListener('keyup', this.keyup, true);
    addEventListener('blur', this.clear);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  /** Queue the same one-tick vehicle toggle produced by pressing E. */
  queueVehicleToggle() {
    this.state.vehiclePulses = Math.max(this.state.vehiclePulses, 1);
  }

  inputForTick(seq: number, includeDevices = true): Input {
    const gamepad = includeDevices ? gamepadFor(0) : null;
    const input = buildPlayerInput(this.state, {
      gamepadMask: gamepadMask(gamepad),
      gamepadActions: gamepadActions(gamepad),
      controlTransitions,
    });
    return { ...input, seq };
  }

  private clear = () => clearPlayerInputState(this.state);

  private keydown = (event: KeyboardEvent) => {
    if (!this.enabled || !this.isActive()) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    const isBound = this.state.maskBindings[event.code] !== undefined || localPlayerKeyCodes[0]!.has(event.code);
    if (!isBound) return;
    event.preventDefault();
    if (!event.repeat && weaponKeyActions[event.code] === 'next') this.state.weaponPulses++;
    if (!event.repeat && weaponKeyActions[event.code] === 'previous') this.state.weaponPreviousPulses++;
    if (!event.repeat && event.code === 'KeyE') this.state.vehiclePulses++;
    if (!event.repeat && event.code === 'KeyP') this.state.jumpPulses++;
    this.state.keys.add(event.code);
  };

  private keyup = (event: KeyboardEvent) => {
    if (!this.enabled || !this.isActive()) return;
    if (this.state.maskBindings[event.code] !== undefined || localPlayerKeyCodes[0]!.has(event.code)) {
      event.preventDefault();
      this.state.keys.delete(event.code);
    }
  };

  dispose() {
    removeEventListener('keydown', this.keydown, true);
    removeEventListener('keyup', this.keyup, true);
    removeEventListener('blur', this.clear);
  }
}
