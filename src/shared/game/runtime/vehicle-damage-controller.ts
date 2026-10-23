import type { HazardState, TrafficState, WorldEventInput } from '../../protocol/types';
import type { HazardObject } from '../effects/hazard';
import type { VehicleObject } from '../gameobjects/vehicle';
import { GTA2_CAR_FIRE_SPRITES, GTA2_SOURCE_OBJECT_MODELS } from '../../domain/world/gta2-sprites';
import type { VehicleDamageTransition } from '../../domain/combat/vehicle-damage';

export interface VehicleDamageControllerContext {
  readonly hazards: HazardState[];
  readonly vehicleObjectFor: (id: number) => VehicleObject | undefined;
  readonly hazardObjectFor: (id: number) => HazardObject | undefined;
  readonly nextHazardId: () => number;
  readonly registerHazard: (hazard: HazardState) => void;
  readonly unregisterHazard: (hazard: HazardState) => void;
  readonly ejectVehicleOccupants: (vehicle: TrafficState, damage: number) => void;
  readonly emit: (event: WorldEventInput) => void;
}

/** Coordinates damage transitions with their attached fire/explosion effects.
 * The damage accumulator itself remains in vehicle-damage.ts; this class owns
 * the world-facing consequences and keeps them out of GameWorld. */
export class VehicleDamageController {
  constructor(readonly context: VehicleDamageControllerContext) {}

  private fireOwner(vehicle: TrafficState, effect: 'fire' | 'explosion' = 'fire') {
    return `vehicle:${vehicle.id}:${effect}`;
  }

  private fireHazard(vehicle: TrafficState, effect: 'fire' | 'explosion' = 'fire') {
    const owner = this.fireOwner(vehicle, effect);
    return this.context.hazards.find(hazard => hazard.kind === 'fire' && hazard.owner === owner);
  }

  spawnFire(vehicle: TrafficState, life: number, effect: 'fire' | 'explosion' = 'fire') {
    if (effect === 'fire' && vehicle.fireExtinguished) return undefined;
    const owner = this.fireOwner(vehicle, effect);
    let sourceModel: number | undefined;
    if (effect === 'fire') {
      if (vehicle.damagePhase === 'burned-out' || vehicle.wrecked) sourceModel = GTA2_CAR_FIRE_SPRITES.wreck.start;
      else if ((vehicle.damageLevel ?? 0) >= 4) sourceModel = GTA2_CAR_FIRE_SPRITES.large.start;
      else sourceModel = GTA2_CAR_FIRE_SPRITES.small.start;
    }
    const existing = this.fireHazard(vehicle, effect);
    if (existing) {
      const object = this.context.hazardObjectFor(existing.id);
      if (object) { object.extendLife(life); object.followVehicle(vehicle, sourceModel); return object.state; }
      return existing;
    }
    const hazard: HazardState = {
      id: this.context.nextHazardId(), x: vehicle.x, y: vehicle.y, z: vehicle.z,
      collisionLayer: vehicle.collisionLayer, kind: 'fire' as const, life, owner, sourceModel,
    };
    if (effect === 'explosion') {
      hazard.effect = 'explosion';
      hazard.explosionType = 'item';
    }
    this.context.registerHazard(hazard);
    return hazard;
  }

  removeFire(vehicle: TrafficState, effect?: 'fire' | 'explosion') {
    let prefix = `vehicle:${vehicle.id}:`;
    if (effect) prefix = this.fireOwner(vehicle, effect);
    for (const hazard of [...this.context.hazards]) {
      if (hazard.kind !== 'fire') continue;
      if (effect && hazard.owner !== prefix) continue;
      if (!effect && !hazard.owner?.startsWith(prefix)) continue;
      this.context.unregisterHazard(hazard);
    }
  }

  /** Car_BC::HandleCarHitByObject model 198 clears attached fire sprites but
   * deliberately leaves the accumulated damage and burning damage phase. */
  extinguishFire(vehicle: TrafficState) {
    vehicle.fireExtinguished = true;
    this.removeFire(vehicle, 'fire');
  }

  syncFire() {
    for (const hazard of this.context.hazards) {
      if (hazard.kind !== 'fire' || !hazard.owner?.startsWith('vehicle:')) continue;
      const match = /^vehicle:(\d+):/.exec(hazard.owner);
      if (!match) continue;
      const vehicleObject = this.context.vehicleObjectFor(Number(match[1]));
      if (!vehicleObject) continue;
      // Attached fire follows the chassis; a one-shot explosion remains at its
      // impact point until its short lifetime expires.
      if (hazard.owner.endsWith(':fire')) {
        const object = this.context.hazardObjectFor(hazard.id);
        object?.followVehicle(vehicleObject.state, object.state.sourceModel);
      }
    }
  }

  /** Single world-facing entry point for every vehicle damage source.
   * Source-model filtering belongs here so direct hits, fire, blasts, car
   * bombs, and collision damage all share the same immunity and transition
   * lifecycle. */
  applyDamage(vehicle: TrafficState, damage: number, x = vehicle.x, y = vehicle.y, sourceModel?: number, attacker?: string) {
    const object = this.context.vehicleObjectFor(vehicle.id);
    if (!object || !object.canReceiveObjectDamage(sourceModel)) return;
    if (sourceModel === GTA2_SOURCE_OBJECT_MODELS.fireHitting) vehicle.fireExtinguished = false;
    const transition: VehicleDamageTransition = object.receiveDamage(damage, x, y);
    if (!transition.applied) return;
    const actor = attacker ?? object?.driver;
    this.context.emit({ type: 'vehicle-damage', actor, entity: vehicle.id, damage: transition.applied, x, y, z: vehicle.z });
    if (transition.startedSmallFire || transition.startedLargeFire) this.spawnFire(vehicle, 9_000);
    if (transition.startedExplosion) {
      this.removeFire(vehicle, 'fire');
      // The source car explosion is type 19 (the item-sized explosion). Its
      // particle frames finish in about 26 updates; 32 left the old renderer
      // stuck on frame zero because it was hard-coded to a 12-tick window.
      this.spawnFire(vehicle, 26, 'explosion');
      this.context.ejectVehicleOccupants(vehicle, 1_000);
      this.context.emit({ type: 'explosion', actor, entity: vehicle.id, damage: transition.applied, x: vehicle.x, y: vehicle.y, z: vehicle.z });
    }
  }
}
