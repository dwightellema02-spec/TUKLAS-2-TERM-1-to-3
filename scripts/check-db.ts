import dotenv from 'dotenv';
import { db } from '../src/server/db';

dotenv.config({ path: '.env.local', override: true });

async function main() {
  await db.$queryRaw`SELECT 1`;
  console.log('Database connection: ok');
}

main()
  .catch((error) => {
    console.error('Database connection: failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
