import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const artifactDir = process.env.UF_VISUAL_QA_DIR || join(tmpdir(), 'urbanflow-alpha-0.8.0-visual-qa');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: join(artifactDir, 'playwright-results'),
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3100/health',
    env: { HOST: '127.0.0.1', PORT: '3100' },
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
