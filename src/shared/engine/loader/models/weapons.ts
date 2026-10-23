/** Asset-facing weapon definition. It contains only authored weapon data and
 * is independent of network snapshots and runtime game objects. */
export interface WeaponDefinition {
  name: string;
  damage: number;
  /** Source packet used when this weapon hits a pedestrian.  Keeping this
   * separate from the vehicle packet lets one object model reproduce the
   * source's different Char_B4 and Car_BC damage paths. */
  npcDamage?: number;
  /** Source packet used when this weapon hits the player ped.  Weapon_30's
   * object handler uses a separate player multiplier (pistol is doubled). */
  playerDamage?: number;
  range: number;
  interval: number;
  ammo: number;
  /** Weapon_8::get_defalt_ammo multiplied by Weapon_30's ten-round clip
   * unit. This is the amount a source pickup/car allocation starts with. */
  sourceDefaultAmmo?: number;
  /** Source Weapon_30 total capacity (the 99-clip table multiplied by ten).
   * Runtime ammo remains in source clip units, but pickups are capped here. */
  maxAmmo?: number;
  pellets: number;
  kind: 'bullet' | 'flame' | 'rocket' | 'explosive' | 'slick' | 'stun' | 'mine' | 'shock';
  sourceType: number;
  sourceModel?: number;
  spriteModel?: number;
  impactModel?: number;
  /** Object model emitted when the source ray already has a target. */
  hitSourceModel?: number;
  /** Object model used for an authored no-target transition, when one exists. */
  missSourceModel?: number;
  spread: readonly number[];
  silent?: boolean;
  vehicleOnly?: boolean;
  throwable?: boolean;
  moving?: boolean;
  /** Moving objects of this family are destroyed by a water column before
   * they can resolve a hit or explosion. */
  waterDeath?: boolean;
  /** Source water-cannon dispatch (model 198): extinguishes fire, applies
   * pedestrian water-hit packets, and never applies a vehicle damage packet. */
  waterCannon?: boolean;
  /** Vehicle-mounted sources do not all consume the driver's ammo pool. */
  consumesAmmo?: boolean;
  /** Source weapons report a weapon-fired crime/threat event when emitted. */
  reportsCrime?: boolean;
  /** Valid chassis models for built-in mounted weapons. */
  vehicleModels?: readonly number[];
  /** Car-SMG is an installed upgrade rather than a model-wide capability. */
  requiresInstalledVehicleWeapon?: boolean;
}
