import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSET_NAMES } from '../shared/engine/loader/asset-loaders';

export interface ServerConfig {
  readonly workingDirectory: string;
  readonly assetDirectory: string;
  readonly port: number;
  readonly host: string;
  readonly mapFile: string;
  readonly styleFile: string;
  readonly pickupScript?: string;
  readonly disableHmr: boolean;
}

export type ServerConfigOverrides = Partial<Omit<ServerConfig, 'workingDirectory'>> & { workingDirectory?: string };
export const WORKTREE_PORT_BASE = 8000;
export const WORKTREE_PORT_RANGE = 1000;

export function portForWorkingDirectory(directory = process.cwd(), basePort = WORKTREE_PORT_BASE, range = WORKTREE_PORT_RANGE) {
  if (!Number.isInteger(basePort) || basePort < 0 || basePort > 65535) throw new Error('basePort must be a valid port number');
  if (!Number.isInteger(range) || range < 1 || basePort + range - 1 > 65535) throw new Error('range must describe valid ports');
  const normalized = resolve(directory);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return basePort + (hash >>> 0) % range;
}

function defaultAssetDirectory(workingDirectory: string, mapFile: string, styleFile: string) {
  const root = resolve(workingDirectory, 'assets');
  const nested = resolve(root, 'App_Executables', 'data');
  if (existsSync(resolve(root, mapFile)) && existsSync(resolve(root, styleFile))) return root;
  if (existsSync(resolve(nested, mapFile)) && existsSync(resolve(nested, styleFile))) return nested;
  return root;
}

export function createServerConfig(overrides: ServerConfigOverrides = {}, directory = process.cwd()): ServerConfig {
  const workingDirectory = resolve(overrides.workingDirectory ?? directory);
  const mapFile = overrides.mapFile ?? ASSET_NAMES[0];
  const styleFile = overrides.styleFile ?? ASSET_NAMES[1];
  const port = overrides.port ?? portForWorkingDirectory(workingDirectory);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be a valid port number');
  const config: ServerConfig = {
    workingDirectory,
    assetDirectory: resolve(overrides.assetDirectory ?? defaultAssetDirectory(workingDirectory, mapFile, styleFile)),
    port,
    host: overrides.host ?? '0.0.0.0',
    mapFile,
    styleFile,
    disableHmr: overrides.disableHmr ?? false,
  };
  if (overrides.pickupScript !== undefined) return { ...config, pickupScript: overrides.pickupScript };
  return config;
}
