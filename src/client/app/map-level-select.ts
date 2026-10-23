import { GTA2_MAP_LAYER_COUNT } from '../../shared/domain/world/presentation-order';

export function populateMapLevelSelect(select: HTMLSelectElement) {
  select.replaceChildren(...Array.from({ length: GTA2_MAP_LAYER_COUNT }, (_, level) => {
    const option = new Option(`Z${level}`, String(level));
    option.selected = true;
    return option;
  }));
}

export function setSelectedMapLevels(select: HTMLSelectElement, levels: readonly number[]) {
  const enabled = new Set(levels);
  for (const option of Array.from(select.options)) option.selected = enabled.has(Number(option.value));
}

export function selectedMapLevels(select: HTMLSelectElement) {
  return Array.from(select.selectedOptions, option => Number(option.value)).filter(Number.isInteger);
}
