import type { HazardState, Input } from '../../../protocol/types';
import type { GameObjectCombatContext } from '../gameobject';
import { createHazardObject, ExplosionObject } from '../../effects/hazard';
import type { MobilePose } from '../stateful';
import type { PlayerObject } from '../player/player';
import type { NpcObject } from '../npc';
import type { CarInfo } from '../../../engine/loader/style-parser';
import type { VehicleBounds } from '../../../engine/loader/vehicle-bounds';
import { sourceAnimationFrame } from '../../../domain/animation';
import { directionFromRotation, rotationFromDirection } from '../../../domain/physics/motion-vector';
import { WORLD, sourceFixedPerTickToWorld, tilesPerSecondToWorld } from '../../../domain/world/world';
import {
  addVehicleOccupant,
  closeVehicleDoor,
  occupantForPlayer,
  openVehicleDoor,
  removeVehicleOccupant,
  syncVehiclePassengers,
  vehiclePassengerIndex,
  tickVehicleDoors,
  vehicleDoorAlignment,
  vehicleDoorPoint,
  vehicleEntryAlignmentPhase,
  vehicleExitAlignmentPhase,
} from '../../../domain/vehicles/vehicle-occupancy';
import { GTA2_VEHICLE_DAMAGE } from '../../../domain/combat/vehicle-damage';
import { WeaponId } from '../../../domain/combat/weapons';
import { GTA2_EXPLOSION_VISUAL_TICKS, GTA2_SOURCE_OBJECT_MODELS } from '../../../domain/world/gta2-sprites';
import {
  SOURCE_MINE_DROP_REAR_CLEARANCE,
  SOURCE_MINE_DROP_REAR_PADDING,
  SOURCE_OIL_DROP_REAR_PADDING,
  SOURCE_OIL_DROP_SIDE_OFFSET,
} from '../../../domain/physics/vehicle-skid';
import type { VehicleObject } from './vehicle';
import type { VehicleControlAdapter } from './vehicle-control';
import type { VehicleControl } from '../../../domain/physics/vehicle-kinematics';
import { SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS } from '../../../domain/vehicles/vehicle-weapons';

export type VehicleEntryCandidate = {
  door: number;
  seat: number;
  role: 'driver' | 'passenger';
  outsideX: number;
  outsideY: number;
  straightEntry: boolean;
};

export interface VehicleObjectContext {
  readonly metadata: { readonly info?: CarInfo; readonly bounds: VehicleBounds };
  readonly playerFor: (id: string) => PlayerObject | undefined;
  readonly npcFor: (id: string) => NpcObject | undefined;
  readonly setPlayerBodyPose: (player: PlayerObject) => void;
  readonly damagePlayer: (player: PlayerObject, damage: number) => void;
  readonly damageNpc: (npc: NpcObject, damage: number) => void;
  readonly onVehicleExit: (player: PlayerObject) => void;
}

/** Player-facing behavior for a vehicle: seats, doors, entry/exit animation,
 * mounted weapons, and delegating driver input back to the chassis. */
export class VehiclePlayerController implements VehicleControlAdapter {
  readonly mode = 'player' as const;

  constructor(private readonly vehicle: VehicleObject) {}

  updateUnoccupied(_dt: number, _control: VehicleControl = { throttle: 0, steer: 0 }) {
    return false;
  }

  canApplyDriverInput(playerId: string, input: Input) {
    const state = this.vehicle.mutableVehicleState;
    const occupant = occupantForPlayer(state, playerId);
    return this.vehicle.driver === playerId && Boolean(occupant) && (
      occupant?.state === 'seated' || (occupant?.state === 'entering' && (input.keys & 0x0f) !== 0)
    );
  }

  syncSeatedOccupants(context: VehicleObjectContext) {
    const state = this.vehicle.mutableVehicleState;
    for (const occupant of state.occupants) {
      if (occupant.state !== 'seated') continue;
      const player = context.playerFor(occupant.id);
      if (player) {
        player.followVehicle(this.vehicle.vehiclePose());
        player.transitionAnimation({ kind: 'seated', progress: 1 });
        context.setPlayerBodyPose(player);
        continue;
      }
      if (occupant.id.startsWith('npc:')) {
        const npc = context.npcFor(occupant.id);
        if (npc) {
          const index = state.passengers.indexOf(occupant.id);
          npc.syncVehicleOccupancy(state.id, 'idle', undefined, undefined, index === 0 ? 'driving' : 'entering');
          npc.followVehicle(this.vehicle.vehiclePose());
        }
      }
    }
  }

