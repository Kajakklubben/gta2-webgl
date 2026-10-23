import { basename, resolve } from 'node:path';
import { defineConfig } from 'vite';

const applicationTitle = basename(resolve(process.cwd()));

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const applicationTitlePlugin = {
  name: 'application-title',
  transformIndexHtml(html: string) {
    return html.replaceAll('__APPLICATION_TITLE__', escapeHtml(applicationTitle));
  },
};

export default defineConfig({
  plugins: [applicationTitlePlugin],
  publicDir: 'public',
  define: { 'import.meta.env.VITE_STATIC_BUILD': JSON.stringify(process.env['STATIC_BUILD'] === '1' ? 'true' : 'false') },
  build: {
    outDir: 'dist/client',
    assetsDir: 'static',
    emptyOutDir: true,
    rollupOptions: { input: { game: resolve('index.html'), scenarios: resolve('scenarios.html'), sprites: resolve('sprites.html') } },
  },
});
