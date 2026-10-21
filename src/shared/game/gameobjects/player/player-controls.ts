import type { PlayerControl } from '../../../protocol/types';
import type { PlayerObject } from './player';

export function applyPlayerControls(player: PlayerObject, controls: readonly PlayerControl[]) {
  const bits: Record<string, number> = { forwardStart: 1, forwardEnd: 1, backwardStart: 2, backwardEnd: 2, leftStart: 4, leftEnd: 4, rightStart: 8, rightEnd: 8, shootStart: 16, shootEnd: 16, sprintStart: 32, sprintEnd: 32 };
  for (const control of controls) {
    const bit = bits[control];
    if (!bit) continue;
    if (control.endsWith('Start')) player.heldControlState |= bit;
    else player.heldControlState &= ~bit;
  }
  return player.heldControlState;
}
