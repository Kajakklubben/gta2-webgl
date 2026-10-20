import type { Input, PlayerMovementState, PlayerState } from '../protocol/types';
import { directionFromRotation, normalizeRotation, rotationFromDirection, sourceAngleToRadians } from '../domain/physics/motion-vector';
import { WORLD, sourceFixedRawPerTickToWorld, tilesPerSecondToWorld } from '../domain/world/world';

/** On-foot movement rules shared by the server and local prediction. */
export class PlayerMovementSystem {
  /** Ensure snapshots from older clients still get the source movement state. */
  private movementState(player: PlayerState): PlayerMovementState {
    if (player.movement) return player.movement;
    const forward = directionFromRotation(player.rotation);
    const signedSpeed = player.vx * forward.x + player.vy * forward.y;
    let moveDirection: -1 | 0 | 1 = 0;
    if (signedSpeed < -1e-6) moveDirection = -1;
    else if (signedSpeed > 1e-6) moveDirection = 1;
    return player.movement = {
      speed: Math.max(0, Math.abs(signedSpeed)),
      turnSpeed: 0,
      moveDirection,
    };
  }

  /** Player::DoPedControlInputs_566C80 plus Char_B4's per-tick rotation step. */
  private advanceTurn(player: PlayerState, movement: PlayerMovementState, keys: number, dt: number) {
    const left = (keys & 4) !== 0, right = (keys & 8) !== 0;
    const frames = Math.max(0, dt * WORLD.tickRate);
    if (!left && !right) {
      // The source deliberately drops turn speed to zero as soon as neither
      // steering key is held; it does not coast through the last heading.
      movement.turnSpeed = 0;
    } else {
      const source = WORLD.player.source;
      const jumping = Boolean(player.jump);
      let acceleration: number = source.turnAcceleration;
      if (jumping) acceleration = source.jumpTurnAcceleration;
      else if ((keys & 0x10) !== 0 && (keys & 1) === 0) acceleration = source.attackTurnAcceleration;
      let limit: number = source.maxTurnSpeed;
      if (jumping) limit = source.maxJumpTurnSpeed;
      // Keep the source's right-then-left order. Pressing both keys usually
      // cancels, but at a clamp boundary the second operation still changes
      // the stored turn speed in the original game.
      if (right) movement.turnSpeed = Math.max(-limit, Math.min(limit, movement.turnSpeed - acceleration * frames));
      if (left) movement.turnSpeed = Math.max(-limit, Math.min(limit, movement.turnSpeed + acceleration * frames));
    }
    // Char_B4 adds the already-accelerated Ang16 turn speed once per fixed
    // update. Multiplying by frame count keeps this helper deterministic if a
    // caller uses a different fixed-step duration in a test.
    player.rotation = normalizeRotation(player.rotation + sourceAngleToRadians(movement.turnSpeed * frames));
  }

  /** Char_B4 approaches its authored run speed by 64 raw Fix16 units/tick. */
  private advanceSpeed(movement: PlayerMovementState, target: number, dt: number) {
    const frames = Math.max(0, dt * WORLD.tickRate);
    if (movement.speed <= 1e-6) {
      movement.speed = target;
      return;
    }
    const step = sourceFixedRawPerTickToWorld(WORLD.player.source.speedAcceleration) * frames;
    movement.speed += Math.max(-step, Math.min(step, target - movement.speed));
  }

  private setFloorHeight(player: PlayerState, floor: number, dt: number) {
    const jump = player.jump;
    if (jump) {
      player.z = Math.max(jump.baseZ, floor + 1);
      return;
    }
    if (player.z < floor + 1) player.z = floor + 1;
    else player.z = Math.max(floor + 1, player.z - 1.5 * dt);
  }

  update(player: PlayerState, input: Input, floor: number, dt: number) {
    const keys = input.keys;
    const jump = player.jump;
    const movement = this.movementState(player);
    const walkSpeed = tilesPerSecondToWorld(WORLD.player.walkSpeed);
    let speedMultiplier = 1;
    if (keys & 32) speedMultiplier = WORLD.player.sprintMultiplier;
    const targetSpeed = walkSpeed * speedMultiplier;

    if (input.moveX !== undefined && input.moveY !== undefined) {
      const length = Math.hypot(input.moveX, input.moveY);
      if (length > 1e-6) {
        const x = input.moveX / length, y = input.moveY / length;
        player.rotation = rotationFromDirection(x, y, player.rotation);
        movement.turnSpeed = 0;
        movement.moveDirection = 1;
        this.advanceSpeed(movement, targetSpeed, dt);
        const velocity = directionFromRotation(player.rotation);
        player.vx = velocity.x * movement.speed; player.vy = velocity.y * movement.speed;
        if (jump) { jump.vx = player.vx; jump.vy = player.vy; }
      } else if (jump) {
        player.vx = jump.vx; player.vy = jump.vy;
        movement.moveDirection = 0;
      } else {
        movement.speed = 0; movement.turnSpeed = 0; movement.moveDirection = 0;
        player.vx = player.vy = 0;
      }
      this.setFloorHeight(player, floor, dt);
      return;
    }

    this.advanceTurn(player, movement, keys, dt);
    // CharacterControls gives forward priority when both pedals are pressed.
    let moveDirection: -1 | 0 | 1 = 0;
    if (keys & 1) moveDirection = 1;
    else if (keys & 2) moveDirection = -1;
    movement.moveDirection = moveDirection;

    if (jump) {
      // Char_B4's jumping branch only accelerates for a positive move
      // direction; reverse and neutral both use the fixed run/jump speed.
      if (moveDirection > 0) this.advanceSpeed(movement, targetSpeed, dt);
      else movement.speed = WORLD.player.jumpSpeed;
    } else if (moveDirection === 0) {
      movement.speed = 0;
    } else {
      let desiredSpeed = targetSpeed;
      if (moveDirection < 0) desiredSpeed = walkSpeed;
      this.advanceSpeed(movement, desiredSpeed, dt);
    }

    if (jump) {
      const velocity = directionFromRotation(player.rotation);
      jump.vx = velocity.x * movement.speed; jump.vy = velocity.y * movement.speed;
      player.vx = jump.vx; player.vy = jump.vy;
    } else {
      // Reverse is represented as a temporary 180-degree movement heading;
      // Char_B4 restores the ped's original facing after applying the step.
      let heading = player.rotation;
      if (moveDirection < 0) heading += Math.PI;
      const velocity = directionFromRotation(heading);
      player.vx = velocity.x * movement.speed; player.vy = velocity.y * movement.speed;
    }
    this.setFloorHeight(player, floor, dt);
  }
}
