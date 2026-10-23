/** Decoded vehicle data shared by asset loaders and runtime consumers. */

export interface CarPhysics {
  model: number;
  name: string;
  /** Raw numeric fields from the source GCI record, including fields not used by the integrator. */
  sourceFields?: Readonly<Record<string, number>>;
  turbo?: number;
  value?: number;
  pad?: number;
  mass?: number;
  turnIn?: number;
  turnRatio?: number;
  thrust?: number;
  maxSpeed?: number;
  frontDriveBias?: number;
  frontMassBias?: number;
  brakeFriction?: number;
  rearEndStability?: number;
  handbrakeSlideValue?: number;
  gear1Multiplier?: number;
  gear2Multiplier?: number;
  gear3Multiplier?: number;
  gear2Speed?: number;
  gear3Speed?: number;
  skidThreshold?: number;
  antiStrength?: number;
}

/** CARI dimensions are the authored chassis footprint in world pixels. */
export interface VehicleBounds {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_VEHICLE_BOUNDS: VehicleBounds = { width: 36, height: 66 };
