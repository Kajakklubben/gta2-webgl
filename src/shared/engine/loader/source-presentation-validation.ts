import { GTA2_SOURCE_EFFECT_SPRITES, GTA2_SOURCE_OBJECT_SPRITES, hasWreckModel, resolveWreckModel } from '../../domain/world/gta2-sprites';
import type { MapObjectDefinition, Style } from './models/style';

/** The local retail source does not provide arbitrary per-model collision
 * polygons. SpriteShape_4C is a width/height rectangle whose corners are
 * rotated at runtime; GMP contributes map faces and diagonal faces. */
export const SOURCE_COLLISION_CONTRACT = 'rotated-cari-rectangle-and-gmp-faces' as const;

export interface SourcePresentationValidation {
  readonly ok: boolean;
  readonly collisionContract: typeof SOURCE_COLLISION_CONTRACT;
  readonly checkedCars: number;
  readonly checkedMapObjects: number;
  readonly checkedSourceRanges: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const SOURCE_DOOR_DELTA_SLOTS = [7, 24, 11, 28] as const;

function hasPixels(value: readonly { width: number; height: number }[] | undefined) {
  const first = value?.[0];
  return !!first && first.width > 0 && first.height > 0;
}

function storedDeltaIndex(logicalDelta: number) {
  return logicalDelta >= 22 && logicalDelta <= 31 ? logicalDelta - 17 : logicalDelta;
}

function isSpriteRange(value: unknown): value is { start: number; count: number } {
  if (!value || typeof value !== 'object') return false;
  const range = value as { start?: unknown; count?: unknown };
  return Number.isInteger(range.start) && Number.isInteger(range.count) && (range.count as number) > 0;
}

function validateMapObject(
  style: Style,
  definition: MapObjectDefinition,
  errors: string[],
) {
  const frames = style.sprites.objects[definition.model];
  if (!frames?.length) {
    errors.push(`map object ${definition.model} has no decoded OBJI sprite frames`);
    return;
  }
  if (frames.length !== definition.spriteCount) {
    errors.push(`map object ${definition.model} declares ${definition.spriteCount} OBJI frames but decoded ${frames.length}`);
  }
  const first = frames[0]!;
  if (first.width !== definition.width || first.height !== definition.height) {
    errors.push(`map object ${definition.model} dimensions ${definition.width}x${definition.height} do not match source frame ${first.width}x${first.height}`);
  }
  if (definition.behavior === 'animated') {
    if (definition.spriteCount < 2 || definition.frameTicks < 1) {
      errors.push(`animated map object ${definition.model} has an invalid source frame schedule`);
    }
    if (definition.nextDefinition !== 0 && !style.mapObjects.has(definition.nextDefinition)) {
      errors.push(`animated map object ${definition.model} transitions to missing definition ${definition.nextDefinition}`);
    }
  }
}

/**
 * Validate the source presentation data after a STY has been decoded. This is
 * deliberately diagnostic rather than throwing: custom styles and synthetic
 * test styles are useful, while a retail asset audit must still expose every
 * missing chassis, damage, door, wreck, or MOBJ animation range.
 */
export function validateSourcePresentation(style: Style): SourcePresentationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (style.cars.length && !style.composeCarSprite) errors.push('CARI cars have no DELS compositor');
  for (const car of style.cars) {
    if (car.width <= 0 || car.height <= 0) errors.push(`car ${car.model} has invalid CARI chassis dimensions ${car.width}x${car.height}`);
    if (!hasPixels(style.sprites.cars[car.model])) errors.push(`car ${car.model} has no decoded chassis sprite`);
    if (!hasPixels(style.sprites.carPaints[car.model])) errors.push(`car ${car.model} has no decoded paint sprite`);

    if (hasWreckModel(car.wreck)) {
      const wreckModel = resolveWreckModel(car.wreck);
      if (!hasPixels(style.sprites.cars[wreckModel])) errors.push(`car ${car.model} references missing wreck sprite model ${wreckModel}`);
    }

    const deltas = style.carDeltaSets[car.sprite];
    if (car.doors.length && !deltas?.length) {
      errors.push(`car ${car.model} has ${car.doors.length} CARI doors but no DELX/DELS delta set for sprite ${car.sprite}`);
    }
    if (deltas?.length) {
      if (!hasPixels(style.sprites.carDamage[car.model])) errors.push(`car ${car.model} has DELS data but no decoded damage frames`);
      for (let door = 0; door < car.doors.length; door++) {
        const base = SOURCE_DOOR_DELTA_SLOTS[door];
        if (base === undefined) {
          errors.push(`car ${car.model} has unsupported CARI door index ${door}`);
          continue;
        }
        for (let frame = 0; frame < 4; frame++) {
          const stored = storedDeltaIndex(base + frame);
          // Retail styles are allowed to omit optional rear-door/FBI-light
          // art. Keep the missing slot visible to tooling without rejecting
          // an otherwise valid CARI/DELS set.
          if (!deltas[stored]) warnings.push(`car ${car.model} is missing source door delta slot ${base + frame} (stored ${stored})`);
        }
      }
    }
  }

  for (const definition of style.mapObjects.values()) validateMapObject(style, definition, errors);
  for (const object of style.objects) {
    if (!style.mapObjects.has(object.model)) warnings.push(`OBJI model ${object.model} has no runtime ObjectDefinition override`);
  }

  const sourceRanges: [string, { start: number; count: number }][] = [];
  for (const [model, range] of Object.entries(GTA2_SOURCE_OBJECT_SPRITES)) {
    if (isSpriteRange(range)) sourceRanges.push([`Object_2C model ${model}`, range]);
  }
  for (const [name, range] of Object.entries(GTA2_SOURCE_EFFECT_SPRITES)) {
    if (isSpriteRange(range)) sourceRanges.push([name, range]);
  }
  for (const [name, range] of sourceRanges) {
    const missing = Array.from({ length: range.count }, (_, index) => range.start + index)
      .filter(model => !style.sprites.codeObjects[model]);
    if (missing.length) warnings.push(`${name} is missing decoded code-object frames ${missing.join(', ')}`);
  }

  return {
    ok: errors.length === 0,
    collisionContract: SOURCE_COLLISION_CONTRACT,
    checkedCars: style.cars.length,
    checkedMapObjects: style.mapObjects.size,
    checkedSourceRanges: sourceRanges.length,
    errors,
    warnings,
  };
}

