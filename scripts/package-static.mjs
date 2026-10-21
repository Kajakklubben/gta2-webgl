import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const assetRoot = join(root, 'assets');
const nestedAssetRoot = join(assetRoot, 'App_Executables', 'data');
const output = join(root, 'dist', 'client', 'assets');

const hasRequiredFiles = directory =>
  existsSync(join(directory, 'bil.sty')) &&
  (existsSync(join(directory, 'bil.gmp')) || existsSync(join(directory, 'MP1-comp.gmp')));

if (!hasRequiredFiles(assetRoot) && !hasRequiredFiles(nestedAssetRoot)) {
  console.warn('Static asset package skipped: no GTA2 data files found in assets/.');
  process.exit(0);
}

const source = hasRequiredFiles(assetRoot) ? assetRoot : nestedAssetRoot;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
console.log(`Packaged static GTA2 assets from ${source} to ${output}`);
