import type { CombatState } from '../../protocol/types';
import { WORLD, tilesPerSecondToWorld } from '../world/world';
import { GTA2_SOURCE_OBJECT_MODELS } from '../world/gta2-sprites';

export type { WeaponDefinition } from '../../engine/loader/models/weapons';
import type { WeaponDefinition } from '../../engine/loader/models/weapons';

export enum WeaponId {
  /** Source Player::GetCurrPlayerWeapon returns NULL for this selection. */
  None = -1,
  Pistol = 0,
  MachineGun = 1,
  Flamethrower = 2,
  RocketLauncher = 3,
  Molotov = 4,
  SilencedGun = 5,
  OilSlicks = 6,
  MachineGunCar = 7,
  Grenade = 8,
  StunGun = 9,
  Shotgun = 10,
  LandMines = 11,
  ElectroShock = 12,
  DualShotPistol = 13,
  /** Appended slots for Weapon_30's vehicle-only dispatch cases. Existing
   * pickup slots stay stable because SCR uses the first fourteen indices. */
  CarBomb = 14,
  TankMainGun = 15,
  FireTruckGun = 16,
  FireTruckFlamethrower = 17,
  ArmyGunJeep = 18,
  SpecialVehicleBomb = 19,
}

/** Complete Weapon_30 enum values, including vehicle-only dispatch cases that
 * are not player pickup slots in the current multiplayer protocol. */
export const GTA2_SOURCE_WEAPON_TYPES = {
  pistol: 0, smg: 1, rocket: 2, shocker: 3, molotov: 4, grenade: 5,
  shotgun: 6, electroBaton: 7, flamethrower: 8, silencedSmg: 9,
  dualPistol: 10, carBomb: 15, oilStain: 16, carMines: 17, carSmg: 18,
  tankMainGun: 19, fireTruckGun: 20, fireTruckFlamethrower: 21,
  armyGunJeep: 22, unknown23: 23,
} as const;

/** Source-sized reach for one continuously emitted model-154 stream segment. */
export const GTA2_FLAME_STREAM_RANGE = WORLD.projectile.flameSpeed / WORLD.tickRate * WORLD.tileSize * WORLD.projectile.flameSegmentLifetimeTicks;
/** Render scale for each moving flame segment. The source emitter creates one
 * segment per trigger tick; its frame holds, rather than its spawn cadence,
 * create the visible gaps in the stream. */
export const GTA2_FLAME_SEGMENT_SCALE = 1;
/** Presentation-only lead from the projectile point toward the muzzle-facing
 * side, keeping the first flame visibly attached to the weapon without
 * changing its collision or damage origin. */
export const GTA2_FLAME_MUZZLE_LEAD = 6;
/** Weapon_30 attaches NewLight(94, 138, 2, 0xFF8000, 3, 255) to the
 * moving Molotov fire object. Radius is converted once at the source/world
 * boundary; renderer intensity is normalized to the Three.js light range. */
export const GTA2_MOLOTOV_LIGHT = {
  color: 0xff8000,
  radius: WORLD.tileSize * 3,
  intensity: 1,
} as const;
/** Source shocker_5E06B0 searches a two-unit collision prism around the
 * shooter, then a one-unit prism around each chained ped. Runtime positions
 * are world pixels on a 64-pixel tile grid. */
export const GTA2_SHOCKER_INITIAL_RADIUS = WORLD.tileSize * 2;
export const GTA2_SHOCKER_CHAIN_RADIUS = WORLD.tileSize;
/** shocker_5E06B0 accepts diff < 180 || diff > 1260. The original source's
 * Ang16 normalizer uses a 1440-unit turn, so this is a 45-degree half-cone. */
export const GTA2_SHOCKER_HALF_ANGLE = 180 * Math.PI * 2 / 1440;
/** electro_batton_5E0740's sub_5DE4F0 rejects targets farther than Fix16(3). */
export const GTA2_ELECTRO_BATON_RANGE = WORLD.tileSize * 3;
/** Source pistol/dual-pistol muzzle offset: kFP16Quarter is one quarter of a
 * map tile from the camera position. Other weapons use their own authored
 * offsets in `playerWeaponOrigin`; these constants remain public for clients
 * that need the base source pose. */
