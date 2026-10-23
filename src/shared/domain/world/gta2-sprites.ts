/**
 * GTA2 code-object model ids and their relative sprite ranges.
 *
 * The ranges are relative to the STY code-object bank (the SPRB/code-object
 * convention), so they remain readable alongside the model ids used by the
 * original game code.
 */
export enum Gta2CodeObjectModel {
  RocketBullet = 128,
  MovingMolotov = 138,
  FlamethrowerFire = 154,
  Grenade = 183,
  GrenadeOnGround = 184,
  ShotgunBullet = 192,
  OilSlick = 216,
  LandMine = 217,
  MachineGunBullet = 254,
  PistolBullet = 265,
  ElectroBatonBullet = 277,
  PedFire = 197,
}

/** Object_2C model ids used by Weapon_30 and Car_BC.  These are source
 * gameplay ids, not the relative STY sprite/pickup ids below. */
export const GTA2_SOURCE_OBJECT_MODELS = {
  oilSlick: 8,
  carMine: 10,
  rocketBullet: 128,
  movingMolotov: 138,
  flamethrowerFire: 154,
  explosiveImpact: 159,
  grenade: 183,
  shotgunBullet: 192,
  fireHitting: 194,
  tankTopImpact: 193,
  flamethrowerImpact: 195,
  pedFire: 197,
  bulletOnFire: 198,
  impactChild: 199,
  machineGunBullet: 254,
  pistolBullet: 265,
  electroBatonBullet: 277,
  /** Car_BC::FireCarBomb's moving_collect_36_132 object. */
  movingCarBomb: 132,
} as const;

export interface Gta2SpriteRange { start: number; count: number }

/** CARI.wreck is a graphic number; Car_BC resolves it from WRECK0 (model 72). */
export const GTA2_WRECK_MODEL_BASE = 72;
export function hasWreckModel(wreckGraphic: number | undefined) {
  return typeof wreckGraphic === 'number' && Number.isInteger(wreckGraphic) && (
    (wreckGraphic >= 0 && wreckGraphic <= 9) ||
    (wreckGraphic >= GTA2_WRECK_MODEL_BASE && wreckGraphic <= GTA2_WRECK_MODEL_BASE + 9)
  );
}
export function resolveWreckModel(wreckGraphic: number): number {
  if (!Number.isInteger(wreckGraphic)) throw new RangeError(`Invalid wreck graphic ${wreckGraphic}`);
  // Car_BC stores CARI.wreck as an offset and adds WRECK0 when it changes
  // the car into a wreck. Accept both forms so server state and raw metadata
  // can use the same renderer path.
  if (wreckGraphic >= GTA2_WRECK_MODEL_BASE && wreckGraphic <= GTA2_WRECK_MODEL_BASE + 9) {
    return wreckGraphic;
  }
  if (wreckGraphic < 0 || wreckGraphic > 9) throw new RangeError(`Invalid wreck graphic ${wreckGraphic}`);
  return GTA2_WRECK_MODEL_BASE + wreckGraphic;
}

/** Ranges from the code-object definitions used by the original PC build. */
export const GTA2_CODE_OBJECT_SPRITES: Partial<Record<Gta2CodeObjectModel, Gta2SpriteRange>> = {
  [Gta2CodeObjectModel.MachineGunBullet]: { start: 15, count: 3 },
  [Gta2CodeObjectModel.PistolBullet]: { start: 15, count: 3 },
  [Gta2CodeObjectModel.RocketBullet]: { start: 540, count: 1 },
  [Gta2CodeObjectModel.MovingMolotov]: { start: 301, count: 4 },
  // Particle_8::EmitFlameStreamSegment starts at def112+73 and advances
  // through fourteen source frames in Particle_4C state 31.
  [Gta2CodeObjectModel.FlamethrowerFire]: { start: 378, count: 14 },
  [Gta2CodeObjectModel.Grenade]: { start: 281, count: 4 },
  [Gta2CodeObjectModel.OilSlick]: { start: 118, count: 8 },
  [Gta2CodeObjectModel.LandMine]: { start: 126, count: 8 },
  // Shotgun and electro baton are single code-object definitions in the
  // source. Their style bank is not present in every custom STY, so the
  // renderer keeps the authored fallback when a range is absent.
  // Model 192 has zero frames of its own and points at the following 259
  // definition; its shared code-object base is the frame immediately after
  // rocket model 128 (540).
  [Gta2CodeObjectModel.ShotgunBullet]: { start: 541, count: 1 },
  [Gta2CodeObjectModel.ElectroBatonBullet]: { start: 322, count: 4 },
  // Object model 197 is the attached ped flame. Its code-object definition
  // starts at sprite 270 and contains eight frames.
  [Gta2CodeObjectModel.PedFire]: { start: 270, count: 8 },
};

/** Shared code-object bank used by Explosion_30 and Particle_8. The source
 * caches definition 112's sprite base at 305, then addresses effects by
 * offsets from that base rather than by their Object_2C model number. */
