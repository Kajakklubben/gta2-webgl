import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assetDirectory } from './assets';

/** The first port used by a checkout when PORT is not explicitly configured. */
export const WORKTREE_PORT_BASE = 8000;
/** Keep development ports together while leaving room for many checkouts. */
export const WORKTREE_PORT_RANGE = 1000;

/**
 * Return a stable development port for a working directory.
 *
 * Git worktrees normally have different absolute paths. Hashing that path
 * gives each checkout its own repeatable port, so starting two worktrees does
 * not make one server steal the other's port. PORT remains an explicit escape
 * hatch for CI, production, and callers that need a particular port.
 */
export function portForWorkingDirectory(
  directory = process.cwd(),
  basePort = WORKTREE_PORT_BASE,
  range = WORKTREE_PORT_RANGE,
) {
  if (!Number.isInteger(basePort) || basePort < 0 || basePort > 65535) throw new Error('basePort must be a valid port number');
  if (!Number.isInteger(range) || range < 1 || basePort + range - 1 > 65535) throw new Error('range must describe valid ports');
  const normalized = resolve(directory);
  // FNV-1a is small, deterministic, and does not require a crypto dependency.
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return basePort + (hash >>> 0) % range;
}

/** Resolve PORT while retaining the per-working-tree default. */
export function resolveServerPort(directory = process.cwd(), configured = process.env['PORT']) {
  if (configured !== undefined && configured.trim() !== '') return Number(configured);
  return portForWorkingDirectory(directory);
}

export interface ServerRuntimeConfig {
  readonly workingDirectory: string;
  readonly assetDirectory: string;
  readonly port: number;
}

export function serverRuntimeConfig(directory = process.cwd()): ServerRuntimeConfig {
  const workingDirectory = resolve(directory);
  return {
    workingDirectory,
    assetDirectory: assetDirectory(workingDirectory),
    port: resolveServerPort(workingDirectory),
  };
}

/** Create the checkout-local directories needed before the first server run. */
export async function initializeServerRuntime(workingDirectory = process.cwd()): Promise<ServerRuntimeConfig> {
  const config = serverRuntimeConfig(workingDirectory);
  await mkdir(config.assetDirectory, { recursive: true });
  return config;
}
