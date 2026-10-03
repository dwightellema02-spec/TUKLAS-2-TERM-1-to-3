import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Keep local Prisma commands on the developer's local/Preview database. A
// production DATABASE_URL must be supplied explicitly by the release process.
dotenv.config({ path: '.env.local', override: true });

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
