import type { Input, PlayerState } from '../../../protocol/types';
import { WORLD } from '../../../domain/world/world';
import { directionFromRotation, rotationFromDirection } from '../../../domain/physics/motion-vector';
import { PlayerMovementSystem } from '../../player-movement';
import type { MobilePose } from '../stateful';
import type { PlayerObject } from './player';

export function applyPlayerMovement(player: PlayerObject, input: Input, floor: number, dt: number, slippery: boolean) {
  if (player.state.vehicleId !== undefined) return player.driveVehicle(input, dt, slippery);
  new PlayerMovementSystem().update(player.mutablePlayerState, input, floor, dt);
  return true;
}

export function enterPlayerVehicle(player: PlayerObject, vehicleId: number, animation: PlayerState['animation']) {
  player.mutablePlayerState.vehicleId = vehicleId;
  player.mutablePlayerState.animation = animation;
}

export function leavePlayerVehicle(player: PlayerObject, pose: MobilePose, velocity: { vx: number; vy: number }) {
  player.mutablePlayerState.vehicleId = undefined;
  player.mutablePlayerState.animation = undefined;
  player.setPose({ ...pose, vx: velocity.vx, vy: velocity.vy });
  stopPlayerMovement(player);
}

export function stopPlayerMovement(player: PlayerObject) {
  const movement = player.mutablePlayerState.movement;
  if (movement) { movement.speed = 0; movement.turnSpeed = 0; movement.moveDirection = 0; }
}

export function resetPlayerMotion(player: PlayerObject) {
  player.mutablePlayerState.vx = 0;
  player.mutablePlayerState.vy = 0;
  player.mutablePlayerState.jump = undefined;
  stopPlayerMovement(player);
}

export function beginPlayerJump(player: PlayerObject, input: Input, floor: number) {
  const state = player.mutablePlayerState;
  if (state.jump || state.vehicleId !== undefined || state.combat.respawn > 0 || state.combat.health <= 0) return false;
  let x = 0, y = 0;
  if (input.moveX !== undefined && input.moveY !== undefined && Math.hypot(input.moveX, input.moveY) > 1e-6) {
    const length = Math.hypot(input.moveX, input.moveY); x = input.moveX / length; y = input.moveY / length;
  } else {
    const direction = directionFromRotation(state.rotation), reverse = Boolean(input.keys & 2) && !(input.keys & 1);
    const directionScale = reverse ? -1 : 1;
    x = direction.x * directionScale; y = direction.y * directionScale;
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > 1e-6) { x = state.vx / speed; y = state.vy / speed; }
  }
  const speed = Math.max(WORLD.player.jumpSpeed, Math.hypot(state.vx, state.vy));
  state.jump = { phase: 'rising', progress: 0, height: 0, baseZ: Math.max(floor + 1, state.z), vx: x * speed, vy: y * speed, vehicleCollision: false };
  state.z = state.jump.baseZ; state.vx = state.jump.vx; state.vy = state.jump.vy;
  if (x || y) state.rotation = rotationFromDirection(x, y, state.rotation);
  return true;
}

export function updatePlayerJump(player: PlayerObject, dt: number) {
  const state = player.mutablePlayerState, jump = state.jump;
  if (!jump) return false;
  if (state.vehicleId !== undefined) { state.jump = undefined; return true; }
  jump.progress = Math.min(1, jump.progress + dt / WORLD.player.jumpDuration);
  if (jump.progress >= 1) { state.z = jump.baseZ; state.vx = jump.vx; state.vy = jump.vy; state.jump = undefined; return true; }
  if (jump.progress < .35) jump.phase = 'rising'; else if (jump.progress > .65) jump.phase = 'falling'; else jump.phase = 'apex';
  jump.height = Math.sin(Math.PI * jump.progress) * WORLD.player.jumpHeight;
  state.z = jump.baseZ; state.vx = jump.vx; state.vy = jump.vy;
  return true;
}
