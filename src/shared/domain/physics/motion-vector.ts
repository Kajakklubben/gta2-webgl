import { SOURCE_ANG16_CIRCLE } from '../world/world';


export interface Vector2 { x: number; y: number }

/** Convert the source's fixed-point Ang16 turn units to runtime radians. */
export const sourceAngleToRadians = (angle: number) => angle * Math.PI * 2 / SOURCE_ANG16_CIRCLE;

/** World heading convention: rotation 0 points along positive world Y. */
export function directionFromRotation(rotation: number): Vector2 {
  return { x: -Math.sin(rotation), y: Math.cos(rotation) };
}

export function rotationFromDirection(x: number, y: number, fallback = 0): number {
  if (Math.hypot(x, y) < 1e-8) return fallback;
  const angle = Math.atan2(-x, y), fullTurn = Math.PI * 2;
  return (angle % fullTurn + fullTurn) % fullTurn;
}

export function normalizeRotation(rotation: number): number {
  const fullTurn = Math.PI * 2;
  return (rotation % fullTurn + fullTurn) % fullTurn;
}

export function velocityFromRotation(rotation: number, speed: number): Vector2 {
  const direction = directionFromRotation(rotation);
  return { x: direction.x * speed, y: direction.y * speed };
}

export function moveAlongHeading(position: Vector2, rotation: number, speed: number, dt: number) {
  const velocity = velocityFromRotation(rotation, speed);
  return {
    x: position.x + velocity.x * dt,
    y: position.y + velocity.y * dt,
    vx: velocity.x,
    vy: velocity.y,
  };
}

/** Move to a route target and return the heading of the displacement made. */
export function moveTowardTarget(position: Vector2, target: Vector2, speed: number, dt: number) {
  const dx = target.x - position.x, dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  const travel = Math.min(distance, Math.max(0, speed * dt));
  if (distance < 1e-8 || travel < 1e-8) return { x: position.x, y: position.y, dx: 0, dy: 0, distance, arrived: distance <= 1e-8 };
  const movedX = dx / distance * travel, movedY = dy / distance * travel;
  return { x: position.x + movedX, y: position.y + movedY, dx: movedX, dy: movedY, distance, arrived: travel >= distance };
}

