import type { CarPhysics } from '../../engine/loader/gci';
import { sourceFixedPerTickToWorld } from '../world/world';

export function vehicleGear(linearSpeed: number, physics?: CarPhysics) {
  const speed = Math.abs(linearSpeed), scale = (value: number) => sourceFixedPerTickToWorld(value);
  if (speed > scale(physics?.gear3Speed ?? .165)) return physics?.gear3Multiplier ?? 1;
  if (speed > scale(physics?.gear2Speed ?? .107)) return physics?.gear2Multiplier ?? .75;
  return physics?.gear1Multiplier ?? .55;
}
