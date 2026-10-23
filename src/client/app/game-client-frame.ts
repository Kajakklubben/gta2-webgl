import { FixedClock } from '../../shared/engine/fixed-clock';
import { Gta2Game } from '../../shared/game/gta2-game';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';
import type { Input } from '../../shared/protocol/types';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import { WORLD } from '../../shared/domain/world/world';
import { Renderer } from '../rendering/renderer';
import type { PlayerHud } from './main-ui';
import { updatePlayerHud } from './game-client-hud';
import { buildPlayerInput, type LocalPlayerInputState } from './player-input';
import { controlTransitions, gamepadActions, gamepadFor, gamepadMask } from './input-bindings';
import type { ClientAssetBundle } from '../../shared/engine/loader/models/catalog';

export interface GameFrameContext {
  readonly renderer: Renderer;
  readonly style: ClientAssetBundle['style']['style'];
  readonly clock: FixedClock;
  readonly localPlayerInputs: readonly LocalPlayerInputState[];
  readonly localPlayerIds: readonly string[];
  readonly playerHuds: readonly PlayerHud[];
  readonly touchControls: { readonly directions: readonly ({ x: number; y: number } | undefined)[] };
  readonly vehicleEntryTracer: { log(game: Gta2Game, playerId: string): void };
  readonly playerDebugOverlay: { update(game: Gta2Game, states: ReturnType<Gta2Game['snapshot']>): void };
  readonly scoreboard: HTMLElement;
  readonly weaponHint: HTMLElement;
  readonly debugCameraMode: HTMLSelectElement;
  readonly updateFpsCounter: (now: number) => void;
  readonly getGame: () => Gta2Game | undefined;
  readonly getSocket: () => WebSocket | undefined;
  readonly getId: () => string;
  readonly getServerTick: () => number;
  readonly getAuthoritative: () => ClientSnapshot | undefined;
  readonly getLocalSplitScreen: () => boolean;
  readonly getMultiplayerMode: () => boolean;
  readonly getPaused: () => boolean;
  readonly nextInputSequence: () => number;
  readonly onError: (error: unknown) => void;
}

export function createGameFrame(context: GameFrameContext) {
  return (now: number) => {
    const game = context.getGame();
    if (!game) return;
    context.updateFpsCounter(now);
    try {
      const splitScreen = context.getLocalSplitScreen(), multiplayer = context.getMultiplayerMode();
      const cameraDetached = context.debugCameraMode.value === 'detached';
      const primary = context.localPlayerInputs[0]!;
      context.renderer.setCameraInput({ north: cameraDetached && primary.keys.has('KeyW'), south: cameraDetached && primary.keys.has('KeyS'), west: cameraDetached && primary.keys.has('KeyA'), east: cameraDetached && primary.keys.has('KeyD'), zoomIn: primary.keys.has('PageUp'), zoomOut: primary.keys.has('PageDown') });
      const secondary = context.localPlayerInputs[1];
      context.renderer.setCameraInput({ north: splitScreen && secondary?.keys.has('KeyI') === true, south: splitScreen && secondary?.keys.has('KeyK') === true, west: splitScreen && secondary?.keys.has('KeyJ') === true, east: splitScreen && secondary?.keys.has('KeyL') === true, zoomIn: splitScreen && secondary?.keys.has('KeyU') === true, zoomOut: splitScreen && secondary?.keys.has('KeyO') === true }, 2);
      if (context.getPaused()) context.clock.reset();
      else context.clock.advance(now / 1000, () => stepGame(context, game, multiplayer, splitScreen));
      renderGame(context, game, splitScreen, multiplayer, now);
    } catch (error) { context.onError(error); }
  };
}

