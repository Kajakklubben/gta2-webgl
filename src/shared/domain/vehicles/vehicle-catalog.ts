import type { CarPhysics } from '../../engine/loader/gci';
import type { CarInfo } from '../../engine/loader/style-parser';
import { DEFAULT_VEHICLE_BOUNDS, vehicleBounds, type VehicleBounds } from '../../engine/loader/vehicle-bounds';

/** Runtime vehicle metadata used by both gameplay and the physics adapter. */
export interface VehicleRuntimeMetadata {
  readonly model?: number | undefined;
  readonly physics?: CarPhysics | undefined;
  readonly info?: CarInfo | undefined;
  readonly bounds: VehicleBounds;
}

/**
 * Resolves the complete runtime description for a model at one boundary.
 * Keeping physics and CARI dimensions together prevents a car object, traffic,
 * and the native physics adapter from silently selecting different fallback metadata.
 */
export class VehicleCatalog {
  private readonly cache = new Map<number, VehicleRuntimeMetadata>();

  constructor(
    readonly physics: ReadonlyMap<number, CarPhysics> = new Map(),
    readonly bounds: ReadonlyMap<number, VehicleBounds> = new Map(),
    readonly info: ReadonlyMap<number, CarInfo> = new Map(),
  ) {}

  get(model: number | undefined): VehicleRuntimeMetadata {
    if (model === undefined) return { bounds: DEFAULT_VEHICLE_BOUNDS };
    const cached = this.cache.get(model);
    if (cached) return cached;
    const metadata = { model, physics: this.physics.get(model), info: this.info.get(model), bounds: vehicleBounds(model, this.bounds) };
    this.cache.set(model, metadata);
    return metadata;
  }
}