export const GTA2_PLAYER_FIRE_POINT_FORWARD = WORLD.tileSize / 4;
export const GTA2_PLAYER_FIRE_POINT_RIGHT = 0;
/** Weapon_8::dual_pistol_5DDA70 uses one quarter-forward origin and emits
 * the two projectiles at +/-48 source Ang16. Keeping this public makes the
 * authored two-ray contract explicit without changing the pickup slots. */
export const GTA2_DUAL_PISTOL_SPREAD = [-48, 48] as const;

/** Source Weapon_30's vehicle attachment families. Model ids are the CARI
 * model ids, not sprite-bank indices. */
export const GTA2_VEHICLE_WEAPON_MODELS = {
  tank: [54],
  fireTruck: [17],
  armyJeep: [22],
} as const;

/**
 * The public slots are kept stable because SCR COLLECT ids and multiplayer
 * snapshots use them.  `sourceType`, cooldowns, spreads and object models are
 * taken from Weapon_30.cpp; damage/range are the game's existing balance
 * values because those are applied by the object/car definitions rather than
 * in the weapon dispatch routines.
 */
export const WEAPONS: readonly WeaponDefinition[] = [
  // pistol_5DD860: model 265, reload speed 20, quarter-radius muzzle.
  { name: 'Pistol', damage: 25, playerDamage: 20, npcDamage: 50, range: 480, interval: 20, ammo: 60, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 1, kind: 'bullet', sourceType: 0, sourceModel: GTA2_SOURCE_OBJECT_MODELS.pistolBullet, spread: [0], waterDeath: true, reportsCrime: true },
  // smg_5DDD20: model 254, reload speed 2.
  { name: 'Machine gun', damage: 10, playerDamage: 10, npcDamage: 25, range: 560, interval: 2, ammo: 180, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 1, kind: 'bullet', sourceType: 1, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet, spread: [0], waterDeath: true, reportsCrime: true },
  // flamethrower_5DD0F0 emits model 154 segments continuously.
  { name: 'Flamethrower', damage: 7, npcDamage: 5, range: GTA2_FLAME_STREAM_RANGE, interval: 1, ammo: 120, maxAmmo: 990, sourceDefaultAmmo: 200, pellets: 1, kind: 'flame', sourceType: 8, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, impactModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact, spread: [0], moving: true, waterDeath: true, reportsCrime: true },
  // rocket_5E3850: model 128, reload speed 50.
  { name: 'Rocket launcher', damage: 100, playerDamage: 10, npcDamage: 25, range: 900, interval: 50, ammo: 12, maxAmmo: 990, sourceDefaultAmmo: 50, pellets: 1, kind: 'rocket', sourceType: 2, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet, impactModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact, spread: [0], moving: true, waterDeath: true, reportsCrime: true },
  // throwable_5DDFC0 with moving_molotov_138 and charge/release.
  { name: 'Molotov cocktail', damage: 60, playerDamage: 10, npcDamage: 25, range: 360, interval: 4, ammo: 12, maxAmmo: 990, sourceDefaultAmmo: 50, pellets: 1, kind: 'explosive', sourceType: 4, sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingMolotov, impactModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact, spread: [0], throwable: true, moving: true, waterDeath: true, reportsCrime: true },
  // silence_smg shares smg_5DDD20 but skips AddThreateningPed/ReportCrime.
  { name: 'Silenced gun', damage: 25, playerDamage: 10, npcDamage: 25, range: 520, interval: 2, ammo: 60, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 1, kind: 'bullet', sourceType: 9, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet, spread: [0], silent: true, reportsCrime: false, waterDeath: true },
  // oil_stain_5E1DC0 places source object model 8 behind the car.  COLLECT_16
  // remains pickup/sprite model 216 in the SCR/STY bank.
  { name: 'Oil slicks', damage: 0, range: 90, interval: 1, ammo: 8, maxAmmo: 990, sourceDefaultAmmo: 50, pellets: 1, kind: 'slick', sourceType: 16, sourceModel: 8, spriteModel: 216, spread: [0], vehicleOnly: true },
  // car_smg_5E2940 emits two model 254 bullets from the left/right gun points.
  { name: 'Machine gun car', damage: 14, playerDamage: 10, npcDamage: 25, range: 620, interval: 2, ammo: 240, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 2, kind: 'bullet', sourceType: 18, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet, hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, spread: [0], vehicleOnly: true, requiresInstalledVehicleWeapon: true, moving: true, waterDeath: true, reportsCrime: true },
  // grenade weapon_type 5; trigger charges to 96 then throwable_5DDFC0.
  { name: 'Grenade', damage: 75, npcDamage: 25, range: 400, interval: 4, ammo: 12, maxAmmo: 990, sourceDefaultAmmo: 50, pellets: 1, kind: 'explosive', sourceType: 5, sourceModel: GTA2_SOURCE_OBJECT_MODELS.grenade, impactModel: 159, spread: [0], throwable: true, moving: true, waterDeath: true, reportsCrime: true },
  // shocker_5E06B0 is the recursive cone/beam weapon, not a bullet trace.
  { name: 'Stun gun', damage: 0, npcDamage: 0, range: GTA2_SHOCKER_INITIAL_RADIUS, interval: 1, ammo: 20, maxAmmo: 990, sourceDefaultAmmo: 200, pellets: 1, kind: 'stun', sourceType: 3, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, impactModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact, spread: [0], reportsCrime: true },
  // shotgun_5DD290 creates exactly five model 192 projectiles at +/-48 Ang16.
  { name: 'Shotgun', damage: 16, playerDamage: 10, npcDamage: 25, range: 300, interval: 40, ammo: 30, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 5, kind: 'bullet', sourceType: 6, sourceModel: GTA2_SOURCE_OBJECT_MODELS.shotgunBullet, impactModel: GTA2_SOURCE_OBJECT_MODELS.tankTopImpact, spread: [48, 24, 0, -24, -48], waterDeath: true, reportsCrime: true },
  // car_mine_5E2550 places source object model 10 behind the car.  COLLECT_17
  // remains pickup/sprite model 217 in the SCR/STY bank.
  { name: 'Land mines', damage: 90, range: 80, interval: 1, ammo: 8, maxAmmo: 990, sourceDefaultAmmo: 50, pellets: 1, kind: 'mine', sourceType: 17, sourceModel: 10, spriteModel: 217, spread: [0], vehicleOnly: true },
  // electro_batton_5E0740 fires model 277, reload speed 20.
  { name: 'Electro-shock', damage: 3, npcDamage: 3, range: GTA2_ELECTRO_BATON_RANGE, interval: 20, ammo: 30, maxAmmo: 990, sourceDefaultAmmo: 200, pellets: 1, kind: 'shock', sourceType: 7, sourceModel: GTA2_SOURCE_OBJECT_MODELS.electroBatonBullet, impactModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, spread: [0], moving: true, waterDeath: true, reportsCrime: true },
  // dual_pistol_5DDA70 uses Weapon_8::word_706D5E = 48 Ang16 on each side.
  { name: 'Dual shot pistol', damage: 22, playerDamage: 20, npcDamage: 50, range: 480, interval: 10, ammo: 60, maxAmmo: 990, sourceDefaultAmmo: 100, pellets: 2, kind: 'bullet', sourceType: 10, sourceModel: GTA2_SOURCE_OBJECT_MODELS.pistolBullet, spread: GTA2_DUAL_PISTOL_SPREAD, waterDeath: true, reportsCrime: true },
  // Weapon_30::car_bomb_5E0AB0. The normal car bomb creates model 132; the
  // special type 23 dispatch detonates immediately instead.
  { name: 'Car bomb', damage: 320, npcDamage: 50, range: 160, interval: 1, ammo: 1, maxAmmo: 10, sourceDefaultAmmo: 10, pellets: 1, kind: 'explosive', sourceType: 15, sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb, impactModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact, spread: [0], vehicleOnly: true, moving: true, waterDeath: true, reportsCrime: true },
  // Tank main gun: source fires a rocket object from the turret at interval 50.
  { name: 'Tank cannon', damage: 100, playerDamage: 10, npcDamage: 25, range: 960, interval: 50, ammo: 20, maxAmmo: 990, sourceDefaultAmmo: 500, pellets: 1, kind: 'rocket', sourceType: 19, sourceModel: GTA2_SOURCE_OBJECT_MODELS.rocketBullet, hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact, impactModel: GTA2_SOURCE_OBJECT_MODELS.tankTopImpact, spread: [0], vehicleOnly: true, vehicleModels: GTA2_VEHICLE_WEAPON_MODELS.tank, moving: true, waterDeath: true, reportsCrime: true },
  // Fire truck's direct gun/impact dispatches. The source's stream is a
  // moving object and its terminal impact is model 199/195.
  { name: 'Fire truck gun', damage: 20, playerDamage: 2, npcDamage: 5, range: 720, interval: 1, ammo: 50, maxAmmo: 990, sourceDefaultAmmo: 500, pellets: 1, kind: 'bullet', sourceType: 20, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet, hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.impactChild, impactModel: GTA2_SOURCE_OBJECT_MODELS.impactChild, spread: [0], vehicleOnly: true, vehicleModels: GTA2_VEHICLE_WEAPON_MODELS.fireTruck, consumesAmmo: false, moving: true, waterDeath: false, waterCannon: true, reportsCrime: true },
  { name: 'Fire truck flamethrower', damage: 7, npcDamage: 5, range: GTA2_FLAME_STREAM_RANGE, interval: 1, ammo: 20, maxAmmo: 990, sourceDefaultAmmo: 200, pellets: 1, kind: 'flame', sourceType: 21, sourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact, impactModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerImpact, spread: [0], vehicleOnly: true, vehicleModels: GTA2_VEHICLE_WEAPON_MODELS.fireTruck, consumesAmmo: false, moving: true, waterDeath: true, reportsCrime: true },
  // Army jeep gun is the source machine-gun dispatch (model 254, interval 2).
  { name: 'Army jeep gun', damage: 10, playerDamage: 10, npcDamage: 25, range: 620, interval: 2, ammo: 50, maxAmmo: 990, sourceDefaultAmmo: 500, pellets: 1, kind: 'bullet', sourceType: 22, sourceModel: GTA2_SOURCE_OBJECT_MODELS.machineGunBullet, hitSourceModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, impactModel: GTA2_SOURCE_OBJECT_MODELS.flamethrowerFire, spread: [0], vehicleOnly: true, vehicleModels: GTA2_VEHICLE_WEAPON_MODELS.armyJeep, moving: true, waterDeath: true, reportsCrime: true },
  // Weapon_30's otherwise-unused type 23 is the instant car bomb variant.
  { name: 'Special car bomb', damage: 320, npcDamage: 50, range: 1, interval: 1, ammo: 1, maxAmmo: 10, sourceDefaultAmmo: 10, pellets: 1, kind: 'explosive', sourceType: 23, sourceModel: GTA2_SOURCE_OBJECT_MODELS.movingCarBomb, impactModel: GTA2_SOURCE_OBJECT_MODELS.explosiveImpact, spread: [0], vehicleOnly: true, throwable: false, moving: false },
] as const;

