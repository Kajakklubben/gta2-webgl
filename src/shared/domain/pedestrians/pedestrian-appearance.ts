/**
 * Civilian palette remaps used by GTA2's ordinary dummy-pedestrian spawner.
 *
 * Char_Pool.cpp selects one of four common civilian remaps (18..21), or one
 * of the additional civilian remaps (31..51). The value is the source remap
 * index; the STY decoder adds the style's pedestrian palette base.
 */
export const CIVILIAN_PED_REMAPS = [
  18, 19, 20, 21,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
] as const;

/** Char_Pool/Police_7B8 assigns ordinary walking police the blue-police remap. */
export const POLICE_PED_REMAP = 0;
