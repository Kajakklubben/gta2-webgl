import { fromClientHazard, fromClientNpc, fromClientPickup, fromClientPlayer, fromClientTraffic } from '../../shared/protocol/client-dto';
import { parseServerMessage } from '../../shared/protocol/validation';
import type { ChatMessage, MatchState } from '../../shared/protocol/types';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';
import type { CarInfo } from '../../shared/engine/loader/style-parser';
import { expandClientSnapshot } from './client-snapshot';
import { createMultiplayerGame, multiplayerUrl, welcomeSnapshot } from './multiplayer-session';
import { getPlayerSessionId } from './debug-settings';

export interface MultiplayerConnectionContext {
  readonly bootstrap: Parameters<typeof createMultiplayerGame>[0];
  readonly carInfo: ReadonlyMap<number, CarInfo>;
  readonly activeMapId: string | undefined;
  readonly renderer: { setSplitScreen(split: boolean): void };
  readonly clock: { reset(): void };
  readonly playerHuds: readonly { root: HTMLElement }[];
  readonly ui: {
    nameInput: HTMLInputElement; roomInput: HTMLInputElement; teamInput: HTMLSelectElement; roomState: HTMLElement; readyButton: HTMLButtonElement;
    localReset: HTMLElement; localLeave: HTMLElement; status: HTMLElement; reconnect: HTMLElement;
  };
  readonly setGame: (game: ReturnType<typeof createMultiplayerGame> | undefined) => void;
  readonly getGame: () => ReturnType<typeof createMultiplayerGame> | undefined;
  readonly setId: (id: string) => void;
  readonly setMatch: (match: MatchState | undefined) => void;
  readonly setAuthoritative: (snapshot: ClientSnapshot | undefined) => void;
  readonly setServerTick: (tick: number) => void;
  readonly getAuthoritative: () => ClientSnapshot | undefined;
  readonly getMatch: () => MatchState | undefined;
  readonly getServerTick: () => number;
  readonly showEvents: (events: ClientSnapshot['events'] | undefined) => void;
  readonly addChat: (entry: ChatMessage) => void;
  readonly setDebugActionsEnabled: (enabled: boolean) => void;
  readonly sendPoliceAttackSetting: () => void;
  readonly setLobbyOpen: (open: boolean) => void;
  readonly setStatus: (text: string, kind?: 'loading' | 'error') => void;
  readonly onDisconnect: (reason: string) => void;
  readonly restoreSnapshot: (game: ReturnType<typeof createMultiplayerGame>, snapshot: ClientSnapshot) => void;
}

export function connectMultiplayer(context: MultiplayerConnectionContext) {
  const { ui } = context;
  const requestedName = ui.nameInput.value.trim();
  if (requestedName) localStorage.setItem('gta2-name', requestedName); else localStorage.removeItem('gta2-name');
  localStorage.setItem('gta2-room', ui.roomInput.value.trim() || 'main');
  const connection = new WebSocket(multiplayerUrl(requestedName, ui.roomInput.value.trim(), ui.teamInput.value, getPlayerSessionId(), context.activeMapId));
  connection.onmessage = event => {
    try {
      const data = parseServerMessage(JSON.parse(event.data));
      if (data.type === 'chat') { context.addChat(data.message); return; }
      if (data.type === 'welcome') {
        context.setId(data.id); context.setMatch(data.room); ui.roomState.textContent = `${data.room.room} · ${data.room.status}`; data.chat?.forEach(context.addChat);
        const game = createMultiplayerGame(context.bootstrap, data.id, context.carInfo);
        context.setGame(game); context.renderer.setSplitScreen(false); context.playerHuds[1]!.root.hidden = true;
        ui.readyButton.disabled = false; ui.localReset.hidden = true; ui.localLeave.hidden = true; ui.readyButton.textContent = data.players.find(player => player.id === data.id)?.ready ? 'Unready' : 'Ready';
        for (const state of data.players) game.addPlayer(state.id, fromClientPlayer(state));
        game.restoreWorld(data.pickups?.map(fromClientPickup), data.traffic?.map(fromClientTraffic), data.hazards?.map(fromClientHazard), data.npcs?.map(fromClientNpc));
        context.setDebugActionsEnabled(true); context.sendPoliceAttackSetting(); context.setServerTick(data.tick);
        context.setAuthoritative(welcomeSnapshot({ ...data, room: data.room }));
        ui.status.hidden = true; ui.status.dataset['state'] = 'loading'; document.body.dataset['connection'] = 'connected'; context.setLobbyOpen(false); context.clock.reset();
      } else if (data.type === 'snapshot') {
        const game = context.getGame();
        if (!game) return;
        if (data.tick <= context.getServerTick()) return;
        const current = context.getAuthoritative();
        const expanded = expandClientSnapshot(current, data);
        context.setAuthoritative(expanded); context.showEvents(expanded.events);
        const match = expanded.match ?? context.getMatch(); context.setMatch(match);
        if (match) ui.roomState.textContent = `${match.room} · ${match.status} · ${match.ready} ready`;
        expanded.chat?.forEach(entry => context.addChat(entry));
        context.restoreSnapshot(game, expanded);
        context.setDebugActionsEnabled(true); context.setServerTick(expanded.tick); document.body.dataset['tick'] = String(data.tick);
      }
    } catch (error) { console.error(error); connection.close(4002, 'Protocol error'); context.onDisconnect((error as Error).message); }
  };
  connection.onclose = () => context.onDisconnect('Disconnected. Reconnect to join the game.');
  connection.onerror = () => context.setStatus('Connection failed.', 'error');
  return connection;
}
