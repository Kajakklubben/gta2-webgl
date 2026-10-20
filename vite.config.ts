import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/client',
    assetsDir: 'static',
    emptyOutDir: true,
    rollupOptions: { input: { game: resolve('index.html'), scenarios: resolve('scenarios.html'), sprites: resolve('sprites.html') } },
  },
});
