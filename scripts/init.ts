import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { initializeServerRuntime, type ServerRuntimeConfig } from '../src/server/runtime-config';

/** Create the checkout-local directories needed before the first server run. */
export async function init(workingDirectory = process.cwd()): Promise<ServerRuntimeConfig> {
  return initializeServerRuntime(workingDirectory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  init().then(config => {
    console.log(`Initialized ${config.workingDirectory}`);
    console.log(`Assets: ${config.assetDirectory}`);
    console.log(`Development server: http://127.0.0.1:${config.port}`);
  }).catch(error => {
    let message: unknown = error;
    if (error instanceof Error) message = error.message;
    console.error(message);
    process.exitCode = 1;
  });
}
