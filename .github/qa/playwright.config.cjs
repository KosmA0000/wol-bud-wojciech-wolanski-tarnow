const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: 'chrome',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'node server.cjs',
    url: 'http://127.0.0.1:4179/index.html',
  },
});
