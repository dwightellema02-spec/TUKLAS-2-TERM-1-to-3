import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../src/server/db';

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed.length === 0) {
      continue;
    }
    const dollarMatches = (line.match(/\$\$/g) || []).length;
    if (dollarMatches % 2 !== 0) {
      inDollarQuote = !inDollarQuote;
    }
    current += line + '\n';
    if (!inDollarQuote && trimmed.endsWith(';')) {
      statements.push(current.trim().replace(/;$/, ''));
      current = '';
    }
  }
  if (current.trim().length > 0) {
    statements.push(current.trim().replace(/;$/, ''));
  }
  return statements.filter((s) => s.length > 0);
}

async function main() {
  const migrationDir = path.join(process.cwd(), 'prisma', 'migrations', '20260930000000_phase2_backend_foundation');
  const sqlPath = path.join(migrationDir, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Applying Phase 2 migration SQL...');

  const statements = splitSqlStatements(sql);
  console.log(`Parsed ${statements.length} statements.`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await db.$executeRawUnsafe(stmt);
    } catch (err) {
      console.error(`Error on statement #${i + 1}:\n${stmt}\n`);
      throw err;
    }
  }

  // Record in _prisma_migrations
  const migrationName = '20260930000000_phase2_backend_foundation';
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  const existing = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM _prisma_migrations WHERE migration_name = $1`,
    migrationName,
  );

  if (existing.length === 0) {
    const id = crypto.randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      id,
      checksum,
      migrationName
    );
    console.log(`Recorded ${migrationName} in _prisma_migrations.`);
  } else {
    console.log(`${migrationName} was already recorded in _prisma_migrations.`);
  }

  console.log('Phase 2 migration applied successfully!');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
