import type { Input } from '../../protocol/types';
import { step } from './reconciliation';
import type { TrafficState } from '../../protocol/types';
import { occupantForPlayer } from '../../domain/vehicles/vehicle-occupancy';

/** Minimal host surface needed by the local-player prediction adapter. */
export interface PredictionHost {
  readonly localId?: string | undefined;
  readonly gameState: { readonly playerStates: Map<string, unknown> };
  tick: number;
}

/** Return the one vehicle whose chassis may be advanced by this client. */
export function locallyDrivenVehicle(host: any): TrafficState[] {
  if (!host.localId) return [];
  const player = host.gameState.playerStates.get(host.localId);
  if (!player || player.vehicleId === undefined) return [];
  const vehicle = host.gameState.vehicleStates.find((item: TrafficState) => item.id === player.vehicleId);
  if (!vehicle || vehicle.passengers[0] !== host.localId) return [];
  const occupant = occupantForPlayer(vehicle, host.localId);
  if (occupant?.state === 'seated') return [vehicle];
  return [];
}

/** Keep exactly one client-side chassis body for the locally driven vehicle. */
export function syncPredictedVehicleBody(host: any) {
  const driven = locallyDrivenVehicle(host);
  for (const object of host.gameObjects.vehicles) if (object.physicsBody && !driven.some(vehicle => vehicle.id === object.id)) host.destroyVehicleBody(object.id);
  for (const vehicle of driven) {
    if (host.gameObjects.findVehicle(vehicle.id)?.physicsBody) continue;
    const body = host.createVehicleBody(vehicle);
    if (body) host.updateVehicleBodyLayer(vehicle, body);
  }
}

/** Advance only the locally controlled player using the shared fixed-step rules. */
export function predictLocalPlayer(host: PredictionHost, input: Input) {
  if (!host.localId || !host.gameState.playerStates.has(host.localId)) return;
  syncPredictedVehicleBody(host);
  step(host, new Map([[host.localId, input]]), { playerOnly: true });
}

/** Align the shared simulation clock with an authoritative server snapshot. */
export function alignPredictionTick(host: PredictionHost, tick: number) {
  host.tick = Math.max(0, Math.floor(tick));
}
