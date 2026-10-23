import { describe, expect, it } from 'vitest';
import { loadStyleAsset } from '../../shared/engine/loader/asset-loaders';
import { createMapObjectDefinitions } from '../../shared/engine/loader/map-object-definitions';
import { validateSourcePresentation, SOURCE_COLLISION_CONTRACT } from '../../shared/engine/loader/source-presentation-validation';
import type { Pixels, Style } from '../../shared/engine/loader/models/style';
import { styleFixture } from './fixtures';
import { parseStyle } from '../../shared/engine/loader/style-parser';

const pixels = (width: number, height: number): Pixels => ({ width, height, data: new Uint8Array(width * height * 4) });

function completeStyle(): Style {
  const parsed = parseStyle(styleFixture());
  const frame = pixels(32, 64);
  const wreck = pixels(32, 64);
  const objectFrames = Array.from({ length: 5 }, () => pixels(14, 14));
  const objectTerminal = pixels(16, 12);
  const car = { ...parsed.cars[0]!, model: 1, sprite: 0, wreck: 72, doors: parsed.cars[0]!.doors.slice(0, 2) };
  const deltas = Array.from({ length: 15 }, () => new Uint8Array());
  const mapObjects = createMapObjectDefinitions(
    [{ model: 8, sprites: 5 }, { model: 9, sprites: 1 }],
    { 8: objectFrames, 9: [objectTerminal] },
  );
  return {
    ...parsed,
    cars: [car],
    carDeltaSets: { 0: deltas },
    mapObjects,
    objects: [{ model: 8, sprites: 5 }, { model: 9, sprites: 1 }],
    composeCarSprite: () => frame,
    sprites: {
      ...parsed.sprites,
      cars: { 1: [frame], 72: [wreck] },
      carPaints: { 1: [frame] },
      carDamage: { 1: deltas.map(() => frame) },
      objects: { 8: objectFrames, 9: [objectTerminal] },
    },
  };
}

describe('retail source presentation validation', () => {
  it('accepts CARI chassis, wreck, door DELS, and finite MOBJ animation data', () => {
    const report = validateSourcePresentation(completeStyle());
    expect(report).toMatchObject({ ok: true, checkedCars: 1, checkedMapObjects: 2, checkedSourceRanges: 20, collisionContract: SOURCE_COLLISION_CONTRACT });
    expect(report.errors).toEqual([]);
  });

  it('reports unavailable authored presentation data without weakening the loader', () => {
    const style = completeStyle();
    const broken = {
      ...style,
      carDeltaSets: {},
      sprites: { ...style.sprites, cars: { 1: [pixels(32, 64)] }, objects: { 8: style.sprites.objects[8]! } },
      mapObjects: createMapObjectDefinitions([{ model: 8, sprites: 5 }], { 8: style.sprites.objects[8]! }),
    };
    const report = validateSourcePresentation(broken);
    expect(report.ok).toBe(false);
    expect(report.errors.some(error => error.includes('wreck sprite model 72'))).toBe(true);
    expect(report.errors.some(error => error.includes('CARI doors but no DELX/DELS'))).toBe(true);
    expect(report.errors.some(error => error.includes('transitions to missing definition 9'))).toBe(true);
  });

  it('exposes the non-fatal audit at the style asset boundary', () => {
    const asset = loadStyleAsset('synthetic.sty', styleFixture());
    expect(asset.presentationValidation?.collisionContract).toBe(SOURCE_COLLISION_CONTRACT);
    expect(asset.presentationValidation?.ok).toBe(false);
  });
});

