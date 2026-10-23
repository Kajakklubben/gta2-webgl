import type { CarPhysics } from '../../engine/loader/gci';
import { directionFromRotation } from './motion-vector';
import type { Vector2 } from './motion-vector';
import { vehicleCenterOfMassOffset, vehicleMass, vehicleMomentOfInertia, type VehicleDynamicsState, type VehicleGeometry } from './vehicle-kinematics';

/** Apply a world force at a chassis point, returning its scalar torque. */
export function applyForceAtPoint(force: Vector2, point: Vector2, center = { x: 0, y: 0 }) {
  const rx = point.x - center.x, ry = point.y - center.y;
  return { force, torque: rx * force.y - ry * force.x };
}

/** Apply a contact impulse at the actual chassis point (source impulse path). */
export function applyVehicleImpulse(state: VehicleDynamicsState, impulse: Vector2, point: Vector2, geometry: VehicleGeometry = {}, physics?: CarPhysics, sign = 1) {
  const mass = vehicleMass(physics), moment = vehicleMomentOfInertia(geometry.width ?? 36, geometry.height ?? 66, physics);
  const ix = impulse.x * sign, iy = impulse.y * sign;
  state.vx += ix / mass; state.vy += iy / mass;
  const forward = directionFromRotation(state.rotation), centerOffset = vehicleCenterOfMassOffset(geometry.height ?? 66, physics);
  const centerX = state.x + forward.x * centerOffset, centerY = state.y + forward.y * centerOffset;
  const rx = point.x - centerX, ry = point.y - centerY;
  state.angularVelocity += (rx * iy - ry * ix) / moment;
  state.speed = state.vx * forward.x + state.vy * forward.y;
  return state;
}
