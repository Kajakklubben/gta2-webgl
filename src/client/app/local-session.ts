import { Gta2Game } from '../../shared/game/gta2-game';
import type { MatchState } from '../../shared/protocol/types';
import type { ClientBootstrap } from './client-bootstrap';
import type { CarInfo } from '../../shared/engine/loader/style-parser';

export function createLocalSession(bootstrap: ClientBootstrap, carInfo: ReadonlyMap<number, CarInfo>, splitScreen: boolean) {
  const { assets } = bootstrap;
  const game = new Gta2Game(assets.map.map, undefined, assets.pickups.map(pickup => ({ ...pickup })), assets.cars.physics, assets.cars.recyclingModels, assets.cars.bounds, carInfo, assets.style.style.mapObjects);
  const players = ['local-player-1', ...(splitScreen ? ['local-player-2'] : [])].map((id, index) => {
    const player = game.addPlayer(id);
    player.name = `Player ${index + 1}`;
    player.color = [0x65a9e8, 0xf0a35b][index]!;
    return player;
  });
  if (splitScreen) {
    const secondary = players[1]!;
    secondary.x += 48; secondary.y += 48;
    game.restore(secondary);
  }
  const match: MatchState = { room: 'LOCAL', status: 'playing', maxPlayers: splitScreen ? 2 : 1, elapsed: 0, ready: splitScreen ? 2 : 1 };
  return { game, players, match };
}
