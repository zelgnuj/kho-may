import { defineConfig, devices } from '@playwright/test';

// Chạy: npm run build && npm run test:e2e
// PW_CHROMIUM: đường dẫn Chromium có sẵn trên máy (không bắt buộc)
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
    locale: 'vi-VN',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  }
});
