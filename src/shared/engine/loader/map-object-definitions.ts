import type { MapObjectDefinition, ObjectInfo } from './models/style';
import type { Pixels } from '../assets/pixels';

type SourceMapObjectMetadata = Omit<MapObjectDefinition, 'model' | 'spriteCount' | 'width' | 'height' | 'depth'>;

/**
 * The retail executable creates a definition from OBJI and then applies this
 * table before spawning an MOBJ.  In particular, collision is not inferred
 * from the sprite's alpha pixels: the collision bucket and draw layer are
 * authored properties of the model.
 *
 * Values are transcribed from InitMapObjectOverrides in
 * references/gta2_re/Source/ObjectDefinitions_8CA8.cpp.
 */
const SOURCE_MAP_OBJECTS: Readonly<Record<number, SourceMapObjectMetadata>> = {
  1: { behavior: 'static', nextDefinition: 158, collisionBucket: 4, blocksMovement: true, drawLayer: 11, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  2: { behavior: 'static', nextDefinition: 0, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  3: { behavior: 'static', nextDefinition: 155, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  4: { behavior: 'static', nextDefinition: 52, collisionBucket: 3, blocksMovement: true, drawLayer: 2, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  5: { behavior: 'static', nextDefinition: 156, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  6: { behavior: 'static', nextDefinition: 151, collisionBucket: 3, blocksMovement: true, drawLayer: 2, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  7: { behavior: 'static', nextDefinition: 157, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  // Object_2C starts model 8 with timer=1, advances one of its five OBJI
  // frames per tick, then TickObject(9) when the frame counter wraps.
  8: { behavior: 'animated', nextDefinition: 9, collisionBucket: 3, blocksMovement: true, drawLayer: 3, spriteFlags: 0, hasShadows: false, frameTicks: 1, animationTimer: 1 },
  9: { behavior: 'static', nextDefinition: 0, collisionBucket: 3, blocksMovement: true, drawLayer: 3, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  10: { behavior: 'static', nextDefinition: 0, collisionBucket: 3, blocksMovement: true, drawLayer: 7, spriteFlags: 0, hasShadows: false, frameTicks: 4 },
  11: { behavior: 'static', nextDefinition: 123, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  12: { behavior: 'static', nextDefinition: 50, collisionBucket: 3, blocksMovement: true, drawLayer: 2, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  13: { behavior: 'static', nextDefinition: 56, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  14: { behavior: 'static', nextDefinition: 57, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  15: { behavior: 'static', nextDefinition: 59, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  16: { behavior: 'static', nextDefinition: 61, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  17: { behavior: 'static', nextDefinition: 63, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  18: { behavior: 'static', nextDefinition: 49, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  19: { behavior: 'static', nextDefinition: 0, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  20: { behavior: 'static', nextDefinition: 0, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  21: { behavior: 'static', nextDefinition: 47, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  22: { behavior: 'static', nextDefinition: 45, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  23: { behavior: 'static', nextDefinition: 43, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
  25: { behavior: 'static', nextDefinition: 0, collisionBucket: 4, blocksMovement: true, drawLayer: 10, spriteFlags: 0, hasShadows: false, frameTicks: 0 },
};

/** Canonical OBJI counts and decoded first-frame sizes used when the server has
 * a map but no matching style object payload (the normal default-map path). */
const CANONICAL_OBJECTS: Readonly<Record<number, { sprites: number; width: number; height: number }>> = {
  1: { sprites: 6, width: 32, height: 26 },
  2: { sprites: 1, width: 30, height: 28 },
  3: { sprites: 4, width: 30, height: 28 },
  4: { sprites: 2, width: 28, height: 28 },
  5: { sprites: 3, width: 28, height: 28 },
  6: { sprites: 4, width: 30, height: 26 },
  7: { sprites: 4, width: 30, height: 26 },
  8: { sprites: 5, width: 14, height: 14 },
  9: { sprites: 1, width: 16, height: 12 },
  10: { sprites: 1, width: 16, height: 12 },
  11: { sprites: 4, width: 16, height: 12 },
  12: { sprites: 6, width: 16, height: 16 },
  13: { sprites: 5, width: 14, height: 16 },
  14: { sprites: 5, width: 12, height: 16 },
  15: { sprites: 3, width: 8, height: 16 },
  16: { sprites: 4, width: 12, height: 16 },
  17: { sprites: 1, width: 14, height: 16 },
  18: { sprites: 7, width: 16, height: 6 },
  19: { sprites: 1, width: 16, height: 6 },
  20: { sprites: 1, width: 16, height: 8 },
  21: { sprites: 8, width: 36, height: 12 },
  22: { sprites: 8, width: 16, height: 16 },
  23: { sprites: 5, width: 16, height: 16 },
  25: { sprites: 1, width: 16, height: 16 },
};

const fallbackMetadata: SourceMapObjectMetadata = {
  behavior: 'static',
  nextDefinition: 0,
  collisionBucket: 0,
  blocksMovement: false,
  drawLayer: 2,
  spriteFlags: 0,
  hasShadows: false,
  frameTicks: 0,
};

function definitionFor(object: ObjectInfo, frame: Pixels | undefined): MapObjectDefinition {
  const source = SOURCE_MAP_OBJECTS[object.model] ?? fallbackMetadata;
  const fallback = CANONICAL_OBJECTS[object.model];
  return {
    model: object.model,
    spriteCount: object.sprites,
    width: frame?.width ?? fallback?.width ?? 16,
    height: frame?.height ?? fallback?.height ?? 16,
    depth: .25,
    ...source,
  };
}

export function createMapObjectDefinitions(objects: readonly ObjectInfo[], sprites: Readonly<Record<number, readonly Pixels[]>> = {}): ReadonlyMap<number, MapObjectDefinition> {
  const definitions = new Map<number, MapObjectDefinition>();
  for (const object of objects) definitions.set(object.model, definitionFor(object, sprites[object.model]?.[0]));
  return definitions;
}

export const DEFAULT_MAP_OBJECT_DEFINITIONS: ReadonlyMap<number, MapObjectDefinition> = createMapObjectDefinitions(
  Object.entries(CANONICAL_OBJECTS).map(([model, value]) => ({ model: Number(model), sprites: value.sprites })),
  Object.fromEntries(Object.entries(CANONICAL_OBJECTS).map(([model, value]) => [model, [{ width: value.width, height: value.height, data: new Uint8Array(value.width * value.height * 4) }]])),
);