  canFireWeapon(sourceType: number, occupantId: string) {
    const state = this.vehicle.mutableVehicleState;
    // Weapon_30 resolves every mounted dispatch through GetDriver(). A
    // seated passenger may occupy a slot, but cannot own the vehicle weapon
    // state or the car-bomb attribution transition.
    if (this.vehicle.driver !== occupantId || !occupantForPlayer(state, occupantId) || !this.vehicle.alive) return false;
    if (sourceType === 18) return state.mountedWeapons?.includes(sourceType) === true;
    const model = this.vehicle.info?.model ?? state.model;
    if (sourceType === 19) return model === 54;
    if (sourceType === 20 || sourceType === 21) return model === 17;
    if (sourceType === 22) return model === 22;
    return sourceType === 15 || sourceType === 23;
  }

  /** Weapon_30::car_bomb_5E0AB0 delegates to Car_BC::FireCarBomb rather than
   * spawning a forward projectile. Both the normal and instant dispatches
   * resolve against the driver's own chassis; the source's instant flag only
   * changes which car-bomb animation is used before this damage transition. */
  fireCarBomb(actor: PlayerObject, instant: boolean, combat: GameObjectCombatContext) {
    const state = this.vehicle.mutableVehicleState;
    if (this.vehicle.driver !== actor.id || !this.vehicle.alive) return false;
    let target = this.vehicle;
    if (state.trailerId !== undefined) {
      const trailer = combat.findVehicle(state.trailerId);
      if (trailer) {
        target = trailer;
        state.trailerId = undefined;
        trailer.mutableVehicleState.trailerId = undefined;
      }
    }
    if (!instant) {
      target.spawn(createHazardObject({
        id: combat.nextHazardId(), x: target.state.x, y: target.state.y, z: target.state.z,
        kind: 'fire', life: SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS + GTA2_EXPLOSION_VISUAL_TICKS, owner: actor.id,
        effect: 'fire', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
        armingTimer: SOURCE_NORMAL_CAR_BOMB_ANIMATION_TICKS, vehicleId: target.id,
      }));
      return true;
    }
    const explosion = createHazardObject({
      id: combat.nextHazardId(), x: target.state.x, y: target.state.y, z: target.state.z,
      kind: 'fire', life: GTA2_EXPLOSION_VISUAL_TICKS, owner: actor.id,
      effect: 'explosion', explosionType: 'large', sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
    });
    if (explosion instanceof ExplosionObject) {
      explosion.armBlast({
        actor: actor.id, weapon: instant ? 23 : 15,
        radius: instant ? 180 : 110, damage: GTA2_VEHICLE_DAMAGE.maxDamage,
        pellets: 1, selfDamage: true, height: instant ? 3 : 2, knockback: instant ? 16 : 10, sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb,
      });
      target.spawn(explosion);
      explosion.resolveBlast(combat);
    }
    combat.emit({ type: 'explosion', actor: actor.id, weapon: instant ? WeaponId.SpecialVehicleBomb : WeaponId.CarBomb, damage: GTA2_VEHICLE_DAMAGE.maxDamage, x: target.state.x, y: target.state.y, z: target.state.z });
    return true;
  }