/** The source stores weapon spread in Ang16 (a 1440-unit circle), unlike the
 * runtime's general 2048-unit heading convention. */
export const sourceWeaponAngleToRadians = (angle: number) => angle * Math.PI * 2 / 1440;

/** Number of fixed-step ticks needed to cover the authored range at its world speed. */
export const projectileTravelTicks = (weapon: number) => {
  const definition = WEAPONS[weapon];
  if (!definition) return WORLD.projectile.minimumTravelTicks;
  let speed = WORLD.projectile.bulletSpeed;
  if (definition.kind === 'shock') speed = WORLD.projectile.electroSpeed;
  else if (definition.sourceModel === GTA2_SOURCE_OBJECT_MODELS.shotgunBullet || definition.kind === 'rocket') speed = WORLD.projectile.rocketSpeed;
  else if (definition.kind === 'explosive' || definition.kind === 'mine') speed = WORLD.projectile.thrownSpeed;
  else if (definition.kind === 'flame') speed = WORLD.projectile.flameSpeed;
  return Math.max(WORLD.projectile.minimumTravelTicks, Math.ceil(definition.range / tilesPerSecondToWorld(speed) * WORLD.tickRate));
};

/**
 * Convert the exact `Weapon_30::throwable_5DDFC0` speed formula to the
 * browser's world-pixel/second units.  The source constants are Fix16 values
 * whose fractional part is 1/0x4000 and the world runtime advances at the same
 * fixed tick rate as the original game.
 */
