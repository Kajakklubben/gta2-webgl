import { afterEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createHttpServer } from '../../server/http';
import { checkAssets } from '../../server/assets';
import { attachMultiplayer } from '../../server/multiplayer';
import { GameWorld } from '../../shared/game/game-world';
import { startServer } from '../../server/main';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { ServerMessage, Snapshot } from '../../shared/protocol/types';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import { mapFixture, styleFixture } from '../unit/fixtures';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function start() {
  const directory = await mkdtemp(join(tmpdir(), 'gta2-tests-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  await Promise.all([writeFile(join(directory, 'index.html'), '<title>fixture</title>'),
    writeFile(join(directory, 'MP1-comp.gmp'), mapFixture()), writeFile(join(directory, 'bil.sty'), styleFixture())]);
  const server = createHttpServer({ assets: directory, clientDirectory: directory });
  const stop = attachMultiplayer(server, new GameWorld(parseMap(mapFixture())));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  cleanup.push(async () => { stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const port = (server.address() as AddressInfo).port;
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws`, directory };
}
function peer(url: string) {
  const socket = new WebSocket(url), messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  socket.on('message', bytes => { messages.push(JSON.parse(bytes.toString())); for (const fn of waiters) fn(); });
  socket.on('error', () => {});
  cleanup.push(async () => { if (socket.readyState !== WebSocket.CLOSED) { socket.terminate(); await once(socket, 'close'); } });
  const wait = (predicate: (message: ServerMessage) => boolean) => new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error('Timed out waiting for server message')); }, 4000);
    const check = () => {
      const message = messages.find(predicate);
      if (message) { clearTimeout(timer); waiters.delete(check); resolve(message); }
    };
    waiters.add(check); check();
  });
  return { socket, wait };
}
it('serves assets, returns meaningful errors, and blocks traversal and symlink escapes', async () => {
  const server = await start();
  expect((await fetch(server.http + '/health')).status).toBe(200);
  expect((await fetch(server.http + '/')).status).toBe(200);
  expect((await fetch(server.http + '/assets/bil.sty')).headers.get('content-type')).toBe('application/octet-stream');
  expect(await (await fetch(server.http + '/assets/index.json')).json()).toContain('bil.sty');
  expect((await fetch(server.http + '/missing.js')).status).toBe(404);
  expect((await fetch(server.http + '/assets/secret')).status).toBe(404);
  expect((await fetch(server.http + '/%2e%2e%2fsecret')).status).toBe(403);
  expect((await fetch(server.http + '/%E0%A4%A')).status).toBe(400);
  expect((await fetch(server.http + '/', { method: 'POST' })).status).toBe(405);
  await symlink(join(server.directory, '..'), join(server.directory, 'escape'));
  expect((await fetch(server.http + '/escape/anything')).status).toBe(404);
  const outside = await mkdtemp(join(tmpdir(), 'gta2-secret-'));
  cleanup.push(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'secret.txt'), 'secret'); await symlink(join(outside, 'secret.txt'), join(server.directory, 'secret.txt'));
  expect((await fetch(server.http + '/secret.txt')).status).toBe(403);
});
it('validates assets before startup with actionable missing-file errors', async () => {
  const server = await start(); await expect(checkAssets(server.directory)).resolves.toBeDefined();
  await rm(join(server.directory, 'bil.sty'));
  await expect(checkAssets(server.directory)).rejects.toThrow('Copy your GTA2');
});
it('processes sequenced input, synchronizes join/leave, and reconnects with a new identity', async () => {
  const server = await start(), first = peer(server.ws);
  const welcome = await first.wait(message => message.type === 'welcome');
  if (welcome.type !== 'welcome') throw new Error();
  const second = peer(server.ws), other = await second.wait(message => message.type === 'welcome');
  if (other.type !== 'welcome') throw new Error();
  await first.wait(message => message.type === 'snapshot' && message.players.length === 2);
  for (let seq = 1; seq <= 6; seq++) first.socket.send(JSON.stringify({ type: 'input', input: { seq, keys: 1 } }));
  const expectedY = -190 * 64 + 6 * 4;
  const snapshot = await first.wait(message => message.type === 'snapshot' && message.players.some(player => player.id === welcome.id && player.y >= expectedY - 1e-6)) as Snapshot;
  expect(snapshot.players.find(player => player.id === welcome.id)!.y).toBeCloseTo(expectedY, 3);
  second.socket.close(); await once(second.socket, 'close');
  await first.wait(message => message.type === 'snapshot' && message.tick > snapshot.tick && message.players.length === 1);
  const reconnected = peer(server.ws), newWelcome = await reconnected.wait(message => message.type === 'welcome');
  if (newWelcome.type !== 'welcome') throw new Error();
  expect(newWelcome.id).not.toBe(other.id);
});
it('reclaims a browser session after a refresh and preserves its player state', async () => {
  const server = await start(), session = '123e4567-e89b-12d3-a456-426614174000';
  const first = peer(`${server.ws}?session=${session}`), welcome = await first.wait(message => message.type === 'welcome');
  if (welcome.type !== 'welcome') throw new Error();
  for (let seq = 1; seq <= 6; seq++) first.socket.send(JSON.stringify({ type: 'input', input: { seq, keys: 1 } }));
  const moved = await first.wait(message => message.type === 'snapshot' && message.players.some(player => player.id === welcome.id && player.y > -190 * 64));
  if (moved.type !== 'snapshot') throw new Error();
  first.socket.close(); await once(first.socket, 'close');
  const refreshed = peer(`${server.ws}?session=${session}`), refreshedWelcome = await refreshed.wait(message => message.type === 'welcome');
  if (refreshedWelcome.type !== 'welcome') throw new Error();
  expect(refreshedWelcome.id).toBe(welcome.id);
  expect(refreshedWelcome.players.find(player => player.id === welcome.id)!.y).toBeGreaterThan(-190 * 64);
});
it('resets the room world and sends a fresh full snapshot', async () => {
  const server = await start(), client = peer(server.ws);
  const welcome = await client.wait(message => message.type === 'welcome');
  if (welcome.type !== 'welcome') throw new Error();
  const origin = welcome.players.find(player => player.id === welcome.id)!;
  for (let seq = 1; seq <= 6; seq++) client.socket.send(JSON.stringify({ type: 'input', input: { seq, keys: 1 } }));
  const moved = await client.wait(message => message.type === 'snapshot' && message.tick > welcome.tick && message.players.some(player => player.id === welcome.id && player.y > origin.y + 1));
  if (moved.type !== 'snapshot') throw new Error();
  client.socket.send(JSON.stringify({ type: 'reset-world' }));
  const reset = await client.wait(message => message.type === 'snapshot' && message.tick > moved.tick && message.full === true && message.players.some(player => player.id === welcome.id && Math.abs(player.x - origin.x) < 1e-6 && Math.abs(player.y - origin.y) < 1e-6));
  expect(reset.type).toBe('snapshot');
});
it('gives the requesting player all debug weapons', async () => {
  const server = await start(), client = peer(server.ws);
  const welcome = await client.wait(message => message.type === 'welcome');
  if (welcome.type !== 'welcome') throw new Error();
  client.socket.send(JSON.stringify({ type: 'give-all-weapons' }));
  const snapshot = await client.wait(message => message.type === 'snapshot' && message.players.some(player => player.id === welcome.id && player.combat.ammo.every((ammo, index) => ammo === WEAPONS[index]?.ammo)));
  if (snapshot.type !== 'snapshot') throw new Error();
  expect(snapshot.players.find(player => player.id === welcome.id)!.combat!.ammo).toEqual(WEAPONS.map(weapon => weapon.ammo));
});
it('rejects malformed and out-of-order inputs without killing the server', async () => {
  const server = await start();
  for (const payload of ['not json', JSON.stringify({ type: 'input', input: { seq: 2, keys: 1 } }), JSON.stringify({ type: 'input', input: { seq: 1, keys: 999 } })]) {
    const client = peer(server.ws); await client.wait(message => message.type === 'welcome');
    client.socket.send(payload); const [code] = await once(client.socket, 'close'); expect(code).toBe(1008);
  }
  expect((await fetch(server.http + '/health')).status).toBe(200);
});
it('rejects invalid origins and releases resources when the port is occupied', async () => {
  const server = await start();
  const forbidden = new WebSocket(server.ws, { origin: 'not a valid URL' });
  forbidden.on('error', () => {});
  const response = await new Promise<number>(resolve => forbidden.on('unexpected-response', (_request, response) => {
    resolve(response.statusCode!); response.resume(); forbidden.terminate();
  }));
  expect(response).toBe(403);
  await expect(startServer({ config: { assetDirectory: server.directory, port: Number(new URL(server.http).port) } })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  await expect(startServer({ config: { assetDirectory: server.directory, port: -1 } })).rejects.toThrow('port must be');
});
