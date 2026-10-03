import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { POST as startSession } from '../src/app/api/practice/sessions/route';
import type { MasteryLevel } from '../src/server/mastery';

const PREFIX = 'adaptive-test-';
const INTEGERS = 'lesson-math-7-integers';

async function student(tag: string, level?: MasteryLevel) {
  const user = await db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: 'test-only-hash',
      role: 'STUDENT',
      displayName: `Adaptive ${tag}`,
    },
  });
  if (level) {
    const skills = await db.skill.findMany({ where: { code: { startsWith: 'G7-INT-' } } });
    for (const skill of skills) {
      await db.skillMastery.create({
        data: {
          studentId: user.id,
          skillId: skill.id,
          status: level,
          ruleCode: 'RULE_TEST',
          attemptCount: 10,
          accuracy: 0.9,
          recentAccuracy: 0.9,
          consistency: 0.9,
          details: {},
          masteryVersion: 'MASTERY_V1',
        },
      });
    }
  }
  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: 'STUDENT',
  });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

async function servedQuestions(cookie: string, total: number) {
  const response = await startSession(
    new Request('http://localhost/api/practice/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ source: 'LESSON_BANK', lessonId: INTEGERS, total }),
    }),
  );
  expect(response.status).toBe(201);
  const id = (await response.json()).data.session.id as string;
  return db.practiceQuestion.findMany({
    where: { sessionId: id },
    orderBy: { position: 'asc' },
    include: { skillRecord: true },
  });
}

const count = (items: string[], value: string) => items.filter((item) => item === value).length;

afterEach(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('practice adapts to what the student has shown', () => {
  it('gives a new student a mixed set of all four skills, starting with easier questions', async () => {
    const { cookie } = await student('new');
    const served = await servedQuestions(cookie, 8);
    expect(new Set(served.map((q) => q.skillRecord?.code)).size).toBe(4);
    const difficulties = served.map((q) => q.difficulty);
    expect(count(difficulties, 'HARD')).toBe(0);
    expect(count(difficulties, 'EASY')).toBeGreaterThanOrEqual(4);
  });

  it('gives a proficient student mostly harder questions, still across every skill', async () => {
    const { cookie } = await student('pro', 'PROFICIENT');
    const served = await servedQuestions(cookie, 8);
    expect(new Set(served.map((q) => q.skillRecord?.code)).size).toBe(4);
    const difficulties = served.map((q) => q.difficulty);
    expect(count(difficulties, 'HARD')).toBeGreaterThanOrEqual(6);
    expect(count(difficulties, 'EASY')).toBe(0);
  });

  it('serves the same lesson differently to a beginner and a proficient student', async () => {
    const beginner = await servedQuestions((await student('b', 'LEARNING')).cookie, 8);
    const expert = await servedQuestions((await student('e', 'MASTERED')).cookie, 8);
    const rank = { EASY: 0, MEDIUM: 1, HARD: 2 } as Record<string, number>;
    const mean = (qs: { difficulty: string }[]) => qs.reduce((sum, q) => sum + rank[q.difficulty], 0) / qs.length;
    expect(mean(expert)).toBeGreaterThan(mean(beginner) + 1);
  });

  it('aims at medium questions for a developing student', async () => {
    const { cookie } = await student('dev', 'DEVELOPING');
    const served = await servedQuestions(cookie, 8);
    const difficulties = served.map((q) => q.difficulty);
    expect(count(difficulties, 'MEDIUM')).toBeGreaterThanOrEqual(5);
  });

  it('targets each skill separately: weak in one skill, strong in another', async () => {
    const { user, cookie } = await student('split');
    const [weak, strong] = await db.skill.findMany({
      where: { code: { in: ['G7-INT-ADD', 'G7-INT-MUL'] } },
      orderBy: { code: 'asc' },
    });
    const make = (skillId: string, status: MasteryLevel) =>
      db.skillMastery.create({
        data: {
          studentId: user.id,
          skillId,
          status,
          ruleCode: 'RULE_TEST',
          attemptCount: 10,
          accuracy: 0.9,
          recentAccuracy: 0.9,
          consistency: 0.9,
          details: {},
          masteryVersion: 'MASTERY_V1',
        },
      });
    await make(weak.id, 'LEARNING'); // adding: needs easy questions
    await make(strong.id, 'MASTERED'); // multiplying: needs hard questions

    const served = await servedQuestions(cookie, 16);
    const addDifficulties = served.filter((q) => q.skillRecord?.code === 'G7-INT-ADD').map((q) => q.difficulty);
    const mulDifficulties = served.filter((q) => q.skillRecord?.code === 'G7-INT-MUL').map((q) => q.difficulty);
    const rank = { EASY: 0, MEDIUM: 1, HARD: 2 } as Record<string, number>;
    const mean = (values: string[]) => values.reduce((s, v) => s + rank[v], 0) / values.length;
    expect(addDifficulties.length).toBeGreaterThan(0);
    expect(mulDifficulties.length).toBeGreaterThan(0);
    expect(mean(mulDifficulties)).toBeGreaterThan(mean(addDifficulties));
  });

  it('rotates the weakest skill first', async () => {
    const { user, cookie } = await student('order');
    const skills = await db.skill.findMany({ where: { code: { startsWith: 'G7-INT-' } } });
    const divide = skills.find((s) => s.code === 'G7-INT-DIV')!;
    for (const skill of skills) {
      await db.skillMastery.create({
        data: {
          studentId: user.id,
          skillId: skill.id,
          status: skill.id === divide.id ? 'LEARNING' : 'PROFICIENT',
          ruleCode: 'RULE_TEST',
          attemptCount: 10,
          accuracy: 0.9,
          recentAccuracy: 0.9,
          consistency: 0.9,
          details: {},
          masteryVersion: 'MASTERY_V1',
        },
      });
    }
    const served = await servedQuestions(cookie, 4);
    expect(served[0].skillRecord?.code).toBe('G7-INT-DIV');
  });

  it('still brings back missed questions before anything else, whatever the difficulty', async () => {
    const { user, cookie } = await student('missed', 'PROFICIENT');
    const hard = await db.quizQuestion.findFirstOrThrow({
      where: { lessonId: INTEGERS, assessmentId: null, difficulty: 'EASY' },
      orderBy: { position: 'asc' },
    });
    // The student once got this EASY question wrong.
    const session = await db.practiceSession.create({
      data: { studentId: user.id, lessonId: INTEGERS, subject: 'M', topic: 'T', difficulty: 'Mixed', total: 1 },
    });
    const copy = await db.practiceQuestion.create({
      data: {
        sessionId: session.id,
        quizQuestionId: hard.id,
        question: hard.question,
        options: hard.options as never,
        correctIndex: hard.correctIndex,
        difficulty: hard.difficulty,
        skillId: hard.skillId,
      },
    });
    await db.practiceAnswer.create({
      data: {
        sessionId: session.id,
        questionId: copy.id,
        question: hard.question,
        options: hard.options as never,
        correctIndex: hard.correctIndex,
        selectedIndex: (hard.correctIndex + 1) % 4,
        correct: false,
      },
    });
    const served = await servedQuestions(cookie, 5);
    expect(served[0].quizQuestionId).toBe(hard.id);
  });
});
