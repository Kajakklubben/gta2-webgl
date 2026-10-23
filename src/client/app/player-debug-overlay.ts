import type { Gta2Game } from '../../shared/game/gta2-game';
import type { PlayerState, TrafficState } from '../../shared/protocol/types';
import { occupantForPlayer } from '../../shared/domain/vehicles/vehicle-occupancy';
import { directionFromRotation } from '../../shared/domain/physics/motion-vector';
import { WORLD } from '../../shared/domain/world/world';

function number(value: number | undefined, digits = 2) { return value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function value(input: boolean | number | string | undefined) { return input === undefined ? '—' : String(input); }

function vehicleText(vehicle: TrafficState, playerId?: string, renderOrder?: number) {
  const occupant = playerId === undefined ? undefined : occupantForPlayer(vehicle, playerId);
  const passengerIndex = playerId === undefined ? -1 : vehicle.passengers.indexOf(playerId);
  const occupants = vehicle.occupants.length ? vehicle.occupants.map(item => `${item.id}:${item.state}@${item.progress.toFixed(2)}`).join(', ') : 'none';
  const lines = [
    `CAR ${vehicle.id} · model ${value(vehicle.model)}${renderOrder === undefined ? '' : ` · RO:${renderOrder}`} · seat ${passengerIndex < 0 ? '—' : passengerIndex === 0 ? 'driver' : `passenger ${passengerIndex}`}`,
    `pos      x ${number(vehicle.x)} · y ${number(vehicle.y)} · z ${number(vehicle.z)} · layer ${value(vehicle.collisionLayer)}`,
    `heading  rotation ${number(vehicle.rotation)} rad · angular ${number(vehicle.angularVelocity)} · speed ${number(vehicle.speed)}`,
    `velocity vx ${number(vehicle.vx)} · vy ${number(vehicle.vy)} · grounded ${value(vehicle.grounded)} · vertical ${number(vehicle.verticalVelocity)}`,
    `input    throttle ${number(vehicle.throttle)} · brake ${number(vehicle.brakePressure)} · handbrake ${number(vehicle.handbrakeForce)}`,
    `damage   health ${Math.round(vehicle.health)} · raw ${value(vehicle.damage)} · level ${value(vehicle.damageLevel)} · phase ${vehicle.damagePhase ?? 'new'}`,
    `ai       state ${vehicle.aiState ?? 'none'} · route ${value(vehicle.routeNode)} → target ${value(vehicle.targetNode)} · junction ${value(vehicle.junction)} · signal ${vehicle.signal ?? 'none'}`,
    `lights   brake ${vehicle.brakeLights ?? false} · head ${vehicle.headlights ?? false} · emergency ${vehicle.emergencyLights ?? false} · horn ${vehicle.horn ?? false}`,
    `doors    mask ${value(vehicle.doors)} · lock ${vehicle.doorLock ?? '—'} · occupant ${occupant?.state ?? 'not-listed'} · all ${occupants}`,
  ];
  if (vehicle.transport || vehicle.serviceStop !== undefined || vehicle.pursuitTarget) lines.push(`service  ${vehicle.transport ?? 'none'} · stop ${value(vehicle.serviceStop)} · pursuit ${vehicle.pursuitTarget ?? 'none'}`);
  if (vehicle.fireTicks !== undefined || vehicle.collisionCooldown !== undefined || vehicle.wreckTimer !== undefined) lines.push(`timers   fire ${value(vehicle.fireTicks)} · collision ${value(vehicle.collisionCooldown)} · wreck ${value(vehicle.wreckTimer)}`);
  return lines.join('\n');
}

export function createPlayerDebugOverlay(elements: { stateOverlay: HTMLElement }, options: { getLocalId(): string; getSplitScreen(): boolean; getEnabled(): boolean; getRenderOrder?(vehicleId: number): number | undefined }) {
  const playerText = (player: PlayerState, game: Gta2Game, label: string) => {
    const forward = directionFromRotation(player.rotation), mapX = Math.round(player.x / WORLD.tileSize), mapY = Math.round(-player.y / WORLD.tileSize), floor = game.level.map[mapX]?.[mapY]?.[0];
    const lines = [`${label} PLAYER ${player.id}`, `pos      x ${number(player.x)} · y ${number(player.y)} · z ${number(player.z)} · layer ${value(player.collisionLayer)}`, `forward  x ${number(forward.x)} · y ${number(forward.y)} · rotation ${number(player.rotation)} rad`, `velocity vx ${number(player.vx)} · vy ${number(player.vy)} · grounded ${value(player.grounded)} · vertical ${number(player.verticalVelocity)}`, `state    animation ${player.animation?.kind ?? 'none'} · vehicle ${player.vehicleId ?? 'none'} · jump ${player.jump?.phase ?? 'none'}`, `combat   health ${Math.round(player.combat.health)} · armor ${Math.round(player.armor)} · weapon ${player.combat.weapon} · respawn ${player.combat.respawn}`, `surface  water ${game.pedestrianNavigation.isWaterAt({ x: player.x, y: player.y, z: player.z })} · ground ${game.pedestrianNavigation.groundTypeAt({ x: player.x, y: player.y, z: player.z })}`, `map      cell ${mapX},${mapY} · floor ${floor?.groundType ?? 'none'} · lid ${floor?.Lid.tileNumber ?? 'none'}`];
    if (player.movement) lines.push(`movement speed ${number(player.movement.speed)} · turn ${number(player.movement.turnSpeed)} · direction ${player.movement.moveDirection}`);
    if (player.drowningTimer !== undefined || player.combat.onFire) lines.push(`status   drowning ${value(player.drowningTimer)} · onFire ${player.combat.onFire} · fireTimer ${player.combat.fireTimer}`);
    if (player.jump) lines.push(`jump     phase ${player.jump.phase} · progress ${number(player.jump.progress)} · height ${number(player.jump.height)} · carry ${number(player.jump.vx)}, ${number(player.jump.vy)}`);
    if (player.vehicleId !== undefined) {
      const vehicle = game.gameState.vehicleStates.find(item => item.id === player.vehicleId);
      if (!vehicle) lines.push('', 'CAR      missing from current game state');
      else lines.push('', vehicleText(vehicle, player.id, options.getRenderOrder?.(vehicle.id)));
    }
    return lines.join('\n');
  };
  return {
    update(game: Gta2Game, states: readonly PlayerState[]) {
      if (!options.getEnabled()) { elements.stateOverlay.hidden = true; return; }
      const ids = options.getSplitScreen() ? ['local-player-1', 'local-player-2'] : [options.getLocalId()];
      const players = ids.map(id => game.gameState.playerStates.get(id) ?? states.find(state => state.id === id)).filter((player): player is PlayerState => Boolean(player));
      elements.stateOverlay.textContent = players.length ? players.map((player, index) => playerText(player, game, options.getSplitScreen() ? `P${index + 1}` : 'LOCAL')).join('\n\n') : 'No local player state';
      elements.stateOverlay.hidden = false;
    },
  };
}

export function createCarDebugOverlay(elements: { stateOverlay: HTMLElement }, options: { getEnabled(): boolean; getRenderOrder(vehicleId: number): number | undefined }) {
  return {
    update(game: Gta2Game) {
      if (!options.getEnabled()) { elements.stateOverlay.hidden = true; return; }
      const vehicles = game.gameState.vehicleStates;
      elements.stateOverlay.textContent = vehicles.length ? vehicles.map(vehicle => vehicleText(vehicle, undefined, options.getRenderOrder(vehicle.id))).join('\n\n') : 'No cars in view';
      elements.stateOverlay.hidden = false;
    },
  };
}
