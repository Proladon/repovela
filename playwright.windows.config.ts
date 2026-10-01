import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/windows',
  outputDir: 'test-results/windows',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/windows', open: 'never' }],
    ['json', { outputFile: 'test-results/windows/results.json' }],
  ],
  // 直接連接正式版 WebView2；不啟動 Vite，也不下載或啟動 Chromium。
});
