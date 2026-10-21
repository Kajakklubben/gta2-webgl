import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: 'public',
  define: { 'import.meta.env.VITE_STATIC_BUILD': JSON.stringify(process.env['STATIC_BUILD'] === '1' ? 'true' : 'false') },
  build: {
    outDir: 'dist/client',
    assetsDir: 'static',
    emptyOutDir: true,
    rollupOptions: { input: { game: resolve('index.html'), scenarios: resolve('scenarios.html'), sprites: resolve('sprites.html') } },
  },
});
