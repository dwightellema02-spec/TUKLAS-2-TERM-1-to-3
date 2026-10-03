import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Resets the isolated test database before every run so results never depend on
 * rows left behind by earlier runs or by development data:
 *   1. apply all migrations (proves a fresh database can be built from migrations)
 *   2. truncate every table
 *   3. load the deterministic demo seed fixture
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? '';
  if (!/_test(\?|$)/.test(url)) {
    throw new Error('Refusing to reset a database whose name does not end in "_test".');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    DB_TARGET: 'test',
    ALLOW_DEMO_SEED: 'true',
    NODE_ENV: 'test' as const,
  };

  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx tsx prisma/seed.ts', { stdio: 'pipe', env });
}
