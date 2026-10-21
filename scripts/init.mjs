import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const workingDirectory = resolve(process.cwd());
const nodeModules = join(workingDirectory, 'node_modules');
const modulesLoaded = existsSync(join(nodeModules, '.modules.yaml')) || existsSync(join(nodeModules, '.pnpm'));

if (!modulesLoaded) {
  console.log('Installing workspace dependencies with pnpm...');
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: workingDirectory, stdio: 'inherit' });
  if (result.error) {
    console.error(`Unable to run pnpm install: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const assetDirectory = join(workingDirectory, 'assets');
mkdirSync(assetDirectory, { recursive: true });

let hash = 0x811c9dc5;
for (let index = 0; index < workingDirectory.length; index++) {
  hash ^= workingDirectory.charCodeAt(index);
  hash = Math.imul(hash, 0x01000193);
}
const port = 8000 + (hash >>> 0) % 1000;
console.log(`Initialized ${workingDirectory}`);
let dependencyStatus = 'installed';
if (modulesLoaded) dependencyStatus = 'already loaded';
console.log(`Dependencies: ${dependencyStatus}`);
console.log(`Assets: ${assetDirectory}`);
console.log(`Development server: http://127.0.0.1:${port}`);
