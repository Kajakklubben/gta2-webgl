import { expect, it } from 'vitest';
import { sourceSkidObjectModel, sourceSkidSprite, skidSegmentRotation, vehicleSkidWheelPoints } from '../../shared/domain/physics/vehicle-skid';
import { WORLD } from '../../shared/domain/world/world';
import { HazardObject } from '../../shared/game/effects/hazard';

it('selects the source skid sprite family from segment length and surface', () => {
  expect(sourceSkidObjectModel(0, WORLD.tileSize / 16)).toBe(117);
  expect(sourceSkidObjectModel(0, WORLD.tileSize / 4)).toBe(120);
  expect(sourceSkidObjectModel(0, WORLD.tileSize * 3 / 8)).toBe(250);
  expect(sourceSkidObjectModel(0, WORLD.tileSize)).toBe(147);
  expect(sourceSkidObjectModel(2, WORLD.tileSize / 4)).toBe(119);
});

it('resolves source skid object ids to code-object sprite bases and remaps', () => {
  expect(sourceSkidSprite(117)).toEqual({ model: 528, remap: 4 });
  expect(sourceSkidSprite(119)).toEqual({ model: 524, remap: 3 });
  expect(sourceSkidSprite(253)).toEqual({ model: 516 });
  expect(sourceSkidSprite(145)).toEqual({ model: 520, remap: 5 });
});

it('places remembered skid contacts at the four source wheel locations', () => {
  expect(vehicleSkidWheelPoints({ x: 0, y: 0, rotation: 0 }, 64, 20, -20)).toEqual([
    { x: -28, y: -20 }, { x: 28, y: -20 }, { x: 28, y: 20 }, { x: -28, y: 20 },
  ]);
  expect(skidSegmentRotation({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
});

it('renders the decoded source skid object instead of the generic fallback', () => {
  const hazard = new HazardObject({ id: 1, x: 0, y: 0, z: 0, kind: 'skid', life: 240, sourceModel: 120, rotation: 0 });
  expect(hazard.getSprite(0)).toMatchObject({ atlas: 'codeObjects', model: 524, codeObjectRemap: 4, animation: 'skid', scale: 1 });
});
