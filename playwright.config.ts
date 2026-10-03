import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

// Browser tests ALWAYS run against the isolated test database (reset + seeded in global setup).
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
if (!/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('Refusing to run browser tests: TEST_DATABASE_URL must point to a "_test" database.');
}

const PORT = 3300;

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
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      NEXT_TELEMETRY_DISABLED: '1',
      TEACHER_INVITE_CODE: 'e2e-teacher-invite-code',
    },
  },
});
