import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeServerRuntime, portForWorkingDirectory, resolveServerPort, serverRuntimeConfig } from '../../server/runtime-config';

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

it('assigns a stable, separate development port to each working directory', () => {
  const first = portForWorkingDirectory('/tmp/gta2-worktree-one');
  const second = portForWorkingDirectory('/tmp/gta2-worktree-two');
  expect(first).toBe(portForWorkingDirectory('/tmp/gta2-worktree-one'));
  expect(second).toBe(portForWorkingDirectory('/tmp/gta2-worktree-two'));
  expect(first).not.toBe(second);
  expect(first).toBeGreaterThanOrEqual(8000);
  expect(first).toBeLessThan(9000);
});

it('keeps explicit ports as an override', () => {
  expect(resolveServerPort('/tmp/gta2-worktree', '9123')).toBe(9123);
  expect(resolveServerPort('/tmp/gta2-worktree', '0')).toBe(0);
});

it('describes the checkout-local initial runtime directories', () => {
  expect(serverRuntimeConfig('/tmp/gta2-worktree')).toMatchObject({
    workingDirectory: '/tmp/gta2-worktree',
    assetDirectory: '/tmp/gta2-worktree/assets',
    port: portForWorkingDirectory('/tmp/gta2-worktree'),
    host: '0.0.0.0',
    mapFile: 'MP1-comp.gmp',
    styleFile: 'bil.sty',
    disableHmr: false,
  });
});

it('creates the initial asset directory for a new worktree', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gta2-worktree-'));
  temporaryDirectories.push(directory);
  const config = await initializeServerRuntime(directory);
  await expect(stat(config.assetDirectory)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
});
