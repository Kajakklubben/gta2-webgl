import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve('src');
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const sourceFiles = (await Promise.all(['client', 'server', 'shared'].map(directory => collect(resolve(root, directory)))).then(groups => groups.flat()));
const importPattern = /(?:from\s*|import\s*\()(['"])([^'"\n]+)\1/g;
const violations = [];
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const relativeFile = relative(process.cwd(), file);
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2];
    if (!specifier || !specifier.startsWith('.')) continue;
    const target = resolve(file, '..', specifier).replaceAll('\\', '/');
    const owner = relative(root, file).replaceAll('\\', '/').split('/')[0];
    if (owner === 'shared' && /\/(?:client|server)\//.test(target)) violations.push(`${relativeFile} imports ${specifier}`);
    if (owner === 'client' && /\/server\//.test(target)) violations.push(`${relativeFile} imports ${specifier}`);
    if (owner === 'server' && /\/client\//.test(target)) violations.push(`${relativeFile} imports ${specifier}`);
    if (relativeFile.startsWith('src/shared/loader/models/') && (/\/protocol(?:\/|$)/.test(target))) violations.push(`${relativeFile} imports ${specifier}; loader models must remain protocol-independent`);
  }
}
if (violations.length) {
  console.error('Architecture boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture boundaries OK (${sourceFiles.length} source files checked)`);
}
