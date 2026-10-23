import type { CarInfo } from './models/style';
import type { VehicleBounds } from './models/vehicles';

export type { VehicleBounds } from './models/vehicles';

/** CARI dimensions are the authored chassis footprint in world pixels, not padded sprite dimensions. */
export const DEFAULT_VEHICLE_BOUNDS: VehicleBounds = { width: 36, height: 66 };
export function loadVehicleBounds(cars: readonly Pick<CarInfo, 'model' | 'width' | 'height'>[]): ReadonlyMap<number, VehicleBounds> {
  return new Map(cars.filter(car => Number.isFinite(car.width) && car.width > 0 && Number.isFinite(car.height) && car.height > 0)
    .map(car => [car.model, { width: car.width, height: car.height }]));
}
export function vehicleBounds(model: number | undefined, metadata: ReadonlyMap<number, VehicleBounds>): VehicleBounds {
  if (model === undefined) return DEFAULT_VEHICLE_BOUNDS;
  return metadata.get(model) ?? DEFAULT_VEHICLE_BOUNDS;
}
