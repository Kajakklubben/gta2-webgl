import type { NpcState, TrafficState } from '../../protocol/types';
import { GTA2_VEHICLE_WEAPON_MODELS } from '../../domain/combat/weapons';
import { WeaponId, WEAPONS, type WeaponDefinition } from '../../domain/combat/weapons';

/** The weapon selected by the source NPC weapon lookup for this fixed step. */
export interface NpcWeaponSelection {
  readonly weaponId: number;
  readonly sourceType: number;
  readonly vehicleOnly: boolean;
  /** True when the selected slot came from the occupied vehicle's weapon. */
  readonly mounted: boolean;
}

type NpcVehicleWeaponState = Pick<TrafficState, 'model' | 'mountedWeapons'>;

function hasModel(definition: WeaponDefinition, model: number) {
  return definition.vehicleModels?.includes(model) === true;
}

/** Whether a configured vehicle-only slot is valid for the occupied chassis.
 * The source ignores a pedestrian's on-foot weapon while seated and resolves
 * the vehicle weapon from the chassis. Explicit scripted vehicle slots remain
 * useful for fire-truck weapon 21 and installed car-SMG slot 18. */
export function canNpcUseVehicleWeapon(weaponId: number, vehicle: NpcVehicleWeaponState) {
  const definition = WEAPONS[weaponId];
  if (!definition?.vehicleOnly) return false;
  if (definition.requiresInstalledVehicleWeapon) return vehicle.mountedWeapons?.includes(definition.sourceType) === true;
  if (definition.kind === 'mine' || definition.kind === 'slick') return true;
  return hasModel(definition, vehicle.model ?? -1);
}

/** Source Ped::GetWeaponFromPed car dispatch. NPCs in ordinary cars do not
 * borrow their foot weapon; the authored special chassis selects its mounted
 * source slot instead. */
export function sourceNpcVehicleWeapon(vehicle: NpcVehicleWeaponState): number | undefined {
  const model = vehicle.model ?? -1;
  if (GTA2_VEHICLE_WEAPON_MODELS.fireTruck.some(item => item === model)) return WeaponId.FireTruckGun;
  if (GTA2_VEHICLE_WEAPON_MODELS.tank.some(item => item === model)) return WeaponId.TankMainGun;
  if (GTA2_VEHICLE_WEAPON_MODELS.armyJeep.some(item => item === model)) return WeaponId.ArmyGunJeep;
  if (vehicle.mountedWeapons?.includes(WEAPONS[WeaponId.MachineGunCar]!.sourceType)) return WeaponId.MachineGunCar;
  return undefined;
}

/** Select the source NPC weapon before trigger dispatch. Police and gang peds
 * get their authored defaults; a seated NPC gets the vehicle weapon lookup.
 * The returned value is pure so server and deterministic local tests can make
 * the same decision without mutating a second simulation. */
export function selectNpcWeapon(npc: NpcState, vehicle?: NpcVehicleWeaponState): NpcWeaponSelection | undefined {
  let weaponId = npc.weapon;
  let mounted = false;
  if (npc.vehicleId !== undefined && vehicle) {
    if (weaponId === undefined || !canNpcUseVehicleWeapon(weaponId, vehicle)) weaponId = sourceNpcVehicleWeapon(vehicle);
    mounted = weaponId !== undefined && canNpcUseVehicleWeapon(weaponId, vehicle);
    if (!mounted) return undefined;
  } else {
    if (weaponId === undefined) {
      if (npc.kind === 'police') weaponId = WeaponId.SilencedGun;
      else if ((npc.faction ?? 0) > 0) weaponId = WeaponId.Pistol;
    }
  }
  if (weaponId === undefined || !Number.isInteger(weaponId) || weaponId < 0) return undefined;
  const definition = WEAPONS[weaponId];
  if (!definition) return undefined;
  return { weaponId, sourceType: definition.sourceType, vehicleOnly: Boolean(definition.vehicleOnly), mounted };
}

/** Seed the replicated slot/ammo when an NPC enters the object world. Mounted
 * selection is resolved by the authoritative combat phase once its vehicle
 * occupancy link is available. */
export function initializeNpcWeaponState(npc: NpcState) {
  const selection = selectNpcWeapon(npc);
  if (!selection) return;
  npc.weapon = selection.weaponId;
  npc.weaponAmmo ??= WEAPONS[selection.weaponId]?.sourceDefaultAmmo ?? WEAPONS[selection.weaponId]?.ammo ?? 0;
  npc.weaponCooldown ??= 0;
}
