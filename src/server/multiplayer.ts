import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Gta2Game } from '../shared/game/gta2-game';
import { GameEngine } from '../shared/engine/game-engine';
import { DEFAULT_STEP_SECONDS, MAX_INPUTS_PER_SECOND, MAX_PENDING_INPUTS, PROTOCOL_VERSION } from '../shared/protocol/constants';
import { parseClientMessage } from '../shared/protocol/validation';
import type { ChatMessage, Input, MatchState, ServerMessage } from '../shared/protocol/types';
import type { ClientNpcDto, ClientPlayerDto, ClientSnapshot } from '../shared/protocol/client-dto';
import { buildSnapshot } from './snapshot-builder';
import { randomPlayerName } from './player-names';

const MAX_PLAYERS = 16;
const RECONNECT_GRACE_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface Room { key: string; id: string; mapId: string; game: Gta2Game; createGame: () => Gta2Game; engine: GameEngine<Map<string, Input>>; peers: Set<Peer>; tick: number; chats: ChatMessage[]; nextChat: number; }
interface Peer {
  id: string; name: string; socket: WebSocket; room: Room; queue: Input[]; received: number; inputAck: number; alive: boolean; connected: boolean; inputTimes: number[]; disconnectTimer?: ReturnType<typeof setTimeout>;
  lastMovement?: Input;
  lastPlayers: Map<string, ClientPlayerDto>; lastNpcs: Map<number, ClientNpcDto>; lastFullTick: number;
}

export interface MultiplayerMapRuntime {
  readonly id: string;
  readonly createGame: () => Gta2Game;
}

export interface MultiplayerOptions {
  readonly maps?: readonly MultiplayerMapRuntime[];
  readonly defaultMapId?: string;
}

export type MultiplayerController = () => void;

