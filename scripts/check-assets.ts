import { checkAssets } from '../src/server/assets';
checkAssets().then(() => console.log('Map and style assets are valid.')).catch(error => { console.error(error.message); process.exitCode = 1; });
