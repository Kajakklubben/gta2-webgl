import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { loadLevelBundle, loadMultiplayerMapBundle, loadPickupAssetFromDisk as readWeaponPickups, loadCarPhysicsFromDisk as readCarPhysics, loadTrafficCarModelsFromDisk, loadCarBoundsFromDisk, loadCarInfoFromDisk, type AssetConfig } from './assets';
import { createHttpServer } from './http';
import { attachMultiplayer, type MultiplayerMapRuntime } from './multiplayer';
import { Gta2Game } from '../shared/game/gta2-game';
import { MULTIPLAYER_MAPS, multiplayerMapForFiles, type MultiplayerMapDefinition } from '../shared/engine/loader/multiplayer-maps';
import { createServerConfig, type ServerConfigOverrides } from './config';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { InlineConfig } from 'vite';

export interface ServerInitOptions {
  /** The checkout root used for relative assets, Vite, and the default port. */
  readonly workingDirectory?: string;
  /** Explicit port override. */
  readonly port?: number;
  readonly host?: string;
  readonly config?: ServerConfigOverrides;
}

export interface InitializedServer {
  readonly server: Server;
  readonly game: Gta2Game;
  readonly workingDirectory: string;
  readonly assetDirectory: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

async function assertPortAvailable(port: number) {
  if (port > 0) await new Promise<void>((resolve, reject) => {
    const probe = createConnection({ host: '127.0.0.1', port });
    probe.once('connect', () => { probe.destroy(); reject(Object.assign(new Error(`Port ${port} is already in use`), { code: 'EADDRINUSE' })); });
    probe.once('error', error => { probe.destroy(); if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(); else reject(error); });
  });
}

/**
 * Build the initial server state without opening a listening socket.
 *
 * Keeping asset loading, game construction, HTTP setup, and multiplayer
 * attachment here makes each worktree independently initializable and lets
 * tests or other adapters create a server before deciding when to listen.
 */
export function init(options?: ServerInitOptions): Promise<InitializedServer>;
export function init(development: boolean, options?: ServerInitOptions): Promise<InitializedServer>;
export async function init(developmentOrOptions: boolean | ServerInitOptions = false, suppliedOptions: ServerInitOptions = {}): Promise<InitializedServer> {
  let development = false;
  let options = suppliedOptions;
  if (typeof developmentOrOptions === 'boolean') development = developmentOrOptions;
  else options = developmentOrOptions;
  const config = createServerConfig({ ...options.config, workingDirectory: options.workingDirectory ?? options.config?.workingDirectory ?? process.cwd(), ...(options.port === undefined ? {} : { port: options.port }), ...(options.host === undefined ? {} : { host: options.host }) });
  const workingDirectory = config.workingDirectory;
  const port = config.port;
  const host = config.host;
  // A wildcard listener can coexist with a loopback listener on some hosts.
  // Check the loopback endpoint first so a configured port is never silently
  // split between two HTTP/WebSocket servers.
  await assertPortAvailable(port);
  const assets = config.assetDirectory;
  const assetOptions: AssetConfig = config.pickupScript === undefined
    ? { mapFile: config.mapFile, styleFile: config.styleFile }
    : { mapFile: config.mapFile, styleFile: config.styleFile, pickupScript: config.pickupScript };
  const defaultBundle = await loadLevelBundle(assets, assetOptions);
  const level = defaultBundle.map;
  const [pickups, carPhysics, trafficModels, carBounds, carInfo] = await Promise.all([
    readWeaponPickups(assets, assetOptions),
    readCarPhysics(assets, assetOptions),
    loadTrafficCarModelsFromDisk(assets, assetOptions),
    loadCarBoundsFromDisk(assets, assetOptions),
    loadCarInfoFromDisk(assets, assetOptions),
  ]);
  const configuredMap = config.mapFile;
  const configuredStyle = config.styleFile;
  const defaultMapDefinition = multiplayerMapForFiles(configuredMap, configuredStyle);
  const defaultMapId = defaultMapDefinition?.id ?? 'default';
  const mapRuntimes: MultiplayerMapRuntime[] = [];
  const availableMaps: MultiplayerMapDefinition[] = [];
  if (defaultMapDefinition) availableMaps.push(defaultMapDefinition);
  const optionalMaps = await Promise.all(MULTIPLAYER_MAPS.filter(definition => definition.id !== defaultMapId).map(async definition => {
    try {
      const bundle = await loadMultiplayerMapBundle(definition, assets);
      const initialPickups = bundle.pickups.map(pickup => ({ ...pickup }));
      return {
        definition,
        runtime: {
          id: definition.id,
          createGame: () => new Gta2Game(bundle.map, undefined, initialPickups.map(pickup => ({ ...pickup })), carPhysics, bundle.trafficModels, bundle.carBounds, bundle.carInfo, bundle.mapObjectDefinitions),
        } satisfies MultiplayerMapRuntime,
      };
    } catch (error) {
      console.warn(`Skipping multiplayer map ${definition.label}: ${(error as Error).message}`);
      return undefined;
    }
  }));
  for (const loaded of optionalMaps) {
    if (!loaded) continue;
    mapRuntimes.push(loaded.runtime);
    availableMaps.push(loaded.definition);
  }
  const disableHmr = config.disableHmr;
  let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
  try {
    const viteConfig: InlineConfig = {
      root: workingDirectory,
      server: { middlewareMode: true },
      appType: 'spa',
    };
    if (disableHmr) {
      viteConfig.server = { middlewareMode: true, hmr: false, ws: false };
      viteConfig.plugins = [{
        name: 'fixture-disable-vite-client',
        transformIndexHtml: {
          order: 'post',
          handler(html: string) {
            return html.replace(/\s*<script type="module" src="\/@vite\/client"><\/script>\s*/g, '\n');
          },
        },
      }];
    }
    if (development) vite = await (await import('vite')).createServer(viteConfig);
    const game = new Gta2Game(level, undefined, pickups, carPhysics, trafficModels, carBounds, carInfo, defaultBundle.mapObjectDefinitions);
    let multiplayer: ReturnType<typeof attachMultiplayer> | undefined;
    let developmentMiddleware: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;
    if (vite) {
      const currentVite = vite;
      developmentMiddleware = (req, res) => currentVite.middlewares(req, res);
    }
    const server = createHttpServer({
      assets,
      clientDirectory: resolve(workingDirectory, 'dist/client'),
      development: developmentMiddleware,
      maps: availableMaps,
    });
    multiplayer = attachMultiplayer(server, game, { maps: mapRuntimes, defaultMapId });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      multiplayer?.();
      await vite?.close();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    };
    return { server, game, workingDirectory, assetDirectory: assets, host, port, close };
  } catch (error) {
    await vite?.close();
    throw error;
  }
}

export function startServer(options?: ServerInitOptions): Promise<InitializedServer>;
export function startServer(development: boolean, options?: ServerInitOptions): Promise<InitializedServer>;
export async function startServer(developmentOrOptions: boolean | ServerInitOptions = false, suppliedOptions: ServerInitOptions = {}) {
  let development = false;
  let options = suppliedOptions;
  if (typeof developmentOrOptions === 'boolean') development = developmentOrOptions;
  else options = developmentOrOptions;
  const initialized = await init(development, options);
  const { server, close, host, port } = initialized;
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  } catch (error) { await close(); throw error; }
  console.log(`GTA2 WebGL: http://${host}:${(server.address() as { port: number }).port}`);
  process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
  return initialized;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}
