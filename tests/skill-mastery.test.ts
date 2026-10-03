import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { POST as startSession } from '../src/app/api/practice/sessions/route';
import { GET as getSession } from '../src/app/api/practice/sessions/[id]/route';
import { POST as submitAnswer } from '../src/app/api/practice/sessions/[id]/answers/route';
import { GET as getMastery } from '../src/app/api/mastery/route';
import { SkillMasteryService } from '../src/services/skill-mastery.service';

const PREFIX = 'mastery-test-';
const INTEGERS = 'lesson-math-7-integers';

async function student(tag: string) {
  const user = await db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: 'test-only-hash',
      role: 'STUDENT',
      displayName: `Mastery ${tag}`,
    },
  });
  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: 'STUDENT',
  });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const hdr = (cookie: string) => ({ 'content-type': 'application/json', Cookie: cookie });

async function newSession(cookie: string, total = 50) {
  const response = await startSession(
    new Request('http://localhost/api/practice/sessions', {
      method: 'POST',
      headers: hdr(cookie),
      body: JSON.stringify({ source: 'LESSON_BANK', lessonId: INTEGERS, total }),
    }),
  );
  return (await response.json()).data.session.id as string;
}

async function questionsOf(cookie: string, id: string) {
  const response = await getSession(
    new Request(`http://localhost/api/practice/sessions/${id}`, { headers: hdr(cookie) }),
    { params: Promise.resolve({ id }) },
  );
  return (await response.json()).data.session.questions as Array<{ id: string; options: string[] }>;
}

