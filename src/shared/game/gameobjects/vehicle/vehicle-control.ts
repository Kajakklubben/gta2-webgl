import type { Input } from '../../../protocol/types';
import type { VehicleControl } from '../../../domain/physics/vehicle-kinematics';

export type VehicleControlMode = 'ai' | 'player';

/** The exclusive source allowed to drive a vehicle's chassis. A vehicle owns
 * one active adapter at a time; occupancy, weapons, and rendering remain
 * separate concerns. */
export interface VehicleControlAdapter {
  readonly mode: VehicleControlMode;
  updateUnoccupied(dt: number, control?: VehicleControl): boolean;
  canApplyDriverInput(playerId: string, input: Input): boolean;
  applyDriverInput(playerId: string, input: Input, dt: number, slippery?: boolean): boolean;
}
