import { INTEREST_RADIUS } from '../shared/protocol/constants';
import { toClientHazard, toClientNpc, toClientPickup, toClientPlayer, toClientTraffic } from '../shared/protocol/client-dto';
import type { ClientNpcDto, ClientPlayerDto, ClientSnapshot } from '../shared/protocol/client-dto';
import type { MatchState } from '../shared/protocol/types';
import type { GameWorld } from '../shared/game/game-world';

export interface SnapshotPeerState {
  readonly id: string;
  readonly inputAck?: number;
  lastPlayers: Map<string, ClientPlayerDto>;
  lastNpcs: Map<number, ClientNpcDto>;
  lastFullTick: number;
}

export interface SnapshotBuildOptions {
  readonly game: GameWorld;
  readonly tick: number;
  readonly peer: SnapshotPeerState;
  readonly room: MatchState;
  /** Players still attached to this room; reconnect-grace peers stay in the
   * authoritative state but should not remain visible to active clients. */
  readonly activePlayerIds?: ReadonlySet<string>;
}

const changed = <T>(before: T | undefined, after: T) => JSON.stringify(before) !== JSON.stringify(after);

/** Builds interest-filtered deltas without exposing replication bookkeeping to Room. */
export function buildSnapshot({ game, tick, peer, room, activePlayerIds }: SnapshotBuildOptions): ClientSnapshot {
  const all = game.snapshot();
  const world = game.snapshotWorld();
  const local = all.find(player => player.id === peer.id);
  const near = (x: number, y: number) => !local || Math.hypot(x - local.x, y - local.y) <= INTEREST_RADIUS;
  const visible = all.filter(player => (activePlayerIds?.has(player.id) ?? true) && (player.id === peer.id || near(player.x, player.y)));
  const full = tick - peer.lastFullTick >= 60 || !peer.lastPlayers.size;
  const projected = visible.map(toClientPlayer);
  let players = projected;
  if (!full) players = projected.filter(player => player.id === peer.id || changed(peer.lastPlayers.get(player.id), player));
  const visibleIds = new Set(visible.map(player => player.id));
  const removedPlayers = [...peer.lastPlayers.keys()].filter(id => !visibleIds.has(id));
  peer.lastPlayers = new Map(projected.map(player => [player.id, player]));
  if (full) peer.lastFullTick = tick;
  const visibleNpcs = world.npcs.filter(item => near(item.x, item.y));
  const projectedNpcs = visibleNpcs.map(toClientNpc);
  let npcs = projectedNpcs;
  if (!full) npcs = projectedNpcs.filter(npc => changed(peer.lastNpcs.get(npc.id), npc));
  const visibleNpcIds = new Set(projectedNpcs.map(npc => npc.id));
  const removedNpcs = [...peer.lastNpcs.keys()].filter(id => !visibleNpcIds.has(id));
  peer.lastNpcs = new Map(projectedNpcs.map(npc => [npc.id, npc]));
  let outputPlayers = players;
  if (local && !players.some(player => player.id === local.id)) outputPlayers = [toClientPlayer(local), ...players];
  const result: ClientSnapshot = {
    type: 'snapshot', tick, full,
    players: outputPlayers, removedPlayers,
    pickups: world.pickups.filter(item => near(item.x, item.y)).map(toClientPickup),
    traffic: world.traffic.filter(item => near(item.x, item.y)).map(toClientTraffic),
    npcs,
    removedNpcs,
    hazards: world.hazards.filter(item => near(item.x, item.y)).map(toClientHazard),
    events: game.events.filter(event => ('actor' in event && event.actor === peer.id) || ('target' in event && event.target === peer.id) || near(event.x, event.y)),
    match: room,
  };
  if (peer.inputAck !== undefined) result.inputAck = peer.inputAck;
  if (!full) result.baseTick = tick - 1;
  return result;
}

