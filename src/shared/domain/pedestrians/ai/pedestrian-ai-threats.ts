import type { NpcState, PlayerState, TrafficState } from '../../../protocol/types';
import { isVehicleWeapon, WeaponId } from '../../combat/weapons';
import { rotationFromDirection } from '../../physics/motion-vector';
import { GTA2GroundType } from '../../world/gta2-enums';
import { WORLD } from '../../world/world';
import { PedestrianNavigation } from '../pedestrian-navigation';
import { CIVILIAN_SCARE_RADIUS, CIVILIAN_SAFE_RADIUS, FAST_CAR_MIN_SPEED, maxAxisDistance } from './pedestrian-ai-support';

export function startJumpOver(npc: NpcState, vehicle: TrafficState) {
  if (npc.jump || npc.vehicleId !== undefined || npc.health <= 0) return false;
  let vx = vehicle.vx, vy = vehicle.vy;
  if (Math.hypot(vx, vy) < 1e-3) { vx = npc.x - vehicle.x; vy = npc.y - vehicle.y; }
  const length = Math.hypot(vx, vy);
  if (length < 1e-3) return false;
  const speed = Math.max(WORLD.player.jumpSpeed, length);
  npc.jump = { phase: 'rising', progress: 0, height: 0, baseZ: Math.max(npc.z, vehicle.z), vx: vx / length * speed, vy: vy / length * speed, vehicleCollision: false };
  npc.z = npc.jump.baseZ;
  npc.vx = npc.jump.vx; npc.vy = npc.jump.vy;
  npc.rotation = rotationFromDirection(npc.vx, npc.vy, npc.rotation);
  npc.state = 'walk'; npc.animation = 'jumping';
  return true;
}

function threatFor(player: PlayerState) {
  return player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact);
}

export function activePlayer(player: PlayerState) {
  return player.combat.respawn <= 0 && player.combat.health > 0;
}

/**
 * CarPhysics_B0 only adds the driver to the source's threatening-ped list when
 * the car is moving fast enough or its horn is sounding, and only when the car
 * is on pavement or field. A road is deliberately excluded: normal driving
 * on a road must not make nearby civilians flee.
 */
function fastCarThreatFor(player: PlayerState, traffic: readonly TrafficState[], navigation: PedestrianNavigation) {
  if (player.vehicleId === undefined) return false;
  const vehicle = traffic.find(item => item.id === player.vehicleId);
  if (!vehicle) return false;
  const groundType = navigation.groundTypeAt(vehicle);
  if (groundType !== GTA2GroundType.Pavement && groundType !== GTA2GroundType.Field) return false;
  const speed = Math.max(Math.abs(vehicle.speed), Math.hypot(vehicle.vx, vehicle.vy));
  return speed > FAST_CAR_MIN_SPEED || vehicle.horn === true;
}

/**
 * This is the browser equivalent of the source's selected weapon/car check in
 * Threat_Reaction_AI. A civilian reacts to a visible weapon before the first
 * bullet is fired; a car is a threat only when the source fast-car reaction
 * has added its driver to the threatening-ped list. Empty weapon slots and
 * vehicle weapons carried on foot are not visible threats.
 */
function civilianThreatFor(player: PlayerState, traffic: readonly TrafficState[], navigation: PedestrianNavigation) {
  if (!activePlayer(player)) return false;
  if (player.vehicleId !== undefined) return fastCarThreatFor(player, traffic, navigation) || threatFor(player);
  if (threatFor(player)) return true;
  const combat = player.combat;
  const weapon = combat.weapon;
  if (weapon === WeaponId.None) return false;
  return (combat.ammo[weapon] ?? 0) > 0 && !isVehicleWeapon(weapon);
}

function nearestCivilianThreat(npc: NpcState, players: readonly PlayerState[], traffic: readonly TrafficState[], navigation: PedestrianNavigation): PlayerState | undefined {
  let selected: PlayerState | undefined;
  let selectedDistance = CIVILIAN_SCARE_RADIUS;
  for (const player of players) {
    if (!civilianThreatFor(player, traffic, navigation) || Math.abs(player.z - npc.z) > 1.05) continue;
    const currentDistance = maxAxisDistance(npc, player);
    if (currentDistance < selectedDistance) {
      selected = player;
      selectedDistance = currentDistance;
    }
  }
  return selected;
}

export function activeCivilianThreat(npc: NpcState, players: readonly PlayerState[], traffic: readonly TrafficState[], navigation: PedestrianNavigation): PlayerState | undefined {
  // FleeCharOnFootTillSafe keeps the original target until the ped is safe;
  // it does not immediately forget the threat when the weapon is lowered.
  if (npc.threatenedBy !== undefined && (npc.threatTimer ?? 0) > 0) {
    const explicit = players.find(player => player.id === npc.threatenedBy && activePlayer(player) && maxAxisDistance(npc, player) <= CIVILIAN_SCARE_RADIUS);
    if (explicit) return explicit;
  }
  if (npc.state === 'flee' && npc.target !== undefined) {
    const target = players.find(player => player.id === npc.target);
    if (target && activePlayer(target) && maxAxisDistance(npc, target) <= CIVILIAN_SAFE_RADIUS) return target;
  }
  return nearestCivilianThreat(npc, players, traffic, navigation);
}
