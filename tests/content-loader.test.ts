import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { loadTerm1Curriculum } from '../prisma/content/load-term1';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

describe('the production content loader', () => {
  it('is idempotent: loading twice changes nothing and reports the same totals', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const author = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher-demo@tuklas.local' } });
      const count = async () => ({
        lessons: await prisma.lesson.count({ where: { id: { startsWith: 'lesson-math-7-' } } }),
        questions: await prisma.quizQuestion.count({ where: { id: { startsWith: 'practice-' } } }),
        objectives: await prisma.learningObjective.count({ where: { lesson: { id: { startsWith: 'lesson-math-7-' } } } }),
      });
      const before = await count();
      const first = await loadTerm1Curriculum(prisma, author.id);
      const second = await loadTerm1Curriculum(prisma, author.id);
      expect(first).toEqual({ units: 3, lessons: 5, practiceQuestions: 144 });
      expect(second).toEqual(first);
      expect(await count()).toEqual(before);
    } finally {
      await prisma.$disconnect();
    }
  }, 120_000);

  it('the command line is a dry run without --confirm, prints only the database HOST, and refuses a missing author', () => {
    const password = new URL(url).password;
    const run = (args: string[]) => {
      try {
        return { code: 0, out: execFileSync('npx', ['tsx', 'scripts/load-curriculum.ts', ...args], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] }) };
      } catch (error) {
        const failure = error as { status?: number; stdout?: string; stderr?: string };
        return { code: failure.status ?? 1, out: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
      }
    };

    const dry = run(['--author-email=teacher-demo@tuklas.local']);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain('Dry run: nothing was changed');
    expect(dry.out).toContain('Target database host:');
    expect(dry.out).not.toContain(password);
    expect(dry.out).not.toContain(url);

    const noAuthor = run([]);
    expect(noAuthor.code).not.toBe(0);
    expect(noAuthor.out).toContain('--author-email');

    const student = run(['--author-email=student-juan@tuklas.local', '--confirm']);
    expect(student.code).not.toBe(0);
    expect(student.out).toMatch(/teacher or administrator/i);
    expect(student.out).not.toContain(password);
  }, 180_000);
});
