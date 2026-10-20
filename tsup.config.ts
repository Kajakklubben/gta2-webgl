import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server/main.ts'], format: ['esm'], platform: 'node', target: 'node24',
  outDir: 'dist/server', clean: true, external: ['vite'],
});
