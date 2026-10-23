import { drawHudWeaponIcon } from './main-ui';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import type { Gta2Game } from '../../shared/game/gta2-game';
import type { PlayerState } from '../../shared/protocol/types';
import type { Style } from '../../shared/engine/loader/style-parser';

export interface PlayerHudElements {
  weaponName: HTMLElement; ammo: HTMLElement; hearts: HTMLElement; armor: HTMLElement; wanted: HTMLElement;
  money: HTMLElement; score: HTMLElement; vehicle: HTMLElement; vehicleValue: HTMLElement; status: HTMLElement; weaponIcon: HTMLCanvasElement;
}

export function updatePlayerHud(player: PlayerState, elements: PlayerHudElements, game: Gta2Game | undefined, style: Style) {
  const combat = player.combat;
  const weapon = combat.weapon >= 0 ? WEAPONS[combat.weapon] : undefined;
  const wanted = Math.max(0, Math.min(5, player.wanted));
  const healthyHearts = Math.max(0, Math.min(5, Math.ceil(Math.max(0, combat.health) / 20)));
  elements.weaponName.textContent = weapon?.name.toUpperCase() ?? 'NO WEAPON';
  elements.ammo.textContent = weapon ? `AMMO ${combat.ammo[combat.weapon] ?? 0}` : 'AMMO —';
  elements.hearts.textContent = `${'♥'.repeat(healthyHearts)}${'♡'.repeat(5 - healthyHearts)}`;
  elements.hearts.setAttribute('aria-label', `Health ${Math.max(0, Math.round(combat.health))} percent`);
  elements.armor.textContent = String(Math.max(0, Math.round(player.armor))).padStart(3, '0');
  elements.wanted.textContent = `${'★'.repeat(wanted)}${'☆'.repeat(5 - wanted)}`;
  elements.money.textContent = `$${Math.max(0, Math.round(player.money)).toString().padStart(6, '0')}`;
  elements.score.textContent = Math.max(0, Math.round(player.score)).toString().padStart(6, '0');
  const drivenVehicle = player.vehicleId === undefined ? undefined : game?.gameState.vehicleStates.find(vehicle => vehicle.id === player.vehicleId);
  elements.vehicle.hidden = !drivenVehicle;
  if (drivenVehicle) elements.vehicleValue.textContent = `${Math.max(0, Math.round(drivenVehicle.health))}%`;
  elements.status.textContent = combat.respawn ? `WASTED · ${Math.ceil(combat.respawn / 30)}s` : '';
  elements.status.hidden = !combat.respawn;
  drawHudWeaponIcon(style, combat.weapon, elements.weaponIcon);
}
