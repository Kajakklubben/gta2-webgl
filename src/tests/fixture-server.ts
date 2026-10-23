import { resolve } from 'node:path';
import { startServer } from '../server/main';
// Browser verification uses the same authored Tiny Town bundle as the normal
// client. Unit tests retain synthetic map/style fixtures; replay scenarios do
// not substitute those fixtures for the loaded map or its textures.
const assetDirectory = resolve(process.cwd(), 'assets');
await startServer(true, {
  config: {
    assetDirectory,
    mapFile: 'MP1-comp.gmp',
    styleFile: 'bil.sty',
    pickupScript: 'MP1-6P.SCR',
    port: 8001,
    disableHmr: true,
  },
});
