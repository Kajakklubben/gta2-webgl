import { Gta2Game } from '../../shared/game/gta2-game';
import type { ClientSnapshot } from '../../shared/protocol/client-dto';
import type { MatchState } from '../../shared/protocol/types';
import type { ClientBootstrap } from './client-bootstrap';
import type { CarInfo } from '../../shared/engine/loader/style-parser';

export function createMultiplayerGame(bootstrap: ClientBootstrap, id: string, carInfo: ReadonlyMap<number, CarInfo>) {
  const { assets } = bootstrap;
  return new Gta2Game(assets.map.map, id, assets.pickups.map(pickup => ({ ...pickup })), assets.cars.physics, [], assets.cars.bounds, carInfo, assets.style.style.mapObjects);
}

export function multiplayerUrl(name: string, room: string, team: string, session: string, mapId: string | undefined) {
  const params = new URLSearchParams({ room: room || 'main', team, session });
  if (mapId) params.set('mapId', mapId);
  if (name) params.set('name', name);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws?${params}`;
}

export function welcomeSnapshot(data: { tick: number; inputAck?: number | undefined; players: ClientSnapshot['players']; pickups?: ClientSnapshot['pickups'] | undefined; traffic?: ClientSnapshot['traffic'] | undefined; npcs?: ClientSnapshot['npcs'] | undefined; hazards?: ClientSnapshot['hazards'] | undefined; events?: ClientSnapshot['events'] | undefined; room: MatchState }): ClientSnapshot {
  const snapshot: ClientSnapshot = { type: 'snapshot', tick: data.tick, inputAck: data.inputAck ?? 0, full: true, players: data.players, match: data.room };
  if (data.pickups !== undefined) snapshot.pickups = data.pickups;
  if (data.traffic !== undefined) snapshot.traffic = data.traffic;
  if (data.npcs !== undefined) snapshot.npcs = data.npcs;
  if (data.hazards !== undefined) snapshot.hazards = data.hazards;
  if (data.events !== undefined) snapshot.events = data.events;
  return snapshot;
}
