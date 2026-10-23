import type { CarInfo, Style } from '../../../shared/engine/loader/models/style';
import type { CarSpriteLights, GameObjectSpriteLayer, SpriteDefinitionRef, SpritePaletteRef } from '../../../shared/game/gameobjects/gameobject';
import { GTA2_CAR_DAMAGE_SLOTS } from '../../../shared/domain/world/gta2-sprites';
export { hasWreckModel, resolveWreckModel } from '../../../shared/domain/world/gta2-sprites';

/** Source DELS slots used by the car body, doors, and lights. */
export const CAR_LIGHT_DELTA_SLOTS = {
  rightBrake: 5,
  rightHeadlight: 6,
  emergencyDecal: 15,
  emergencyLight: 16,
  rightRearEmergency: 17,
  leftRearEmergency: 18,
  leftBrake: 21,
  leftHeadlight: 22,
} as const;

export const CAR_DAMAGE_SLOT_NAMES = GTA2_CAR_DAMAGE_SLOTS;

export function definition(model: number): SpriteDefinitionRef {
  return { bank: 'car', sourceId: model };
}

export function palette(index = 0): SpritePaletteRef {
  return { area: 'car-remaps', index };
}

function appendUnique(target: number[], ...values: number[]) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

/** Convert runtime light state into authored source DELS slots. */
export function lightDeltaIndices(info: CarInfo | undefined, lights: CarSpriteLights | undefined) {
  const result: number[] = [];
  if (!lights) return result;
  if (lights.headlights) appendUnique(result, CAR_LIGHT_DELTA_SLOTS.rightHeadlight, CAR_LIGHT_DELTA_SLOTS.leftHeadlight);
  if (lights.brakeLights) appendUnique(result, CAR_LIGHT_DELTA_SLOTS.rightBrake, CAR_LIGHT_DELTA_SLOTS.leftBrake);
  if (lights.emergencyLights && (info?.infoFlags.emergencyLights || info?.infoFlags.roofLights || info?.infoFlags.rearEmergencyLights)) {
    appendUnique(
      result,
      CAR_LIGHT_DELTA_SLOTS.emergencyDecal,
      CAR_LIGHT_DELTA_SLOTS.emergencyLight,
      CAR_LIGHT_DELTA_SLOTS.rightRearEmergency,
      CAR_LIGHT_DELTA_SLOTS.leftRearEmergency,
    );
  }
  return result;
}

/** Return the active DELS slots, including lights, in stable source order. */
export function deltaIndices(style: Style, layer: GameObjectSpriteLayer) {
  const model = layer.model ?? layer.definition?.sourceId;
  const info = model === undefined ? undefined : style.cars.find(car => car.model === model);
  const values = [...(layer.carDeltaIndices ?? [])];
  appendUnique(values, ...lightDeltaIndices(info, layer.carLights));
  return [...new Set(values.filter(Number.isFinite).map(Math.trunc))].sort((left, right) => left - right);
}
