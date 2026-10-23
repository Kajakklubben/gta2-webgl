/** Source timing for the normal Car_BC moving_collect_36_132 object. The
 * code-object template uses a 120-tick animation timer before its next
 * definition dispatches the item/car explosion. */
export const SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS = 120;

export type VehicleBombAnimationState = 'armed' | 'triggered';

export function vehicleBombAnimationState(armingTimer: number | undefined): VehicleBombAnimationState {
  return armingTimer !== undefined && armingTimer > 0 ? 'armed' : 'triggered';
}