function answer(cookie: string, sessionId: string, questionId: string, selectedIndex: number) {
  return submitAnswer(
    new Request(`http://localhost/api/practice/sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: hdr(cookie),
      body: JSON.stringify({ questionId, selectedIndex }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

/** Answers the first `count` questions of a session; `wrongWhen(i)` chooses which are wrong. */
async function play(cookie: string, sessionId: string, count: number, wrongWhen: (i: number) => boolean) {
  const questions = await questionsOf(cookie, sessionId);
  for (let i = 0; i < count; i += 1) {
    const key = await db.practiceQuestion.findUniqueOrThrow({ where: { id: questions[i].id } });
    const index = wrongWhen(i) ? (key.correctIndex + 1) % 4 : key.correctIndex;
    expect((await answer(cookie, sessionId, questions[i].id, index)).status).toBe(200);
  }
  return questions;
}

async function skillRowsOf(studentId: string) {
  return db.skillMastery.findMany({ where: { studentId }, include: { skill: true } });
}

afterEach(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('mastery is computed from real answers', () => {
  it('has no mastery before any practice, then LEARNING after the first answers', async () => {
    const { user, cookie } = await student('start');
    expect(await skillRowsOf(user.id)).toHaveLength(0);

    const id = await newSession(cookie, 8);
    await play(cookie, id, 2, () => false);
    const rows = await skillRowsOf(user.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe('LEARNING'); // 1 question per skill is far too little evidence
      expect(row.masteryVersion).toBe('MASTERY_V1');
    }
  });

  it('writes one history row per level change and explains each', async () => {
    const { user, cookie } = await student('history');
    const id = await newSession(cookie, 8);
    await play(cookie, id, 8, () => false);

    const rows = await skillRowsOf(user.id);
    expect(rows.length).toBe(4); // an 8-question mixed session touches all four skills
    for (const row of rows) {
      const history = await db.skillMasteryHistory.findMany({
        where: { studentId: user.id, skillId: row.skillId },
        orderBy: { createdAt: 'asc' },
      });
      expect(history[0]).toMatchObject({ previousStatus: null, newStatus: 'LEARNING' });
      expect(history.length).toBeGreaterThanOrEqual(1);
      const statuses = history.map((h) => h.newStatus);
      expect(new Set(statuses).size).toBe(statuses.length); // only recorded when the level actually changes
      expect(history.every((h) => h.summary.length > 10 && h.ruleCode.startsWith('RULE_'))).toBe(true);
    }
  });

  it('does not reach a high level with only a few right answers, however perfect', async () => {
    const { user, cookie } = await student('few');
    const id = await newSession(cookie, 4);
    await play(cookie, id, 4, () => false);
    for (const row of await skillRowsOf(user.id)) {
      expect(['LEARNING', 'DEVELOPING']).toContain(row.status);
      expect(row.status).not.toBe('MASTERED');
    }
  });

  it('reaches MASTERED only after a long accurate run on one skill', async () => {
    const { user, cookie } = await student('long');
    const id = await newSession(cookie, 48);
    const questions = await questionsOf(cookie, id);

    // Answer everything correctly, skill by skill.
    for (const q of questions) {
      const key = await db.practiceQuestion.findUniqueOrThrow({ where: { id: q.id } });
      await answer(cookie, id, q.id, key.correctIndex);
    }
    const rows = await skillRowsOf(user.id);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.attemptCount).toBe(12);
      expect(row.status).toBe('MASTERED');
      expect(row.accuracy).toBe(1);
    }
    const history = await db.skillMasteryHistory.findMany({ where: { studentId: user.id } });
    expect(history.some((h) => h.newStatus === 'MASTERED')).toBe(true);
  });

  it('counts a retried question once, using the latest answer', async () => {
    const { user, cookie } = await student('retry');
    const first = await newSession(cookie, 12);
    const firstQuestions = await play(cookie, first, 12, () => true); // all wrong
    const bad = await skillRowsOf(user.id);
    expect(bad.every((r) => r.status === 'LEARNING')).toBe(true);
    const wrongAccuracy = bad.map((r) => r.accuracy);
    expect(wrongAccuracy.every((a) => a === 0)).toBe(true);

    // Answer the very same questions again, correctly.
    const second = await newSession(cookie, 12);
    const secondQuestions = await questionsOf(cookie, second);
    const sourceOf = async (id: string) => (await db.practiceQuestion.findUniqueOrThrow({ where: { id } })).quizQuestionId;
    expect(new Set(await Promise.all(secondQuestions.map((q) => sourceOf(q.id))))).toEqual(
      new Set(await Promise.all(firstQuestions.map((q) => sourceOf(q.id)))),
    );
    await play(cookie, second, 12, () => false);

    const after = await skillRowsOf(user.id);
    for (const row of after) {
      expect(row.attemptCount).toBeLessThanOrEqual(12); // not inflated to 24
    }
    expect(Math.min(...after.map((r) => r.accuracy))).toBeGreaterThan(0.7); // the fix counts
  });

  it('is recomputable from scratch and gives the same result', async () => {
    const { user, cookie } = await student('recompute');
    const id = await newSession(cookie, 20);
    await play(cookie, id, 20, (i) => i % 4 === 0);
    const stored = await skillRowsOf(user.id);

    for (const row of stored) {
      const evaluation = await SkillMasteryService.recompute(db, user.id, row.skillId);
      expect(evaluation.level).toBe(row.status);
      expect(evaluation.evidence.overallAccuracy).toBe(row.accuracy);
    }
  });

  it('flags repeated sign errors from the saved mistake categories', async () => {
    const { user, cookie } = await student('sign');
    const id = await newSession(cookie, 12);
    const questions = await questionsOf(cookie, id);
    let flagged = false;
    for (const q of questions) {
      const key = await db.practiceQuestion.findUniqueOrThrow({ where: { id: q.id } });
      // Choose the negated answer (a sign error) whenever the options contain it.
      const answerValue = Number(q.options[key.correctIndex].replace('−', '-'));
      const negated = q.options.findIndex(
        (o, i) => i !== key.correctIndex && Number(o.replace('−', '-')) === -answerValue,
      );
      await answer(cookie, id, q.id, negated >= 0 ? negated : (key.correctIndex + 1) % 4);
    }
    for (const row of await skillRowsOf(user.id)) {
      const flags = (row.details as { flags: { repeatedSignErrors: boolean } }).flags;
      if (flags.repeatedSignErrors) flagged = true;
    }
    expect(flagged).toBe(true);
  });
});

describe('GET /api/mastery', () => {
  it('requires a signed-in student', async () => {
    const response = await getMastery(new Request('http://localhost/api/mastery'));
    expect(response.status).toBe(401);
  });

  it('returns the student’s own skills with plain-language explanations', async () => {
    const { cookie } = await student('api');
    const id = await newSession(cookie, 8);
    await play(cookie, id, 8, () => false);
    const response = await getMastery(new Request('http://localhost/api/mastery', { headers: hdr(cookie) }));
    expect(response.status).toBe(200);
    const { skills } = (await response.json()).data;
    expect(skills).toHaveLength(4);
    for (const skill of skills) {
      expect(skill.skill.name).toMatch(/integers$/);
      expect(skill.explanation.summary.length).toBeGreaterThan(10);
      expect(skill.explanation.nextStep.length).toBeGreaterThan(10);
      expect(skill).not.toHaveProperty('studentId');
    }
  });

  it('never shows another student’s mastery', async () => {
    const a = await student('iso-a');
    const b = await student('iso-b');
    const id = await newSession(a.cookie, 8);
    await play(a.cookie, id, 8, () => false);
    const response = await getMastery(new Request('http://localhost/api/mastery', { headers: hdr(b.cookie) }));
    expect((await response.json()).data.skills).toEqual([]);
  });

  it('has no write route: a client cannot set a level', async () => {
    const { PUT, POST, PATCH, DELETE } = (await import('../src/app/api/mastery/route')) as Record<string, unknown>;
    expect([PUT, POST, PATCH, DELETE].every((handler) => handler === undefined)).toBe(true);
  });

  it('gives a lesson view with every skill, including untouched ones, and a next step', async () => {
    const { cookie } = await student('picture');
    const fresh = await getMastery(
      new Request(`http://localhost/api/mastery?lessonId=${INTEGERS}`, { headers: hdr(cookie) }),
    );
    const before = (await fresh.json()).data;
    expect(before.skills).toHaveLength(4);
    expect(before.skills.every((s: { status: string }) => s.status === 'NOT_STARTED')).toBe(true);
    expect(before.recommendation).toMatchObject({ action: 'START', targetDifficulty: 'EASY' });
    expect(before.recommendation.message.length).toBeGreaterThan(15);

    const id = await newSession(cookie, 8);
    await play(cookie, id, 8, () => true); // all wrong
    const after = (
      await (
        await getMastery(new Request(`http://localhost/api/mastery?lessonId=${INTEGERS}`, { headers: hdr(cookie) }))
      ).json()
    ).data;
    expect(after.skills.every((s: { status: string }) => s.status === 'LEARNING')).toBe(true);
    expect(['PRACTICE_EASIER', 'REMEDIATE']).toContain(after.recommendation.action);
    expect(after.recommendation.skillName).toMatch(/integers$/);
  });

  it('filters by lesson', async () => {
    const { cookie } = await student('filter');
    const id = await newSession(cookie, 8);
    await play(cookie, id, 8, () => false);
    const other = await getMastery(
      new Request('http://localhost/api/mastery?lessonId=demo-lesson-curriculum-foundation', { headers: hdr(cookie) }),
    );
    expect((await other.json()).data.skills).toEqual([]);
    const mine = await getMastery(new Request(`http://localhost/api/mastery?lessonId=${INTEGERS}`, { headers: hdr(cookie) }));
    expect((await mine.json()).data.skills).toHaveLength(4);
  });
});
