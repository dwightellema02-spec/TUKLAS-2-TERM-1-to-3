/**
 * Loads the real Grade 7 Term 1 curriculum into the database named by DATABASE_URL.
 *
 *   npm run content:load -- --author-email=teacher@school.example --confirm
 *
 * This is the PRODUCTION path for lessons: the demo seed (prisma/seed.ts) refuses to run in production, and this does
 * not create demo accounts. It needs an EXISTING teacher or administrator account to own the lessons. Without
 * --confirm it only says what it would do. It never prints the database URL or any secret.
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { loadTerm1Curriculum } from '../prisma/content/load-term1';
import { buildTerm1Lessons, TERM1_UNITS } from '../prisma/content/term1-lessons';
import { buildTerm1WeeklyLessons } from '../prisma/content/term1-weekly';

dotenv.config({ path: '.env.local' });

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const email = arg('author-email')?.trim().toLowerCase();
  if (!email) throw new Error('Pass --author-email=<an existing teacher or administrator account>.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient();
  try {
    const author = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, isActive: true } });
    if (!author || !author.isActive || (author.role !== 'TEACHER' && author.role !== 'ADMIN')) {
      throw new Error('No active teacher or administrator account has that email. Create the account first.');
    }
    const host = new URL(process.env.DATABASE_URL).host; // the host only: never the user, password or database name
    console.log(`Target database host: ${host}`);
    const planned = [...buildTerm1Lessons(), ...buildTerm1WeeklyLessons()];
    const plannedQuestions = planned.reduce((sum, lesson) => sum + lesson.bank.length, 0);
    console.log(`This will create or update ${Object.keys(TERM1_UNITS).length + 1} units, ${planned.length} Grade 7 Term 1 lessons and ${plannedQuestions} practice questions, published, owned by that account.`);
    if (!flag('confirm')) {
      console.log('Dry run: nothing was changed. Add --confirm to load the content.');
      return;
    }
    const summary = await loadTerm1Curriculum(prisma, author.id);
    console.log(`Loaded ${summary.lessons} lessons, ${summary.units} units and ${summary.practiceQuestions} practice questions.`);
    console.log('Reminder: the lesson text is a draft that no teacher has reviewed yet.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Loading failed.');
  process.exitCode = 1;
});
