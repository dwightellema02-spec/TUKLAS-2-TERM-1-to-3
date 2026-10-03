import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

// Browser tests ALWAYS run against the isolated test database (reset + seeded in global setup).
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
if (!/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('Refusing to run browser tests: TEST_DATABASE_URL must point to a "_test" database.');
}

const PORT = 3300;
const FAKE_AI_PORT = 3401;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      // A stand-in for the Anthropic API so the browser tests can exercise the AI path
      // (and misbehaving models) without a key. It records every prompt it receives.
      command: 'node e2e/fake-ai-server.mjs',
      url: `http://localhost:${FAKE_AI_PORT}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { FAKE_AI_PORT: String(FAKE_AI_PORT) },
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: testDatabaseUrl,
        NEXT_TELEMETRY_DISABLED: '1',
        TEACHER_INVITE_CODE: 'e2e-teacher-invite-code',
        AI_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'e2e-fake-key',
        ANTHROPIC_BASE_URL: `http://localhost:${FAKE_AI_PORT}`,
      },
    },
  ],
});
