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

  private resetToOrdinaryFallback() {
    const state = this.vehicle.mutableVehicleState;
    state.aiActive = true;
    state.aiMode = 'ordinary';
    state.aiTask = 'follow-road';
    state.aiState = state.wrecked ? 'wrecked' : 'cruise';
    state.allowSpecialRoute = false;
    delete state.routeId;
    delete state.routeCursor;
    delete state.arrowCursor;
    delete state.arrowRun;
    delete state.targetDirection;
    delete state.plannedTurn;
    delete state.laneTarget;
    delete state.laneAlignment;
    delete state.targetSpeed;
    delete state.speedClass;
    delete state.yieldTimer;
    delete state.obstacleTimer;
    delete state.offRoadTimer;
    delete state.pursuitTarget;
    delete state.serviceStop;
    state.signal = 'none';
    state.horn = false;
    state.brakeLights = false;
  }

  private initializeAutonomousState() {
    const state = this.vehicle.mutableVehicleState;
    if (state.aiMode === 'inactive' || state.aiActive === false) {
      this.resetToOrdinaryFallback();
      return;
    }
    if (state.aiMode === undefined) {
      if (state.pursuitTarget !== undefined) {
        state.aiMode = 'chase';
        state.aiTask = 'chase';
      } else if (state.transport !== undefined || state.serviceStop !== undefined) {
        state.aiMode = 'service';
        state.aiTask = 'service';
      } else {
        state.aiMode = 'ordinary';
        state.aiTask = 'follow-road';
      }
    }
    state.aiActive = true;
    if (state.aiTask === undefined) {
      state.aiTask = state.aiMode === 'chase' || state.aiMode === 'emergency'
        ? 'chase'
        : state.aiMode === 'service' ? 'service'
          : state.aiMode === 'scripted' ? (state.routeId === undefined ? 'goto' : 'route')
            : 'follow-road';
    }
  }

  /** Remove traffic-only decisions before a player-controlled input is
   * applied. Route nodes remain map metadata, but they are no longer an
   * active AI command while the driver is a player. */
  setPlayerControlMode() {
    const state = this.vehicle.mutableVehicleState;
    const firstPlayerTick = this.controlMode !== 'player';
    this.controlMode = 'player';
    state.aiActive = false;
    state.aiMode = 'inactive';
    state.aiTask = 'none';
    delete state.aiState;
    // RouteNode/targetNode/junction/currentDirection describe where the car
    // came from and remain useful inert navigation metadata. Everything below
    // is an active controller decision and must not survive player takeover.
    delete state.routeId;
    delete state.routeCursor;
    delete state.arrowCursor;
    delete state.arrowRun;
    delete state.targetDirection;
    delete state.plannedTurn;
    delete state.laneTarget;
    delete state.laneAlignment;
    delete state.targetSpeed;
    delete state.speedClass;
    delete state.yieldTimer;
    delete state.obstacleTimer;
    delete state.offRoadTimer;
    delete state.allowSpecialRoute;
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
    const wasPlayerControlled = this.controlMode === 'player';
    this.controlMode = 'ai';
    if (wasPlayerControlled) this.resetToOrdinaryFallback();
    else this.initializeAutonomousState();
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
