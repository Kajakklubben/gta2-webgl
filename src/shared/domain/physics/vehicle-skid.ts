import { SOURCE_FIX16_ONE, WORLD } from '../world/world';
import { directionFromRotation, rotationFromDirection, type Vector2 } from './motion-vector';

/** The source uses four remembered contact points in this order:
 * rear-left, rear-right, front-right, front-left. */
export type VehicleSkidWheel = 0 | 1 | 2 | 3;

const SOURCE_SKID_LENGTHS = {
  tiny: 0x400 / SOURCE_FIX16_ONE,
  medium: 0x1000 / SOURCE_FIX16_ONE,
  large: 0x1800 / SOURCE_FIX16_ONE,
} as const;

/**
 * The ids returned by get_skid_obj_type_55D490 are ObjectDefinition ids, not
 * sprite ids.  CreateCodeObjectDefinitions assigns the actual relative code
 * object sprite base from the template table and CloneRemappedDefinitions
 * supplies the code-object palette remap for the three alternate surfaces.
 */
export interface SourceSkidSprite {
  readonly model: number;
  readonly remap?: number;
}

const SOURCE_SKID_SPRITES: Readonly<Record<number, SourceSkidSprite>> = {
  // Tiny segments: definition 118, remapped clones 117/116/126.
  117: { model: 528, remap: 4 },
  116: { model: 528, remap: 3 },
  118: { model: 528 },
  126: { model: 528, remap: 5 },
  // Medium segments: definition 121, remapped clones 120/119/125.
  120: { model: 524, remap: 4 },
  119: { model: 524, remap: 3 },
  121: { model: 524 },
  125: { model: 524, remap: 5 },
  // Large segments: definition 253, remapped clones 250/249/124.
  250: { model: 516, remap: 4 },
  249: { model: 516, remap: 3 },
  253: { model: 516 },
  124: { model: 516, remap: 5 },
  // Long segments: definition 144, remapped clones 147/146/145.
  147: { model: 520, remap: 4 },
  146: { model: 520, remap: 3 },
  144: { model: 520 },
  145: { model: 520, remap: 5 },
};

/** Resolve a source skid ObjectDefinition id to its STY code-object sprite. */
export function sourceSkidSprite(sourceObjectModel: number): SourceSkidSprite | undefined {
  return SOURCE_SKID_SPRITES[sourceObjectModel];
}

/**
 * CarPhysics_B0::get_skid_obj_type_55D490.
 *
 * `length` is in browser world pixels; the executable compares the same
 * distance in map units against 1/16, 1/4, and 3/8 of a tile. Surface 0 is
 * the normal brown road set, surface 2 is its grey counterpart, and 1/3 are
 * the two special source surface families.
 */
export function sourceSkidObjectModel(surface: number, length: number) {
  const sourceSurface = surface === 1 || surface === 2 || surface === 3 ? surface : 0;
  const sourceLength = Math.max(0, length) / WORLD.tileSize;
  const model = (normal: number, grey: number, special: number, water: number) => {
    if (sourceSurface === 2) return grey;
    if (sourceSurface === 1) return special;
    if (sourceSurface === 3) return water;
    return normal;
  };
  if (sourceLength <= SOURCE_SKID_LENGTHS.tiny) {
    return model(117, 116, 118, 126);
  }
  if (sourceLength <= SOURCE_SKID_LENGTHS.medium) {
    return model(120, 119, 121, 125);
  }
  if (sourceLength <= SOURCE_SKID_LENGTHS.large) {
    return model(250, 249, 253, 124);
  }
  return model(147, 146, 144, 145);
}

/** Return the four source wheel contact points in world coordinates. */
export function vehicleSkidWheelPoints(
  pose: Pick<{ x: number; y: number; rotation: number }, 'x' | 'y' | 'rotation'>,
  width: number,
  frontWheelOffset: number,
  rearWheelOffset: number,
): readonly Vector2[] {
  const forward = directionFromRotation(pose.rotation);
  const right = { x: Math.cos(pose.rotation), y: Math.sin(pose.rotation) };
  // CarPhysics_B0 multiplies the CARI width by dword_6FE004 (0x1C00),
  // rather than using the full half-width of the collision box.
  const halfWidth = width * (0x1C00 / SOURCE_FIX16_ONE);
  const point = (across: number, along: number): Vector2 => ({
    x: pose.x + right.x * across + forward.x * along,
    y: pose.y + right.y * across + forward.y * along,
  });
  return [
    point(-halfWidth, rearWheelOffset),
    point(halfWidth, rearWheelOffset),
    point(halfWidth, frontWheelOffset),
    point(-halfWidth, frontWheelOffset),
  ];
}

/** Rotation used by the top-down skid sprite for a wheel segment. */
export function skidSegmentRotation(from: Vector2, to: Vector2, fallback = 0) {
  return rotationFromDirection(to.x - from.x, to.y - from.y, fallback);
}
