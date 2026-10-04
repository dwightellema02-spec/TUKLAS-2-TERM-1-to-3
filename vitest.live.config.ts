import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// LIVE AI harness config (npm run test:live). Same safety rules as the normal suite: the TEST database only.
// Unlike the normal suite, provider keys from .env.local are NOT blanked, because this run is meant to call
// a real model. It does nothing unless RUN_LIVE_AI=true.
// A key exported in the shell wins over a blank placeholder line in .env.local (override: false).
dotenv.config({ path: '.env.local', override: false });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error('Refusing to run: TEST_DATABASE_URL must be set and point to a database whose name ends in "_test".');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DB_TARGET = 'test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/ai/live/**/*.live.test.ts', 'tests/ai/live/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    env: { DATABASE_URL: testDatabaseUrl, DB_TARGET: 'test', TEACHER_INVITE_CODE: 'test-only-teacher-invite-code' },
  },
});
