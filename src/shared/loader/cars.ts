import { parseCarNames, parseCarPhysics } from './gci';
import { loadVehicleBounds } from './vehicle-bounds';
import type { Style } from './models/style';
import type { CarAsset, CarCatalog } from './models/catalog';

export function loadCarCatalog(style: Style, namesBytes?: Uint8Array): CarCatalog {
  const names = parseCarNames(namesBytes ?? new Uint8Array());
  const physics = parseCarPhysics(namesBytes ?? new Uint8Array());
  const byModel = new Map<number, CarAsset>();
  for (const info of style.cars) {
    byModel.set(info.model, {
      model: info.model,
      name: names.get(info.model),
      physics: physics.get(info.model),
      recycled: style.recyclingModels.includes(info.model),
      deltaData: style.carDeltaSets[info.sprite] ?? [],
      info,
      frames: style.sprites.cars[info.model] ?? [],
      paintFrames: style.sprites.carPaints[info.model] ?? [],
      damageFrames: style.sprites.carDamage[info.model] ?? [],
    });
  }
  return { byModel, names, physics, bounds: loadVehicleBounds(style.cars), recyclingModels: style.recyclingModels };
}