export const GTA2_SOURCE_EFFECT_SPRITES = {
  codeObjectBase: 305,
  flameStream: { start: 305 + 73, count: 14 },
  /** Explosion types 18/19/32/33 animate through def112+20..+35. */
  explosionSmall: { start: 305 + 20, count: 16 },
  /** Explosion type 20 animates through def112+56..+71. */
  explosionLarge: { start: 305 + 56, count: 16 },
  /** Explosion_30::SpawnFlashParticle uses the single def112+37 sprite. */
  explosionFlash: { start: 305 + 37, count: 1 },
  /** Fire trails start at def112+96 and use frames through +103. */
  fireTrail: { start: 305 + 96, count: 8 },
  /** Car fire levels 2/3 use Particle_4C's def112+147 sequence. */
  carFireBurst: { start: 305 + 147, count: 16 },
  /** Rocket model 128 leaves Particle_4C state 38 sprites at def112+164..169. */
  rocketTrail: { start: 305 + 164, count: 6 },
  /** Particle_8::EmitBloodBurst uses def112+16 and six state-1 particles. */
  bloodBurst: { start: 305 + 16, count: 1 },
  /** Particle_8::EmitImpactParticles starts at def112+127 and advances to +130. */
  impactBurst: { start: 305 + 127, count: 4 },
  /** Particle_8::EmitWaterSplash starts at def112+132 and advances through the
   * large ballistic debris sequence. The first frame is intentionally repeated
   * by the source on the first update. */
  waterSplash: { start: 305 + 132, count: 14 },
  /** Particle_8::EmitElectricArcParticle selects one of def112+175..178. */
  electricArc: { start: 305 + 175, count: 4 },
} as const satisfies Record<string, Gta2SpriteRange | number>;

/** Authored projectile art selected by Object_2C's source model id.  This is
 * deliberately separate from the public weapon slots: several vehicle
 * weapons dispatch to the same source bullet object, while the car bomb has
 * no code-object sprite at all. */
export const GTA2_SOURCE_OBJECT_SPRITES: Partial<Record<number, Gta2SpriteRange>> = {
  [GTA2_SOURCE_OBJECT_MODELS.rocketBullet]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.RocketBullet],
  [GTA2_SOURCE_OBJECT_MODELS.movingMolotov]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MovingMolotov],
  [GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.FlamethrowerFire],
  [GTA2_SOURCE_OBJECT_MODELS.grenade]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.Grenade],
  [GTA2_SOURCE_OBJECT_MODELS.shotgunBullet]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.ShotgunBullet],
  [GTA2_SOURCE_OBJECT_MODELS.machineGunBullet]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MachineGunBullet],
  [GTA2_SOURCE_OBJECT_MODELS.pistolBullet]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.PistolBullet],
  [GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.ElectroBatonBullet],
  // Char_B4::DrawFlamesAndStartScreamTimer attaches source model 197 to the
  // ped. This is a separate eight-frame code-object definition from the
  // moving flame stream.
  [GTA2_SOURCE_OBJECT_MODELS.pedFire]: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.PedFire],
};

/** Object_2C frame delays read from the source code-object definitions. */
export const GTA2_SOURCE_PROJECTILE_FRAME_TICKS: Partial<Record<number, number>> = {
  [GTA2_SOURCE_OBJECT_MODELS.movingMolotov]: 3,
  [GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire]: 1,
  [GTA2_SOURCE_OBJECT_MODELS.grenade]: 2,
};

/**
 * Particle_4C::UpdateCollisionBurst_state_31_34 advances the first four
 * flame states every source tick, then holds each later state for one extra
 * tick. The source particle remains allocated through its terminal states;
 * the projectile lifetime is kept separately in WORLD.projectile so the
 * collision stream and the authored animation share the same reach.
 */
export const GTA2_FLAME_SEGMENT_FRAME_TICKS = [
  1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
] as const;

/** Authored projectile animations used by the WebGL presentation. */
export const GTA2_WEAPON_PROJECTILE_SPRITES: Record<number, Gta2SpriteRange> = {
  // Pistol/SMG/dual/car-SMG use source models 265/254. Both share the
  // three-frame bullet artwork in the code-object bank.
  0: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.PistolBullet]!,
  1: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MachineGunBullet]!,
  2: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.FlamethrowerFire]!,
  3: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.RocketBullet]!,
  4: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MovingMolotov]!,
  5: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MachineGunBullet]!,
  6: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.OilSlick]!,
  7: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MachineGunBullet]!,
  8: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.Grenade]!,
  9: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.FlamethrowerFire]!,
  10: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.ShotgunBullet]!,
  11: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.LandMine]!,
  12: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.ElectroBatonBullet]!,
  13: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.PistolBullet]!,
  // Vehicle-only source dispatch cases use the closest authored code-object
  // artwork until a style supplies a dedicated tank/fire-truck bank.
  14: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.Grenade]!,
  15: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.RocketBullet]!,
  16: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.ShotgunBullet]!,
  17: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.FlamethrowerFire]!,
  18: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.MachineGunBullet]!,
  19: GTA2_CODE_OBJECT_SPRITES[Gta2CodeObjectModel.Grenade]!,
};

