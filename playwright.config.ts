import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './src/tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8001', browserName: 'chromium', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node --import tsx src/tests/fixture-server.ts', url: 'http://127.0.0.1:8001/health', reuseExistingServer: false, timeout: 30000 },
});
