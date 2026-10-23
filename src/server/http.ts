import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { ASSET_NAMES } from '../shared/engine/loader/asset-loaders';
import { MULTIPLAYER_MAPS, type MultiplayerMapDefinition } from '../shared/engine/loader/multiplayer-maps';
import { assetDirectory } from './assets';

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gmp': 'application/octet-stream', '.sty': 'application/octet-stream', '.scr': 'application/octet-stream', '.wav': 'audio/wav' };
const dataExtensions = new Set(['.gmp', '.sty', '.scr', '.mmp', '.gci', '.gxt', '.seq', '.wav', '.raw', '.sdt']);
async function dataManifest(root: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    let relative = entry.name;
    if (prefix) relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await dataManifest(root, relative));
    else if (dataExtensions.has(extname(entry.name).toLowerCase())) files.push(relative);
  }
  return files;
}
export async function staticFile(request: IncomingMessage, response: ServerResponse, directory: string, pathname: string) {
  const root = await realpath(directory);
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const file = await realpath(candidate);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else response.end(data);
  } catch { response.writeHead(404).end('File not found'); }
}

export function createHttpServer(options: { clientDirectory?: string | undefined; development?: ((req: IncomingMessage, res: ServerResponse) => void) | undefined; assets?: string | undefined; maps?: readonly MultiplayerMapDefinition[] | undefined } = {}) {
  return createServer(async (request, response) => {
    try {
      const rawPath = (request.url ?? '/').split('?')[0] ?? '/';
      let pathname: string;
      try { pathname = decodeURIComponent(rawPath); }
      catch { response.writeHead(400).end('Invalid URL'); return; }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) { response.writeHead(403).end(); return; }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      if (pathname === '/health') { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); return; }
      if (pathname === '/maps') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(options.maps ?? MULTIPLAYER_MAPS)); return;
      }
      if (pathname.startsWith('/assets/')) {
        const name = pathname.slice(8);
        if (name === 'index.json') {
          const files = (await dataManifest(options.assets ?? assetDirectory())).sort();
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(files)); return;
        }
        const extension = extname(name).toLowerCase();
        if (!name || !dataExtensions.has(extension) && !ASSET_NAMES.some(asset => asset === name)) { response.writeHead(404).end(); return; }
        await staticFile(request, response, options.assets ?? assetDirectory(), '/' + name); return;
      }
      if (options.development) { options.development(request, response); return; }
      let clientPath = pathname;
      if (pathname === '/') clientPath = '/index.html';
      await staticFile(request, response, options.clientDirectory ?? resolve('dist/client'), clientPath);
    } catch { response.writeHead(500).end('Unable to serve request'); }
  });
}
