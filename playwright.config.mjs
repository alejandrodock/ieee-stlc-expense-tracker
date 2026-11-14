import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  use: {
    actionTimeout: 10000,
    baseURL: 'http://127.0.0.1:3100', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: { command: 'node tests/preview.mjs', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 60000 },
});
