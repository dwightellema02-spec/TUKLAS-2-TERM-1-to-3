import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Match Next.js local development and avoid falling back to a production .env.
dotenv.config({ path: '.env.local', override: true });

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