  /** Return the authored muzzle points for vehicle weapons. The combat phase
   * decides whether a shot is requested; the vehicle owns its local geometry
   * and rotation mapping. */
  weaponOrigins(sourceType: number, occupantId: string) {
    const state = this.vehicle.mutableVehicleState;
    if (!occupantForPlayer(state, occupantId)) return [] as { x: number; y: number; angle: number }[];
    if (!this.canFireWeapon(sourceType, occupantId)) return [] as { x: number; y: number; angle: number }[];
    const forward = directionFromRotation(state.rotation);
    const right = { x: Math.cos(state.rotation), y: Math.sin(state.rotation) };
    const turret = state.turretRotation ?? state.rotation;
    const point = (localX: number, localY: number, gunOffset: number, angle = state.rotation) => {
      const chassisOffset = { x: right.x * localX + forward.x * localY, y: right.y * localX + forward.y * localY };
      const gunDirection = directionFromRotation(angle);
      const origin = {
        x: state.x + chassisOffset.x + gunDirection.x * gunOffset,
        y: state.y + chassisOffset.y + gunDirection.y * gunOffset,
      };
      const rotationalX = -state.angularVelocity * (origin.y - state.y);
      const rotationalY = state.angularVelocity * (origin.x - state.x);
      return { ...origin, angle, vx: state.vx + rotationalX, vy: state.vy + rotationalY };
    };
    if (sourceType === 18) {
      const halfWidth = this.vehicle.bounds.width * .5;
      const tmpX = -8 + halfWidth, tmpY = 1 + this.vehicle.bounds.height * .5;
      return [tmpX, -tmpX].map(localX => point(localX, tmpY, 0));
    }
    if (sourceType === 20 || sourceType === 21) return [point(0, 8, 14, turret + Math.PI)];
    if (sourceType === 19) return [point(0, 8, 30, turret)];
    if (sourceType === 22) return [point(0, -18, 6, turret)];
    return [];
  }

  /** Compute the source drop point behind this chassis for mines and oil. */
  rearHazardPoint(sourceType: number, ammo: number) {
    const state = this.vehicle.mutableVehicleState;
    const forward = directionFromRotation(state.rotation);
    const right = { x: Math.cos(state.rotation), y: Math.sin(state.rotation) };
    const oil = sourceType === 16;
    const mine = sourceType === 17;
    if (!oil && !mine) return undefined;
    let localX = 0;
    if (oil) localX = (ammo % 2 ? -1 : 1) * SOURCE_OIL_DROP_SIDE_OFFSET;
    const localY = oil
      ? -(this.vehicle.bounds.height + SOURCE_OIL_DROP_REAR_PADDING) * .5
      : -(SOURCE_MINE_DROP_REAR_CLEARANCE + (SOURCE_MINE_DROP_REAR_PADDING + this.vehicle.bounds.height) * .5);
    return {
      x: state.x + right.x * localX + forward.x * localY,
      y: state.y + right.y * localX + forward.y * localY,
      z: state.z,
    };
  }

  /** Deploy a vehicle-mounted mine or oil slick. The vehicle owns the authored
   * rear offset and occupancy rule; the context supplies map validation and
   * lifecycle allocation. */
  deployHazard(actor: PlayerObject, weaponId: number, combat: GameObjectCombatContext) {
    const state = this.vehicle.mutableVehicleState;
    if (this.vehicle.driver !== actor.id || !this.vehicle.alive) return false;
    const weapon = combat.weaponSystem.get(weaponId);
    if (weapon.kind !== 'slick' && weapon.kind !== 'mine') return false;
    const point = this.rearHazardPoint(weapon.sourceType, actor.ammoFor(weaponId));
    if (!point || !combat.canPlaceHazard(point.x, point.y, state.z)) return false;
    const surface = combat.surfaceAt(point.x, point.y, state.z);
    const support = surface[0];
    const hazard: HazardState = {
      id: combat.nextHazardId(), x: point.x, y: point.y, z: support?.height ?? point.z,
      kind: 'slick',
      life: Number.MAX_SAFE_INTEGER,
      owner: actor.id,
      sourceModel: weapon.sourceModel,
      rotation: state.rotation,
    };
    if (support) hazard.collisionLayer = support.collisionLayer;
    if (weapon.kind === 'mine') {
      hazard.kind = 'mine';
    }
    this.vehicle.spawn(createHazardObject(hazard));
    return true;
  }

