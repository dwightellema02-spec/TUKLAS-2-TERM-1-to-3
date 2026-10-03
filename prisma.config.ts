import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Keep local Prisma commands on the developer's local/Preview database. A
// production DATABASE_URL must be supplied explicitly by the release process.
dotenv.config({ path: '.env.local', override: true });

// Explicit opt-in for the isolated test database: `DB_TARGET=test prisma ...`.
// Without it, Prisma always uses the development DATABASE_URL.
if (process.env.DB_TARGET === 'test') {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('DB_TARGET=test requires TEST_DATABASE_URL to be set.');
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
