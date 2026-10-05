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

// Explicit opt-in for a real deployment database (for example Neon), set only in the shell for that one command:
//   $env:DB_TARGET = "production"; $env:PRODUCTION_DATABASE_URL = "<the DIRECT connection string>"; npx.cmd prisma migrate deploy
// It refuses a local address, so this switch cannot be used by mistake to hit your own PC, and `prisma migrate dev`/`reset`
// are refused outright against it.
if (process.env.DB_TARGET === 'production') {
  const url = process.env.PRODUCTION_DATABASE_URL;
  if (!url) throw new Error('DB_TARGET=production requires PRODUCTION_DATABASE_URL to be set.');
  if (/localhost|127\.0\.0\.1/.test(url)) throw new Error('PRODUCTION_DATABASE_URL points at this computer. Paste the Neon connection string.');
  const args = process.argv.slice(2);
  const after = (word: string) => args[args.indexOf(word) + 1];
  const forbidden = (args.includes('migrate') && ['dev', 'reset'].includes(after('migrate'))) || (args.includes('db') && after('db') === 'push');
  if (forbidden) {
    throw new Error('Only `prisma migrate deploy` may be used against a production database.');
  }
  process.env.DATABASE_URL = url;
}

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
