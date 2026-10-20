import { startServer } from './main';
startServer(true).catch(error => { console.error(error.message); process.exitCode = 1; });
