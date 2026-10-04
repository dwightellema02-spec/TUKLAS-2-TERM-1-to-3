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
    // .next holds copies of external packages (with their own test files) after a Next build or dev run.
    // tests/ai/live runs only through `npm run test:live` (vitest.live.config.ts): it calls a real model.
    exclude: ['e2e/**', 'node_modules/**', '.next/**', 'tests/ai/live/**'],
    env: {
      DATABASE_URL: testDatabaseUrl,
      DB_TARGET: 'test',
      TEACHER_INVITE_CODE: 'test-only-teacher-invite-code',
      // The normal suite must NEVER reach a real model, even when a real key sits in .env.local.
      // Tests that need a key set their own fake one.
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
      ANTHROPIC_BASE_URL: '',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