/** Default source blast art: explosion types 18/19/32/33. */
export const GTA2_EXPLOSION_SPRITES: Gta2SpriteRange = GTA2_SOURCE_EFFECT_SPRITES.explosionSmall;
export const GTA2_LARGE_EXPLOSION_SPRITES: Gta2SpriteRange = GTA2_SOURCE_EFFECT_SPRITES.explosionLarge;

/** Source explosion object types used by Car_BC's attached fire effects. */
export const GTA2_CAR_FIRE_SPRITES = {
  small: { start: 12, count: 1 },
  large: { start: 13, count: 1 },
  wreck: { start: 4, count: 1 },
} as const satisfies Record<'small' | 'large' | 'wreck', Gta2SpriteRange>;

/** The values above are source explosion types, not code-object sprite ids.
 * Resolve them through the shared def112 particle bank when drawing. */
export const GTA2_CAR_FIRE_SPRITE_RANGES: Record<number, Gta2SpriteRange> = {
  [GTA2_CAR_FIRE_SPRITES.small.start]: GTA2_SOURCE_EFFECT_SPRITES.fireTrail,
  [GTA2_CAR_FIRE_SPRITES.large.start]: GTA2_SOURCE_EFFECT_SPRITES.carFireBurst,
  // car_fire_4 uses Particle_4C state 4, the same expanding burst bank as
  // the level-two/three fire, rather than the level-one trail bank.
  [GTA2_CAR_FIRE_SPRITES.wreck.start]: GTA2_SOURCE_EFFECT_SPRITES.carFireBurst,
};

/** Exact source frame order for the car-fire particle states. The source does
 * not loop one centered explosion sprite: it emits short-lived particles and
 * advances these frame sequences while they move/fade. */
export const GTA2_CAR_FIRE_FRAME_SEQUENCES: Record<number, readonly number[]> = {
  // Explosion_30::EmitFireTrail_3_12 -> Particle_4C state 3/12.
  [GTA2_CAR_FIRE_SPRITES.small.start]: [
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 96,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 97,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 98,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 99,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 100,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 101,
    GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 102,
  ],
  // Explosion_30::EmitFireTrail_13_14 -> Particle_4C state 36.
  [GTA2_CAR_FIRE_SPRITES.large.start]: Array.from({ length: 16 }, (_, index) => GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 147 + index),
  // Explosion_30::EmitFireTrail_4 -> Particle_4C state 4. State 4 is the
  // expanding directed burst and addresses the same +147 sprite sequence.
  [GTA2_CAR_FIRE_SPRITES.wreck.start]: Array.from({ length: 16 }, (_, index) => GTA2_SOURCE_EFFECT_SPRITES.codeObjectBase + 147 + index),
};

/** Source particle states 18/19/20 advance through their frames for roughly
 * this many fixed updates before the emitted sprite has finished. */
export const GTA2_EXPLOSION_VISUAL_TICKS = 26;
export const GTA2_WATER_SPLASH_VISUAL_TICKS = 15;

/** Original GTA2 car delta slots, in the order stored by DELX. */
export const GTA2_CAR_DAMAGE_SLOTS = [
  'rear-right dent', 'rear-left dent', 'front-left dent', 'front-right dent',
  'windscreen damage', 'right brake light', 'right headlight',
  'right front door 1', 'right front door 2', 'right front door 3', 'right front door 4',
  'right back door 1', 'right back door 2', 'right back door 3', 'right back door 4',
  'emergency light/decal', 'emergency light', 'right rear emergency light', 'left rear emergency light',
  'car-specific light/number', 'car-specific light/number',
  'left brake light', 'left headlight',
  'left front door 1', 'left front door 2', 'left front door 3', 'left front door 4',
  'left back door 1', 'left back door 2', 'left back door 3', 'left back door 4',
] as const;

/** Relative sprite ranges for SCR COLLECT_* pickup objects. */
export const GTA2_PICKUP_SPRITES: Record<number, Gta2SpriteRange> = {
  0: { start: 18, count: 8 },
  1: { start: 26, count: 8 },
  3: { start: 34, count: 8 },
  12: { start: 42, count: 8 },
  4: { start: 50, count: 8 },
  8: { start: 58, count: 8 },
  10: { start: 66, count: 8 },
  2: { start: 82, count: 8 },
  5: { start: 90, count: 8 },
  13: { start: 98, count: 8 },
  6: { start: 118, count: 8 },
  11: { start: 126, count: 8 },
  7: { start: 134, count: 8 },
};
