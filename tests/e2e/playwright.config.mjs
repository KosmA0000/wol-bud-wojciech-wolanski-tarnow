import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4182);

export default defineConfig({
  testDir: '.',
  testMatch: /\.spec\.mjs$/,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'node server.mjs',
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port) },
  },
});