export function attachMultiplayer(server: Server, baseGame: Gta2Game, options: MultiplayerOptions = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const initialPickups = baseGame.gameState.pickupStates.map(pickup => ({ ...pickup }));
  const defaultMapId = options.defaultMapId ?? 'default';
  const defaultRuntime: MultiplayerMapRuntime = {
    id: defaultMapId,
    createGame: () => new Gta2Game(baseGame.level, undefined, initialPickups.map(pickup => ({ ...pickup })), baseGame.carPhysics, baseGame.trafficModels, baseGame.carBounds, baseGame.carInfo, baseGame.mapObjectDefinitions),
  };
  const runtimes = new Map<string, MultiplayerMapRuntime>(options.maps?.map(runtime => [runtime.id, runtime]) ?? []);
  // The already-created startup game is authoritative for the default room.
  // Its factory is used for additional rooms and resets of that map.
  runtimes.set(defaultMapId, defaultRuntime);
  const roomKey = (id: string, mapId: string) => `${mapId}\u0000${id}`;
  const makeRoom = (id: string, mapId: string, game: Gta2Game, runtime: MultiplayerMapRuntime): Room => {
    const room: Room = {
      key: roomKey(id, mapId),
      id,
      mapId,
      game,
      createGame: runtime.createGame,
      engine: new GameEngine(inputs => room.game.step(inputs), DEFAULT_STEP_SECONDS),
      peers: new Set<Peer>(),
      tick: 0,
      chats: [],
      nextChat: 0,
    };
    return room;
  };
  const defaultRoom = makeRoom('main', defaultMapId, baseGame, defaultRuntime);
  const rooms = new Map<string, Room>([[defaultRoom.key, defaultRoom]]);
  const peers = new Set<Peer>();
  const activePeers = (room: Room) => [...room.peers].filter(peer => peer.connected);
  const colorFor = (id: string) => Number.parseInt(id.slice(0, 6), 16) | 0x404040;
  const roomState = (room: Room): MatchState => {
    const connected = activePeers(room);
    const ready = connected.filter(peer => room.game.gameState.playerStates.get(peer.id)?.ready === true).length;
    let status: MatchState['status'] = 'lobby';
    if (ready === connected.length && connected.length > 0) status = 'playing';
    return { room: room.id, status, maxPlayers: MAX_PLAYERS, elapsed: Math.floor(room.tick * DEFAULT_STEP_SECONDS), ready };
  };
  const snapshotFor = (peer: Peer): ClientSnapshot => {
    return buildSnapshot({ game: peer.room.game, tick: peer.room.tick, peer, room: roomState(peer.room), activePlayerIds: new Set(activePeers(peer.room).map(activePeer => activePeer.id)) });
  };
  const send = (peer: Peer, message: ServerMessage) => {
    if (peer.socket.readyState !== WebSocket.OPEN) return;
    if (peer.socket.bufferedAmount > 256 * 1024) { peer.socket.close(1013, 'Client too slow'); return; }
    peer.socket.send(JSON.stringify(message));
  };
  const broadcast = (room: Room, message: ServerMessage) => { for (const peer of room.peers) send(peer, message); };
  const getRoom = (id: string, mapId: string) => {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'main';
    const runtime = runtimes.get(mapId);
    if (!runtime) return undefined;
    const key = roomKey(safe, mapId);
    const existing = rooms.get(key); if (existing) return existing;
    const room = makeRoom(safe, mapId, runtime.createGame(), runtime);
    rooms.set(key, room); return room;
  };
  const resetRoom = (room: Room) => {
    const policeAttackPlayer = room.game.policeAttackPlayer;
    const previousPlayers = new Map([...room.peers].map(peer => [peer.id, room.game.gameState.playerStates.get(peer.id)]));
    const game = room.createGame();
    game.setPoliceAttackPlayer(policeAttackPlayer);
    game.tick = room.tick;
    room.game = game;
    room.engine = new GameEngine(inputs => room.game.step(inputs), DEFAULT_STEP_SECONDS);
    for (const peer of room.peers) {
      const previous = previousPlayers.get(peer.id);
      const player = room.game.addPlayer(peer.id);
      player.name = peer.name;
      player.color = colorFor(peer.id);
      player.ready = previous?.ready ?? false;
      player.team = previous?.team ?? 0;
      peer.queue.length = 0;
      delete peer.lastMovement;
      peer.inputTimes.length = 0;
      peer.lastPlayers.clear(); peer.lastNpcs.clear();
      peer.lastFullTick = room.tick - 60;
    }
  };
  server.on('upgrade', (request, socket, head) => {
    let allowedOrigin = true;
    try { allowedOrigin = !request.headers.origin || new URL(request.headers.origin).host === request.headers.host; } catch { allowedOrigin = false; }
    let pathname = ''; try { pathname = new URL(request.url ?? '/', 'http://localhost').pathname; } catch { /* handled below */ }
    if (pathname !== '/ws' || !allowedOrigin) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, connection => sockets.emit('connection', connection, request));
  });
  sockets.on('connection', (socket, request) => {
    const query = new URL(request.url ?? '/ws', 'http://localhost').searchParams;
    const room = getRoom(query.get('room') ?? 'main', query.get('mapId') ?? defaultMapId);
    if (!room) { socket.close(1008, 'Map unavailable'); return; }
    const session = query.get('session') ?? '';
    let id: string = randomUUID();
    if (SESSION_ID_PATTERN.test(session)) id = session.toLowerCase();
    const existingPeer = [...room.peers].find(peer => peer.id === id);
    if (!existingPeer && activePeers(room).length >= MAX_PLAYERS) { socket.close(1013, 'Room full'); return; }
    const requestedName = (query.get('name') ?? '').trim().slice(0, 32);
    const currentPlayer = room.game.gameState.playerStates.get(id);
    let name: string;
    if (requestedName && requestedName.toLocaleLowerCase() !== 'player') name = requestedName;
    else if (currentPlayer?.name && currentPlayer.name.toLocaleLowerCase() !== 'player') name = currentPlayer.name;
    else name = randomPlayerName(activePeers(room).map(peer => peer.name));
    const team = Math.max(0, Math.min(3, Number.parseInt(query.get('team') ?? '0', 10) || 0));
    const player = currentPlayer ?? room.game.addPlayer(id);
    player.name = name; player.color = colorFor(id); player.ready = currentPlayer?.ready ?? false;
    player.team = team;
    let peer: Peer;
    if (existingPeer) peer = existingPeer;
    else {
      peer = {
        id, name, socket, room, queue: [] as Input[], received: 0, inputAck: 0, alive: true, connected: true,
        inputTimes: [] as number[], lastPlayers: new Map<string, ClientPlayerDto>(), lastNpcs: new Map<number, ClientNpcDto>(), lastFullTick: -60,
      };
    }
    if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); delete peer.disconnectTimer; }
    if (existingPeer && existingPeer.socket !== socket) existingPeer.socket.close(4000, 'Reconnected');
    peer.name = name; peer.socket = socket; peer.connected = true; peer.alive = true; peer.queue.length = 0; peer.received = 0; peer.inputAck = 0; peer.inputTimes.length = 0;
    delete peer.lastMovement;
    peer.lastPlayers.clear(); peer.lastNpcs.clear(); peer.lastFullTick = room.tick - 60;
    if (!existingPeer) { peers.add(peer); room.peers.add(peer); }
    const initial = snapshotFor(peer);
    send(peer, { type: 'welcome', version: PROTOCOL_VERSION, id, tick: room.tick, inputAck: peer.inputAck, players: initial.players, room: roomState(room), pickups: initial.pickups, traffic: initial.traffic, npcs: initial.npcs, hazards: initial.hazards, events: initial.events, chat: room.chats });
    socket.on('pong', () => { peer.alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      // A refresh can open the replacement socket before the old close event
      // arrives. Only the currently attached socket may disconnect this peer.
      if (peer.socket !== socket) return;
      peer.connected = false; peer.queue.length = 0; delete peer.lastMovement;
      peer.disconnectTimer = setTimeout(() => {
        if (peer.connected || peer.socket !== socket) return;
        peers.delete(peer); room.peers.delete(peer); room.game.convertDisconnectedPlayerToDummy(id);
        if (!activePeers(room).length && room.key !== defaultRoom.key) rooms.delete(room.key);
      }, RECONNECT_GRACE_MS);
      peer.disconnectTimer.unref?.();
    });
    socket.on('message', (bytes, binary) => {
      if (peer.socket !== socket || !peer.connected) return;
      let value: unknown; try { if (binary) throw new Error(); value = JSON.parse(bytes.toString()); } catch { socket.close(1008, 'Invalid message'); return; }
      let message: ReturnType<typeof parseClientMessage>;
      try { message = parseClientMessage(value); }
      catch { socket.close(1008, 'Invalid message'); return; }
      if (message.type === 'chat') {
        const chat: ChatMessage = { id: room.nextChat++, sender: id, name: peer.name, text: message.text, tick: room.tick };
        room.chats.push(chat); if (room.chats.length > 40) room.chats.shift(); broadcast(room, { type: 'chat', message: chat }); return;
      }
      if (message.type === 'ready') { const current = room.game.gameState.playerStates.get(id); if (current) current.ready = message.ready; return; }
      if (message.type === 'reset-world') { resetRoom(room); return; }
      if (message.type === 'give-all-weapons') {
        room.game.playerSystem.loadout.giveAllWeapons(room.game.gameState.playerStates.get(id));
        return;
      }
      if (message.type === 'set-police-attack') { room.game.setPoliceAttackPlayer(message.enabled); return; }
      const input = message.input, now = Date.now(); peer.inputTimes = peer.inputTimes.filter(time => now - time < 1000);
      if (input.seq !== peer.received + 1 || peer.queue.length >= MAX_PENDING_INPUTS || peer.inputTimes.length >= MAX_INPUTS_PER_SECOND || (input.clientTick !== undefined && (input.clientTick > room.tick + 2 || input.clientTick < room.tick - 90))) { socket.close(1008, 'Invalid input sequence or queue limit'); return; }
      peer.inputTimes.push(now); peer.received = input.seq; peer.queue.push(input);
    });
  });
  const timer = setInterval(() => {
    const now = performance.now() / 1000;
    for (const room of rooms.values()) {
      // A disconnected room remains around briefly for session reconnects,
      // but it does not need to simulate an unseen world. This matters when a
      // player changes maps repeatedly: each old district can otherwise keep
      // an expensive collision world ticking during the grace period.
      if (!activePeers(room).length) continue;
      const result = room.engine.advance(now, () => {
        const inputs = new Map<string, Input>();
        for (const peer of room.peers) {
          if (!peer.connected) continue;
          const input = peer.queue.shift();
          if (input) {
            peer.inputAck = input.seq;
            // Actions are edge-triggered. Keep only the movement portion for
            // a late packet fallback so enter/fire/jump cannot repeat.
            const movement: Input = { seq: input.seq, keys: input.keys };
            if (input.moveX !== undefined) movement.moveX = input.moveX;
            if (input.moveY !== undefined) movement.moveY = input.moveY;
            peer.lastMovement = movement;
            inputs.set(peer.id, input);
          } else if (peer.lastMovement) {
            inputs.set(peer.id, peer.lastMovement);
          }
        }
        return inputs;
      });
      room.tick += result.steps;
      if (result.steps) for (const peer of room.peers) send(peer, snapshotFor(peer));
    }
  }, 8);
  const heartbeat = setInterval(() => { for (const peer of peers) { if (!peer.alive) peer.socket.terminate(); else { peer.alive = false; peer.socket.ping(); } } }, HEARTBEAT_INTERVAL_MS);
  const stop = (() => { clearInterval(timer); clearInterval(heartbeat); for (const peer of peers) peer.socket.terminate(); sockets.close(); }) as MultiplayerController;
  return stop;
}
