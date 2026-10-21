import type { Gta2Game } from '../../shared/game/gta2-game';
import { occupantForPlayer, vehicleDoorPoint } from '../../shared/domain/vehicles/vehicle-occupancy';

type EntryTrace = { vehicleId: number; occupantState: string; door: number; x: number; y: number };

export function createVehicleEntryTracer() {
  const traces = new Map<string, EntryTrace>();
  const log = (label: string, details: Record<string, unknown>) => console.info(`[vehicle-entry][client] ${label} ${JSON.stringify(details)}`);
  return {
    clear: () => traces.clear(),
    log(currentGame: Gta2Game, playerId: string) {
      const previous = traces.get(playerId);
      const player = currentGame.gameState.playerStates.get(playerId);
      const vehicleId = player?.vehicleId;
      const vehicle = vehicleId === undefined ? undefined : currentGame.gameState.vehicleStates.find(item => item.id === vehicleId);
      const occupant = vehicle === undefined ? undefined : occupantForPlayer(vehicle, playerId);
      const vehicleObject = vehicle === undefined ? undefined : currentGame.gameObjects.findVehicle(vehicle.id);
      if (!player || !vehicle || !occupant || !vehicleObject) {
        if (previous) log('entry ended', { playerId, previous, playerVehicleId: vehicleId });
        traces.delete(playerId);
        return;
      }
      const point = vehicleDoorPoint(vehicle, occupant.door, vehicleObject.info, vehicleObject.bounds);
      const distance = Math.hypot(point.outsideX - player.x, point.outsideY - player.y);
      const sameEntry = previous?.vehicleId === vehicle.id && previous.door === occupant.door;
      const movement = sameEntry && previous ? { x: player.x - previous.x, y: player.y - previous.y } : undefined;
      const moved = movement !== undefined && Math.hypot(movement.x, movement.y) > 1e-6;
      const stateChanged = previous?.occupantState !== occupant.state;
      if (occupant.state === 'approaching') log('approaching door', { playerId, vehicleId: vehicle.id, seat: vehicle.passengers.indexOf(playerId), door: occupant.door, player: { x: player.x, y: player.y, z: player.z }, target: { x: point.outsideX, y: point.outsideY, z: vehicle.z }, distance, movement, movementStatus: movement === undefined ? 'first-observation' : moved ? 'moved' : 'not-moving', doorPhase: vehicle.doorStates[occupant.door]?.phase, vehicle: { x: vehicle.x, y: vehicle.y, vx: vehicle.vx, vy: vehicle.vy, rotation: vehicle.rotation } });
      else if (stateChanged) log('state transition', { playerId, vehicleId: vehicle.id, from: previous?.occupantState, to: occupant.state, door: occupant.door, distance, progress: occupant.progress, doorPhase: vehicle.doorStates[occupant.door]?.phase });
      traces.set(playerId, { vehicleId: vehicle.id, occupantState: occupant.state, door: occupant.door, x: player.x, y: player.y });
    },
  };
}