function stepGame(context: GameFrameContext, game: Gta2Game, multiplayer: boolean, splitScreen: boolean) {
  const socket = context.getSocket();
  if (context.getPaused() || (multiplayer && socket?.readyState !== WebSocket.OPEN)) return;
  const primary = context.localPlayerInputs[0]!;
  const gamepad = !multiplayer ? gamepadFor(0) : null;
  const input = buildPlayerInput(primary, { gamepadMask: !multiplayer ? gamepadMask(gamepad) : 0, gamepadActions: !multiplayer ? gamepadActions(gamepad) : 0, controlTransitions });
  const direction = context.touchControls.directions[0];
  if (direction) { input.moveX = direction.x; input.moveY = direction.y; }
  if (!multiplayer) {
    const tick = game.tick, inputs: Array<[string, Input]> = [[context.localPlayerIds[0]!, { ...input, seq: context.nextInputSequence(), clientTick: tick }]];
    if (splitScreen) {
      const second = context.localPlayerInputs[1]!, secondGamepad = gamepadFor(1);
      const secondInput = buildPlayerInput(second, { gamepadMask: gamepadMask(secondGamepad), gamepadActions: gamepadActions(secondGamepad), controlTransitions });
      const secondDirection = context.touchControls.directions[1];
      if (secondDirection) { secondInput.moveX = secondDirection.x; secondInput.moveY = secondDirection.y; }
      inputs.push([context.localPlayerIds[1]!, { ...secondInput, seq: context.nextInputSequence(), clientTick: tick }]);
    }
    game.step(new Map(inputs));
    for (const playerId of context.localPlayerIds.slice(0, splitScreen ? 2 : 1)) context.vehicleEntryTracer.log(game, playerId);
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', input: { ...input, seq: context.nextInputSequence(), clientTick: context.getServerTick() } satisfies Input }));
}

function renderGame(context: GameFrameContext, game: Gta2Game, splitScreen: boolean, multiplayer: boolean, now: number) {
  const states = game.snapshot(), localId = context.getId(), local = game.gameState.playerStates.get(localId)!;
  const world = context.getAuthoritative(), pickups = world?.pickups ?? game.gameState.pickupStates;
  context.renderer.render({ now, localId, paused: !multiplayer && context.getPaused(), ...(splitScreen ? { localIds: context.localPlayerIds } : {}), players: states, pickups, traffic: game.gameState.vehicleStates, hazards: world?.hazards ?? game.gameState.hazardStates, objects: game.gameObjects.values() });
  context.playerDebugOverlay.update(game, states);
  document.body.dataset['players'] = String(states.length);
  context.scoreboard.innerHTML = `<div class="menu-surface-header"><strong>Scoreboard</strong><button class="menu-button" type="button" data-menu-back>Back</button></div><table><tbody>${states.slice().sort((a, b) => b.score - a.score).map(state => `<tr><td>${state.name.replace(/[&<>]/g, '')}</td><td>${state.score}</td><td>${state.kills}/${state.deaths}</td></tr>`).join('')}</tbody></table>`;
  const combat = local.combat, weapon = combat.weapon >= 0 ? WEAPONS[combat.weapon] : undefined;
  const hudPlayers = splitScreen ? context.localPlayerIds.map(id => game.gameState.playerStates.get(id)) : [local];
  for (const [index, player] of hudPlayers.entries()) if (player) updatePlayerHud(player, context.playerHuds[index]!, game, context.style);
  const nearest = pickups.filter(pickup => pickup.active).sort((a, b) => Math.hypot(a.x - local.x, a.y - local.y) - Math.hypot(b.x - local.x, b.y - local.y))[0];
  if (!combat.respawn && weapon && combat.ammo[combat.weapon] === 0) { context.weaponHint.textContent = nearest ? `No ${weapon.name} ammo · ${WEAPONS[nearest.weapon]?.name ?? 'Weapon'} pickup ${Math.round(Math.hypot(nearest.x - local.x, nearest.y - local.y) / WORLD.tileSize)} blocks away` : `No ${weapon.name} ammo · find a marked pickup`; context.weaponHint.hidden = false; }
  else context.weaponHint.hidden = true;
  document.body.dataset['position'] = JSON.stringify({ x: local.x, y: local.y });
}
