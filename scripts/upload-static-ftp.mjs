import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const root = resolve(process.cwd());
const localRoot = resolve(root, 'dist', 'client');
const settingsPath = resolve(root, '.ftp-upload.json');
let savedSettings = {};
try {
  const parsed = JSON.parse(await readFile(settingsPath, 'utf8'));
  if (parsed && typeof parsed === 'object') savedSettings = parsed;
} catch { /* First run, or no local settings file yet. */ }

let protocol = process.env.FTP_PROTOCOL;
let host = process.env.FTP_HOST;
let port = process.env.FTP_PORT;
let user = process.env.FTP_USER;
let password = process.env.FTP_PASSWORD;
let remoteDirectory = process.env.FTP_REMOTE_DIR;
const skipAssets = process.argv.includes('--skip-assets') || process.env.FTP_SKIP_ASSETS === '1';

async function readSecret(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  process.stdout.write(question);
  const input = process.stdin;
  let value = '';
  input.setRawMode(true);
  input.resume();
  return new Promise((resolvePromise, reject) => {
    const finish = (error, result) => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolvePromise(result);
    };
    const onData = chunk => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') return finish(new Error('FTP prompt cancelled.'));
        if (character === '\r' || character === '\n') return finish(undefined, value);
        if (character === '\u007f' || character === '\b') { value = value.slice(0, -1); continue; }
        value += character;
      }
    };
    input.on('data', onData);
  });
}

async function promptForConfiguration() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  const suggestedProtocol = protocol ?? (typeof savedSettings.protocol === 'string' ? savedSettings.protocol : 'ftp');
  const suggestedHost = host ?? (typeof savedSettings.host === 'string' ? savedSettings.host : '');
  const suggestedPort = port ?? (typeof savedSettings.port === 'string' ? savedSettings.port : '21');
  const suggestedUser = user ?? (typeof savedSettings.user === 'string' ? savedSettings.user : '');
  const suggestedRemoteDirectory = remoteDirectory ?? (typeof savedSettings.remoteDirectory === 'string' ? savedSettings.remoteDirectory : '/');
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  try {
    protocol = (await prompts.question(`FTP protocol [${suggestedProtocol}]: `)).trim() || suggestedProtocol;
    host = (await prompts.question(`FTP host [${suggestedHost}]: `)).trim() || suggestedHost;
    port = (await prompts.question(`FTP port [${suggestedPort}]: `)).trim() || suggestedPort;
    user = (await prompts.question(`FTP username [${suggestedUser}]: `)).trim() || suggestedUser;
    remoteDirectory = (await prompts.question(`Remote path [${suggestedRemoteDirectory}]: `)).trim() || suggestedRemoteDirectory;
  } finally {
    prompts.close();
  }
  if (password === undefined) password = await readSecret('FTP password: ');
}

await promptForConfiguration();
protocol ??= 'ftp';
remoteDirectory ??= '/';
if (host === 'simply.com' || host === 'www.simply.com') {
  console.warn('Using Simply.com FTP endpoint ftp.simply.com instead of the website host.');
  host = 'ftp.simply.com';
}

if (!host || !user || password === undefined) {
  console.error('Missing FTP configuration. Set FTP_HOST, FTP_USER, and FTP_PASSWORD.');
  console.error('Optional: FTP_PROTOCOL=ftp|ftps, FTP_PORT, FTP_REMOTE_DIR.');
  process.exit(1);
}

try {
  await writeFile(settingsPath, `${JSON.stringify({ protocol, host, port, user, remoteDirectory }, null, 2)}\n`, 'utf8');
} catch (error) {
  console.warn(`Could not save FTP suggestions: ${error instanceof Error ? error.message : String(error)}`);
}

const quoteConfigValue = value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;
const remoteRoot = `${protocol}://${host}${port ? `:${port}` : ''}${remoteDirectory.startsWith('/') ? remoteDirectory : `/${remoteDirectory}`}`.replace(/\/$/, '');

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function upload(file) {
  const relativePath = relative(localRoot, file).split('\\').join('/');
  const remotePath = `${remoteRoot}/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
  const config = [
    `url = ${quoteConfigValue(remotePath)}`,
    `user = ${quoteConfigValue(`${user}:${password}`)}`,
    `upload-file = ${quoteConfigValue(file)}`,
    'ftp-create-dirs',
    'fail',
    'silent',
    'show-error',
  ].join('\n');
  return new Promise((resolvePromise, reject) => {
    const child = spawn('curl', ['--config', '-'], { stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(`curl exited with code ${code} while uploading ${relativePath}`)));
    child.stdin.end(config);
  });
}

const files = (await filesUnder(localRoot))
  .filter(file => !skipAssets || !relative(localRoot, file).split('\\').join('/').startsWith('assets/'))
  .sort();
if (!files.length) throw new Error(`No files found under ${localRoot}. Run pnpm build:static first.`);
console.log(`Uploading ${files.length} files${skipAssets ? ' (excluding assets/)' : ''} to ${remoteRoot}/`);
for (let index = 0; index < files.length; index++) {
  const file = files[index];
  await upload(file);
  console.log(`[${index + 1}/${files.length}] ${relative(localRoot, file)}`);
}
console.log('FTP upload complete.');
