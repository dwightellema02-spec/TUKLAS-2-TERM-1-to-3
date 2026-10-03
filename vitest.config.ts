import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Match Next.js local development and avoid falling back to a production .env.
dotenv.config({ path: '.env.local', override: true });

// Tests ALWAYS run against the dedicated test database, never the dev database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run tests (see .env.example).');
}
if (!/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('Refusing to run tests: TEST_DATABASE_URL must point to a database whose name ends in "_test".');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DB_TARGET = 'test';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ['tests/global-setup.ts'],
    // Browser tests live in e2e/ and run with Playwright (npm run test:e2e).
    exclude: ['e2e/**', 'node_modules/**'],
    env: {
      DATABASE_URL: testDatabaseUrl,
      DB_TARGET: 'test',
      TEACHER_INVITE_CODE: 'test-only-teacher-invite-code',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
