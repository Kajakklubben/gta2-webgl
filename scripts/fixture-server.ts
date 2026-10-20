import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gciFixture, mapFixture, styleFixture } from '../src/tests/unit/fixtures';
import { spawn } from 'node:child_process';
import { startServer } from '../src/server/main';
const directory = await mkdtemp(join(tmpdir(), 'gta2-fixtures-'));
const dataDirectory = join(directory, 'App_Executables', 'data');
await mkdir(dataDirectory, { recursive: true });
const gci = gciFixture();
await Promise.all([
  writeFile(join(directory, 'MP1-comp.gmp'), mapFixture()),
  writeFile(join(directory, 'bil.sty'), styleFixture()),
  writeFile(join(directory, 'nyc.gci'), gci),
  writeFile(join(dataDirectory, 'nyc.gci'), gci),
]);
process.env['ASSET_DIR'] = directory;
process.env['PORT'] ??= '8001';
// Playwright only needs the Vite middleware; its HMR WebSocket would create a
// second listener and report a page error when the fixture server is recycled.
process.env['GTA2_DISABLE_HMR'] = '1';
const cleanup = () => void rm(directory, { recursive: true, force: true });
if (process.env['FIXTURE_PRODUCTION'] === '1') {
  const child = spawn(process.execPath, ['dist/server/main.js'], { env: process.env, stdio: 'inherit' });
  process.once('SIGTERM', () => child.kill('SIGTERM')); process.once('SIGINT', () => child.kill('SIGINT'));
  child.once('exit', code => { cleanup(); process.exit(code ?? 0); });
} else await startServer(true);
process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup);