export const sourceThrowableSpeed = (weapon: number, throwStrength: number) => {
  const source = WORLD.projectile.sourceThrow;
  const strength = Math.max(0, Math.min(60, throwStrength));
  const ratio = strength / 60;
  let speedPerTick = (source.molotovBase + ratio * source.sharedRamp) * source.fix16Scale;
  if (weapon === WeaponId.Grenade) speedPerTick = (source.grenadeBase + ratio * (source.sharedRamp + source.molotovBase)) * source.fix16Scale;
  return speedPerTick * WORLD.tileSize * WORLD.tickRate;
};

/** Compose a throwable's source launch vector. Weapon_30 first adds the
 * ped's movement vector to the aimed projectile vector, then increases the
 * resulting scalar speed by dword_706C8C while keeping that combined angle.
 * Returning browser world units keeps the conversion at this domain boundary. */
export const sourceThrowableVelocity = (
  weapon: number,
  throwStrength: number,
  direction: { x: number; y: number },
  carried: { x: number; y: number } = { x: 0, y: 0 },
) => {
  const speed = sourceThrowableSpeed(weapon, throwStrength);
  const aimed = { x: direction.x * speed, y: direction.y * speed };
  const carriedLength = Math.hypot(carried.x, carried.y);
  if (carriedLength <= 1e-6) return aimed;

  const combined = { x: aimed.x + carried.x, y: aimed.y + carried.y };
  const combinedLength = Math.hypot(combined.x, combined.y);
  const angleX = combinedLength > 1e-6 ? combined.x / combinedLength : direction.x;
  const angleY = combinedLength > 1e-6 ? combined.y / combinedLength : direction.y;
  const carriedBoost = WORLD.projectile.sourceThrow.carriedVelocity
    * WORLD.projectile.sourceThrow.fix16Scale * WORLD.tileSize * WORLD.tickRate;
  const finalSpeed = combinedLength + carriedBoost;
  return { x: angleX * finalSpeed, y: angleY * finalSpeed };
};

export const isVehicleWeapon = (weapon: number) => Boolean(WEAPONS[weapon]?.vehicleOnly);
// Players begin with the base pistol only. The runtime's 60-round opening
// inventory is an intentional multiplayer balance/default, while the source
// Weapon_8 pickup table's pistol default is 10 clips (100 rounds). Every other
// weapon is acquired from an authored pickup or a scripted GIVE_WEAPON action;
// do not manufacture a full loadout here.
export const newCombat = (): CombatState => ({
  weapon: 0,
  ammo: WEAPONS.map((weapon, index) => {
    if (index === 0) return weapon.ammo;
    return 0;
  }),
  health: 100,
  cooldown: 0,
  previousKeys: 0,
  respawn: 0,
  shockCounter: 0,
  electrocuted: false,
  onFire: false,
  fireTimer: 0,
  throwCharge: 0,
  throwing: false,
  throwAnimation: 0,
  attacking: false,
  fireAnimation: 0,
  shots: [],
});