  /** Consume input from the player object that owns the driver seat. The car
   * owns throttle, steering, braking and its resulting velocity; the player
   * object only decides to delegate here. */
  applyDriverInput(playerId: string, input: Input, dt: number, slippery = false) {
    const state = this.vehicle.mutableVehicleState;
    if (!this.canApplyDriverInput(playerId, input)) return false;

    const keys = input.keys;
    const forward = directionFromRotation(state.rotation);
    const longitudinal = state.vx * forward.x + state.vy * forward.y;
    let steer = 0;
    if (keys & 4) steer += 1;
    if (keys & 8) steer -= 1;
    let braking = false;
    let throttle = 0;

    if (input.moveX !== undefined && input.moveY !== undefined) {
      // A joystick supplies the desired driving direction. When the direction
      // is behind the chassis, keep the car pointed forward and use reverse
      // throttle instead of turning the car around.
      const length = Math.hypot(input.moveX, input.moveY);
      if (length > 1e-6) {
        const x = input.moveX / length, y = input.moveY / length;
        const alignment = x * forward.x + y * forward.y;
        const reversing = alignment < -.15;
        let headingX = x;
        let headingY = y;
        if (reversing) {
          headingX = -x;
          headingY = -y;
        }
        let headingError = rotationFromDirection(headingX, headingY, state.rotation) - state.rotation;
        while (headingError > Math.PI) headingError -= Math.PI * 2;
        while (headingError < -Math.PI) headingError += Math.PI * 2;
        const desiredSteer = Math.max(-1, Math.min(1, headingError / (Math.PI * .5)));
        // The desired vector has already been flipped into the car's forward
        // heading when reversing. The vehicle integrator applies the reverse
        // wheel geometry itself; inverting steering here would swap left/right.
        steer = desiredSteer;
        const lowSpeedThreshold = sourceFixedPerTickToWorld(WORLD.vehicle.source.velocityZeroThreshold);
        braking = reversing && longitudinal > lowSpeedThreshold;
        throttle = Math.max(-1, Math.min(1, alignment));
        if (braking) throttle = 0;
        if (throttle > 0 && (keys & 32)) throttle *= WORLD.vehicle.boostMultiplier;
      }
    } else {
      const reversePressed = !!(keys & 2);
      // HandleUserInputs_55A860 turns the backward pedal into foot brake while
      // the car is moving forward, then allows reverse once it is nearly still.
      braking = reversePressed && longitudinal > 8;
      throttle = 0;
      if (keys & 1) {
        throttle = 1;
        if (keys & 32) throttle = WORLD.vehicle.boostMultiplier;
      } else if (reversePressed && !braking) throttle = -1;
    }

    this.vehicle.setBrakeLights(braking);
    this.vehicle.drive({ throttle, steer, brake: braking, slippery }, this.vehicle.physics, dt);
    return true;
  }

  /** CarThief_AI/transport services use the same ordered occupancy state as a
   * player, but NPC occupants are seated immediately and never need a door
   * animation on the network. */
  beginNpcEntry(npc: NpcObject, context: VehicleObjectContext) {
    const state = this.vehicle.mutableVehicleState;
    if (!this.vehicle.alive || state.doorLock === 'locked') return false;
    const occupant = { id: `npc:${npc.id}`, door: 0, state: 'seated' as const, progress: 1 };
    if (!addVehicleOccupant(state, occupant, context.metadata.info, context.metadata.bounds)) return false;
    npc.syncVehicleOccupancy(state.id, 'idle', undefined, undefined, state.passengers[0] === occupant.id ? 'driving' : 'entering');
    npc.followVehicle(this.vehicle.vehiclePose());
    return true;
  }

