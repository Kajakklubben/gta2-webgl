import { mkdir } from 'node:fs/promises';
import { createServerConfig, type ServerConfig, type ServerConfigOverrides } from './config';
export { portForWorkingDirectory, WORKTREE_PORT_BASE, WORKTREE_PORT_RANGE } from './config';
import { portForWorkingDirectory } from './config';

export function serverRuntimeConfig(directory = process.cwd(), overrides: ServerConfigOverrides = {}): ServerConfig {
  return createServerConfig({ ...overrides, workingDirectory: overrides.workingDirectory ?? directory });
}

/** Backward-compatible explicit-port helper; configuration is no longer read from the process environment. */
export function resolveServerPort(directory = process.cwd(), configured?: string) {
  if (configured !== undefined && configured.trim() !== '') return Number(configured);
  return portForWorkingDirectory(directory);
}

/** Create the checkout-local directories needed before the first server run. */
export async function initializeServerRuntime(workingDirectory = process.cwd(), overrides: ServerConfigOverrides = {}) {
  const config = serverRuntimeConfig(workingDirectory, overrides);
  await mkdir(config.assetDirectory, { recursive: true });
  return config;
}
