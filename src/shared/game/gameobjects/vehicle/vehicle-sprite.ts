import type { TrafficState } from '../../../protocol/types';
import type { GameObjectPlacement, GameObjectSprite } from '../gameobject';
import { vehicleDoorLogicalDelta } from '../../../domain/vehicles/vehicle-occupancy';
import { ensureVehicleDamageState } from '../../../domain/combat/vehicle-damage';

/** Vehicle-owned rendering state. It translates damage, paint, wreck, and door
 * state into the generic sprite command without moving those rules into the
 * renderer or the world orchestrator. */
export class VehicleSpriteState {
  constructor(readonly state: TrafficState) {}

  getSprite(placement: GameObjectPlacement): GameObjectSprite {
    ensureVehicleDamageState(this.state);
    const burnedOut = this.state.damagePhase === 'burned-out' || this.state.wrecked;
    const damageFrame = this.state.damageFrame ?? ([0, 1, 2, 3].find(index => (this.state.damageMask ?? 0) & (1 << index)) ?? 0);
    let damageDeltas: number[] = [];
    if (!burnedOut) damageDeltas = [0, 1, 2, 3].filter(index => (this.state.damageMask ?? 0) & (1 << index));
    if (!burnedOut && !damageDeltas.length && damageFrame >= 0 && damageFrame <= 3 && (this.state.damagePhase ?? 'new') !== 'new') damageDeltas.push(damageFrame);
    let doorDeltas: number[] = [];
    if (!burnedOut) {
      doorDeltas = this.state.doorStates.flatMap((door, index) => {
        if (door.frame <= 0) return [];
        const delta = vehicleDoorLogicalDelta(index, door.frame);
        return [delta];
      });
    }
    let model: number | undefined = this.state.model;
    if (burnedOut && typeof this.state.wreckModel === 'number') model = this.state.wreckModel;
    const base = {
      atlas: 'cars' as const, animation: 'base' as const, frame: 0,
      carDeltaIndices: [...damageDeltas, ...doorDeltas], placement, opacity: 1,
      carLights: {
        headlights: this.state.headlights ?? false,
        brakeLights: this.state.brakeLights ?? false,
        emergencyLights: this.state.emergencyLights ?? false,
      },
      alphaTest: .01, fallbackColor: 0x6d7888,
    };
    if (burnedOut) {
      const result = { ...base, variant: 'base' as const };
      if (model !== undefined) return { ...result, model, definition: { bank: 'car' as const, sourceId: model } };
      return result;
    }
    const result = { ...base, variant: 'paint' as const, variantIndex: this.state.paint ?? 0 };
    if (model !== undefined) return { ...result, model, definition: { bank: 'car' as const, sourceId: model } };
    return result;
  }
}