  updateOccupancy(dt: number, context: VehicleObjectContext) {
    const state = this.vehicle.mutableVehicleState;
    tickVehicleDoors(state);
    const occupants = state.occupants;
    for (const occupant of [...occupants]) {
      if (occupant.id.startsWith('npc:')) {
        const npc = context.npcFor(occupant.id);
        if (!npc) {
          removeVehicleOccupant(state, occupant.id);
          continue;
        }
        const index = state.passengers.indexOf(occupant.id);
        npc.syncVehicleOccupancy(state.id, 'idle', undefined, undefined, index === 0 ? 'driving' : 'entering');
        npc.followVehicle(this.vehicle.vehiclePose());
        continue;
      }

      const player = context.playerFor(occupant.id);
      if (!player) {
        removeVehicleOccupant(state, occupant.id);
        continue;
      }
      const entityState = player.state;
      const setTransitionAnimation = (kind: 'entering' | 'exiting' | 'seated', progress: number, straightEntry?: boolean) => {
        if (kind === 'seated') player.transitionAnimation({ kind, progress: 1 });
        else player.transitionAnimation({ kind, progress, straightEntry });
      };
      const point = vehicleDoorPoint(state, occupant.door, context.metadata.info, context.metadata.bounds);

      if (occupant.state === 'approaching') {
        const dx = point.outsideX - entityState.x;
        const dy = point.outsideY - entityState.y;
        const distance = Math.hypot(dx, dy);
        const travel = Math.min(distance, tilesPerSecondToWorld(WORLD.player.walkSpeed) * dt);
        if (distance > 1e-4 && travel > 0) {
          const speed = tilesPerSecondToWorld(WORLD.player.walkSpeed);
          player.setPose({
            ...this.entityPose(entityState),
            x: entityState.x + dx / distance * travel,
            y: entityState.y + dy / distance * travel,
            rotation: Math.atan2(-dx, dy),
            vx: dx / distance * speed,
            vy: dy / distance * speed,
          });
        }
        if (distance <= WORLD.player.radius * 1.5 || travel >= distance - 1e-4) {
          player.setPose({ ...this.entityPose(entityState), x: point.outsideX, y: point.outsideY, rotation: state.rotation, vx: 0, vy: 0 });
          const door = state.doorStates[occupant.door];
          // Reserve the seat while approaching, but do not open the door until
          // the ped has reached its authored outside marker. The source opens
          // the selected door from the close-up car interaction state.
          if (door?.phase === 'closed' || door?.phase === 'closing') openVehicleDoor(state, occupant.door, occupant.id);
          if (door?.phase === 'open') {
            occupant.state = 'entering';
            occupant.progress = 0;
            setTransitionAnimation('entering', 0, point.straightEntry);
          }
        }
      } else if (occupant.state === 'entering') {
        const door = state.doorStates[occupant.door];
        // Opening is a distinct phase: keep the ped at the outside pose until
        // the door has completed its animation, then start the entry frames.
        if (door?.phase !== 'open') {
          if (door?.phase === 'closed' || door?.phase === 'closing') openVehicleDoor(state, occupant.door, occupant.id);
          player.setPose({ ...this.entityPose(entityState), x: point.outsideX, y: point.outsideY, rotation: state.rotation, vx: 0, vy: 0 });
          setTransitionAnimation('entering', 0, point.straightEntry);
          continue;
        }
        const previousProgress = occupant.progress;
        const progress = Math.min(1, previousProgress + 1 / WORLD.vehicle.occupancyTransitionTicks);
        occupant.progress = progress;
        setTransitionAnimation('entering', progress, occupant.straightEntry);
        let frame = sourceAnimationFrame('entering', progress);
        if (progress >= 1) frame = 8;
        const phase = vehicleEntryAlignmentPhase(frame, point.straightEntry);
        const alignment = vehicleDoorAlignment(state, occupant.door, phase, context.metadata.info, context.metadata.bounds);
        player.setPose({ ...this.entityPose(entityState), x: alignment.x, y: alignment.y, rotation: alignment.rotation });
        if (progress >= 1 && previousProgress >= 1 && door.phase === 'open') {
          occupant.state = 'seated';
          occupant.progress = 1;
          setTransitionAnimation('seated', 1);
          player.followVehicle(this.vehicle.vehiclePose());
          closeVehicleDoor(state, occupant.door);
        }
      } else if (occupant.state === 'exiting') {
        const previousProgress = occupant.progress;
        const progress = Math.min(1, previousProgress + 1 / WORLD.vehicle.occupancyTransitionTicks);
        occupant.progress = progress;
        setTransitionAnimation('exiting', progress, occupant.straightEntry);
        const frame = sourceAnimationFrame('exiting', progress);
        const phase = vehicleExitAlignmentPhase(frame, point.straightEntry);
        const alignment = vehicleDoorAlignment(state, occupant.door, phase, context.metadata.info, context.metadata.bounds);
        player.setPose({ ...this.entityPose(entityState), x: alignment.x, y: alignment.y, rotation: alignment.rotation });
        if (progress >= 1 && previousProgress >= 1 && (state.doorStates[occupant.door]?.frame ?? 0) >= 4) {
          this.detachOccupant(occupant.id, context);
          context.onVehicleExit(player);
          continue;
        }
      } else {
        setTransitionAnimation('seated', 1);
        player.followVehicle(this.vehicle.vehiclePose());
      }
      context.setPlayerBodyPose(player);
    }
    syncVehiclePassengers(state);
  }

