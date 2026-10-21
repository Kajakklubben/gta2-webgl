import type { Input } from '../../../protocol/types';
import type { VehicleControl } from '../../../domain/physics/vehicle-kinematics';
import { occupantForPlayer } from '../../../domain/vehicles/vehicle-occupancy';
import type { VehicleObject } from './vehicle';
import type { VehicleControlAdapter } from './vehicle-control';

/** Owns the boundary between traffic control and player control for a car.
 * The vehicle remains the only object that applies drivetrain input; this
 * controller only decides which source is currently allowed to do so. */
export class VehicleAiController implements VehicleControlAdapter {
  readonly mode = 'ai' as const;
  private controlMode: 'ai' | 'player' | undefined;

  constructor(private readonly vehicle: VehicleObject) {}

  /** Remove traffic-only decisions before a player-controlled input is
   * applied. Route nodes remain map metadata, but they are no longer an
   * active AI command while the driver is a player. */
  setPlayerControlMode() {
    const state = this.vehicle.mutableVehicleState;
    const firstPlayerTick = this.controlMode !== 'player';
    this.controlMode = 'player';
    delete state.aiState;
    state.signal = 'none';
    delete state.serviceStop;
    delete state.pursuitTarget;
    state.horn = false;
    state.brakeLights = false;
    if (firstPlayerTick) {
      state.brakePressure = 0;
      state.handbrakeForce = 0;
    }
  }

  /** Mark the chassis as available to the traffic controller again. */
  setAutonomousControlMode() {
    this.controlMode = 'ai';
  }

  isDriven() {
    const driver = this.vehicle.driver;
    let occupant: ReturnType<typeof occupantForPlayer>;
    if (driver !== undefined) occupant = occupantForPlayer(this.vehicle.mutableVehicleState, driver);
    return Boolean(occupant && occupant.state !== 'exiting');
  }

  isPlayerDriven() {
    const driver = this.vehicle.driver;
    return Boolean(driver && !driver.startsWith('npc:') && this.isDriven());
  }

  updateUnoccupied(dt: number, control: VehicleControl = { throttle: 0, steer: 0 }) {
    if (this.isPlayerDriven()) return false;
    this.vehicle.drive(control, this.vehicle.physics, dt, { applyDrivetrainForces: control.throttle !== 0 || Boolean(control.brake) });
    return true;
  }

  applyDriverInput(_playerId: string, _input: Input, _dt: number, _slippery = false) {
    return false;
  }

  canApplyDriverInput(_playerId: string, _input: Input) {
    return false;
  }
}
