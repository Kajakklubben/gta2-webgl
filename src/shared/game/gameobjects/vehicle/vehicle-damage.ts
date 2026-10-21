import type { TrafficState } from '../../../protocol/types';
import { applyVehicleSourceDamage, ensureVehicleDamageState, tickVehicleDamage, type VehicleDamageTransition } from '../../../domain/combat/vehicle-damage';

/** Vehicle-owned damage state machine. The object remains the public domain
 * surface; this component keeps the source accumulator and threshold logic out
 * of the vehicle's movement, occupancy, and rendering code. */
export class VehicleDamageState {
  constructor(readonly state: TrafficState, readonly antiStrength = 1) {
    ensureVehicleDamageState(state);
  }

  receive(damage: number, x: number, y: number) {
    ensureVehicleDamageState(this.state);
    const transition = applyVehicleSourceDamage(this.state, damage, this.antiStrength);
    if (!transition.applied) return transition;
    const c = Math.cos(this.state.rotation), s = Math.sin(this.state.rotation), dx = x - this.state.x, dy = y - this.state.y;
    const localX = dx * c + dy * s, localY = -dx * s + dy * c;
    let side = 3;
    if (localY < 0) {
      if (localX < 0) side = 1;
      else side = 0;
    } else if (localX < 0) side = 2;
    this.state.damageMask = (this.state.damageMask ?? 0) | (1 << side);
    this.state.damageFrame = side;
    return transition;
  }

  tick(): VehicleDamageTransition {
    ensureVehicleDamageState(this.state);
    return tickVehicleDamage(this.state);
  }
}