  private entityPose(state: Readonly<{
    x: number;
    y: number;
    z: number;
    rotation: number;
    vx: number;
    vy: number;
    collisionLayer?: number | undefined;
    grounded?: boolean | undefined;
    verticalVelocity?: number | undefined;
  }>): MobilePose {
    let pose: MobilePose = { x: state.x, y: state.y, z: state.z, rotation: state.rotation, vx: state.vx, vy: state.vy };
    if (state.collisionLayer !== undefined) pose = { ...pose, collisionLayer: state.collisionLayer };
    if (state.grounded !== undefined) pose = { ...pose, grounded: state.grounded };
    if (state.verticalVelocity !== undefined) pose = { ...pose, verticalVelocity: state.verticalVelocity };
    return pose;
  }

  beginEntry(player: PlayerObject, candidate: VehicleEntryCandidate, context: VehicleObjectContext) {
    const state = this.vehicle.mutableVehicleState;
    if (state.doorLock === 'locked') return false;
    if (candidate.role === 'driver') {
      const driverId = state.passengers[0];
      if (driverId?.startsWith('npc:')) {
        // The driver seat is the only control hand-off point. Eject the NPC
        // before reserving the player seat so occupancy capacity and the
        // vehicle's ordered driver invariant remain correct throughout the
        // transition.
        this.detachOccupant(driverId, context);
      }
    }
    // Reserve the seat first, but keep the ped in the approach phase until
    // the occupancy tick has confirmed that it is at the selected door and
    // that door has finished opening.
    const occupant = { id: player.id, door: candidate.door, state: 'approaching' as const, progress: 0, straightEntry: candidate.straightEntry };
    if (!addVehicleOccupant(state, occupant, context.metadata.info, context.metadata.bounds)) return false;
    player.enterVehicle(state.id);
    context.setPlayerBodyPose(player);
    if (vehiclePassengerIndex(state, player.id) === 0) {
      // A traffic chassis may still have a small residual velocity while it is
      // below the source entry-speed gate. Freeze it for the authored door
      // transition; otherwise the outside marker moves away from the ped and
      // the entry can remain in `approaching` forever. The driver receives
      // fresh throttle/steering input as soon as the seat is owned.
      this.vehicle.stop();
      this.vehicle.setPlayerControlMode();
    }
    return true;
  }

  beginExit(player: PlayerObject, exit: { door: number }, context: VehicleObjectContext, immediate = false) {
    const state = this.vehicle.mutableVehicleState;
    const occupant = occupantForPlayer(state, player.id);
    if (!occupant || (!immediate && Math.hypot(state.vx, state.vy) > WORLD.vehicle.occupancySpeedLimit)) return false;
    if (immediate) {
      this.detachOccupant(player.id, context);
      return true;
    }
    occupant.door = exit.door;
    occupant.state = 'exiting';
    occupant.progress = 0;
    player.transitionAnimation({ kind: 'exiting', progress: 0, straightEntry: occupant.straightEntry });
    openVehicleDoor(state, occupant.door, player.id);
    return true;
  }

  detachOccupant(id: string, context: VehicleObjectContext, damage = 0) {
    const state = this.vehicle.mutableVehicleState;
    const occupant = occupantForPlayer(state, id);
    if (!occupant) return false;
    const wasDriver = vehiclePassengerIndex(state, id) === 0;
    const point = vehicleDoorPoint(state, occupant.door, context.metadata.info, context.metadata.bounds);
    const exitVx = state.vx;
    const exitVy = state.vy;
    removeVehicleOccupant(state, id);
    closeVehicleDoor(state, occupant.door);
    if (wasDriver) {
      this.vehicle.stop();
      this.vehicle.setAutonomousControlMode();
    }
    const player = context.playerFor(id);
    if (player) {
      player.leaveVehicle({ ...this.vehicle.vehiclePose(), x: point.exitX, y: point.exitY }, { vx: exitVx, vy: exitVy });
      context.setPlayerBodyPose(player);
      if (damage > 0) context.damagePlayer(player, damage);
    }
    const npc = context.npcFor(id);
    if (npc) npc.leaveVehicle({ ...this.vehicle.vehiclePose(), x: point.exitX, y: point.exitY }, { vx: exitVx, vy: exitVy }, damage);
    syncVehiclePassengers(state);
    return true;
  }

  /** Eject every current occupant through the same door/seat transition used
   * by a normal exit. The vehicle owns the occupancy invariant; callers only
   * choose the damage applied by the event causing the ejection. */
  ejectOccupants(context: VehicleObjectContext, damage = 0) {
    for (const occupant of [...this.vehicle.mutableVehicleState.occupants]) this.detachOccupant(occupant.id, context, damage);
  }
}
