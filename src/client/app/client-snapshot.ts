import type { Gta2Game } from '../../shared/game/gta2-game';
import { fromClientHazard, fromClientNpc, fromClientPickup, fromClientPlayer, fromClientTraffic } from '../../shared/protocol/client-dto';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';

export function expandClientSnapshot(current: ClientSnapshot | undefined, snapshot: ClientSnapshot): ClientSnapshot {
  if (snapshot.full || !current) {
    return {
      ...snapshot,
      npcs: snapshot.npcs?.map(npc => ({ ...npc })) ?? [],
      players: snapshot.players.map(player => ({ ...player, combat: { ...player.combat, ammo: [...player.combat.ammo], shots: player.combat.shots.map(shot => ({ ...shot })) } })),
    };
  }
  const players = new Map(current.players.map(player => [player.id, player]));
  const npcs = new Map((current.npcs ?? []).map(npc => [npc.id, npc]));
  for (const removed of snapshot.removedPlayers ?? []) players.delete(removed);
  for (const removed of snapshot.removedNpcs ?? []) npcs.delete(removed);
  for (const player of snapshot.players) players.set(player.id, player);
  for (const npc of snapshot.npcs ?? []) npcs.set(npc.id, npc);
  return { ...current, ...snapshot, npcs: [...npcs.values()], players: [...players.values()] };
}

export function restoreClientSnapshot(game: Gta2Game, snapshot: ClientSnapshot): void {
  const playerIds = new Set(snapshot.players.map(player => player.id));
  for (const playerId of game.gameState.playerStates.keys()) if (!playerIds.has(playerId)) game.removePlayer(playerId);
  game.restoreWorld(snapshot.pickups?.map(fromClientPickup), snapshot.traffic?.map(fromClientTraffic), snapshot.hazards?.map(fromClientHazard), snapshot.npcs?.map(fromClientNpc));
  for (const player of snapshot.players) game.restore(fromClientPlayer(player));
}
