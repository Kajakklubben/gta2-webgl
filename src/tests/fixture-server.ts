import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gciFixture, mapFixture, styleFixture } from './unit/fixtures';
import { startServer } from '../server/main';
const directory = await mkdtemp(join(tmpdir(), 'gta2-fixtures-'));
const dataDirectory = join(directory, 'App_Executables', 'data');
await mkdir(dataDirectory, { recursive: true });
const gci = gciFixture();
await Promise.all([
  // Mirror the retail local single-player layout. bil.gmp/bil.scr are the
  // district files used by the installed game; MP1-comp.gmp remains as a
  // multiplayer fixture so online e2e coverage can use the same server.
  writeFile(join(dataDirectory, 'bil.gmp'), mapFixture()),
  writeFile(join(dataDirectory, 'MP1-comp.gmp'), mapFixture()),
  writeFile(join(dataDirectory, 'bil.sty'), styleFixture()),
  writeFile(join(dataDirectory, 'nyc.gci'), gci),
]);
const cleanup = () => void rm(directory, { recursive: true, force: true });
// Playwright only needs the Vite middleware; its HMR WebSocket would create a
// second listener and report a page error when the fixture server is recycled.
await startServer(true, { config: { assetDirectory: dataDirectory, port: 8001, disableHmr: true } });
process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup);
