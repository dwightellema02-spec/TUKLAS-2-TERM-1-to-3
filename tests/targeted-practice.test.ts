import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { PracticeService } from '../src/services/practice.service';
import { POST as startSession } from '../src/app/api/practice/sessions/route';
import { POST as askTutor } from '../src/app/api/ai/tutor/route';

const PREFIX = 'targeted-test-';
const INTEGERS = 'lesson-math-7-integers';

async function student() {
  const user = await db.user.create({
    data: { email: `${PREFIX}${randomUUID()}@example.com`, passwordHash: 'x', role: 'STUDENT', displayName: 'Targeted' },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role: 'STUDENT' });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const post = (url: string, cookie: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });

beforeEach(() => {
  process.env.AI_PROVIDER = 'anthropic';
  delete process.env.ANTHROPIC_API_KEY; // the rule-based tutor: deterministic
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('targeted practice: a session made only of one skill', () => {
  it('serves only questions that practise the chosen skill', async () => {
    const { user } = await student();
    const skill = await db.skill.findUniqueOrThrow({ where: { code: 'G7-INT-SUB' } });
    const session = await PracticeService.startLessonBankSession(user.id, { lessonId: INTEGERS, skillId: skill.id, total: 6 });
    const copies = await db.practiceQuestion.findMany({ where: { sessionId: session.id } });
    expect(copies).toHaveLength(6);
    expect(copies.every((copy) => copy.skillId === skill.id)).toBe(true);
    expect(new Set(copies.map((copy) => copy.skill))).toEqual(new Set(['Subtracting integers']));
  });

  it('through the API: a skill that is not in the lesson is refused with a clear reason', async () => {
    const { user, cookie } = await student();
    const other = await db.skill.findUniqueOrThrow({ where: { code: 'G7-POLY-SUM' } });
    const response = await startSession(post('/api/practice/sessions', cookie, { source: 'LESSON_BANK', lessonId: INTEGERS, skillId: other.id, total: 6 }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/no practice questions for that skill/i);
    expect(await db.practiceSession.count({ where: { studentId: user.id } })).toBe(0);

    const ok = await startSession(post('/api/practice/sessions', cookie, { source: 'LESSON_BANK', lessonId: INTEGERS, skillId: (await db.skill.findUniqueOrThrow({ where: { code: 'G7-INT-ADD' } })).id, total: 5 }));
    expect(ok.status).toBe(201);
  });

  it('answers in a targeted session update the mastery of that skill (the loop closes)', async () => {
    const { user } = await student();
    const skill = await db.skill.findUniqueOrThrow({ where: { code: 'G7-INT-MUL' } });
    const session = await PracticeService.startLessonBankSession(user.id, { lessonId: INTEGERS, skillId: skill.id, total: 4 });
    const rows = await db.practiceQuestion.findMany({ where: { sessionId: session.id } });
    for (const [index, row] of rows.entries()) {
      await PracticeService.submitAnswer(user.id, session.id, row.id, index % 2 === 0 ? row.correctIndex : (row.correctIndex + 1) % 4);
    }
    const mastery = await db.skillMastery.findUniqueOrThrow({ where: { studentId_skillId: { studentId: user.id, skillId: skill.id } } });
    expect(mastery.attemptCount).toBe(4);
    expect(mastery.accuracy).toBeCloseTo(0.5);
  });
});

describe('the tutor offers targeted practice at the right moment', () => {
  async function openQuestion(studentId: string) {
    const session = await PracticeService.startLessonBankSession(studentId, { lessonId: INTEGERS, total: 4 });
    return db.practiceQuestion.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { position: 'asc' } });
  }
  const ask = async (cookie: string, body: Record<string, unknown>) => (await (await askTutor(post('/api/ai/tutor', cookie, body))).json()).data;

  it('after three "I still don’t get it", the reply carries the lesson and the skill of THAT question', async () => {
    const { user, cookie } = await student();
    const row = await openQuestion(user.id);
    const first = await ask(cookie, { message: "I still don't get it", practiceQuestionId: row.id });
    expect(first.reply.practice).toBeNull(); // nothing to practise yet
    await ask(cookie, { message: "I still don't understand", practiceQuestionId: row.id, conversationId: first.conversationId });
    const third = await ask(cookie, { message: "I'm still confused", practiceQuestionId: row.id, conversationId: first.conversationId });
    expect(third.reply.action).toBe('RECOMMEND_PRACTICE');
    expect(third.reply.practice).toEqual({ lessonId: INTEGERS, skillId: row.skillId, skillName: row.skill });
    expect(third.reply.nextStep).toContain(row.skill);
  });

  it('in a lesson chat with no question, it picks this student’s weakest skill', async () => {
    const { user, cookie } = await student();
    const skills = await db.skill.findMany({ where: { code: { in: ['G7-INT-ADD', 'G7-INT-SUB'] } } });
    const [strong, weak] = [skills.find((s) => s.code === 'G7-INT-ADD')!, skills.find((s) => s.code === 'G7-INT-SUB')!];
    const base = { ruleCode: 'T', attemptCount: 10, accuracy: 0.9, recentAccuracy: 0.9, consistency: 0.9, details: {}, masteryVersion: 'test' };
    await db.skillMastery.create({ data: { studentId: user.id, skillId: strong.id, status: 'PROFICIENT', ...base } });
    await db.skillMastery.create({ data: { studentId: user.id, skillId: weak.id, status: 'LEARNING', ...base } });

    const reply = (await ask(cookie, { message: "I still don't get it", lessonId: INTEGERS })).reply;
    expect(reply.practice).toBeNull(); // first confusion: explain differently, do not send them away yet

    let conversationId: string | undefined;
    let last;
    for (const message of ["I still don't get it", "I'm still confused", "I still don't understand this"]) {
      last = await ask(cookie, { message, lessonId: INTEGERS, ...(conversationId ? { conversationId } : {}) });
      conversationId = last.conversationId;
    }
    expect(last.reply.action).toBe('RECOMMEND_PRACTICE');
    expect(last.reply.practice.skillId).toBe(weak.id); // the weakest, not the strongest
  });

  it('a proficient student who says they understand is offered HARDER practice on the skill', async () => {
    const { user, cookie } = await student();
    const row = await openQuestion(user.id);
    await db.skillMastery.create({
      data: { studentId: user.id, skillId: row.skillId!, status: 'PROFICIENT', ruleCode: 'T', attemptCount: 12, accuracy: 0.92, recentAccuracy: 0.95, consistency: 0.9, details: {}, masteryVersion: 'test' },
    });
    const reply = (await ask(cookie, { message: 'ah okay I get it now', practiceQuestionId: row.id })).reply;
    expect(reply.action).toBe('INCREASE_DIFFICULTY');
    expect(reply.practice?.skillId).toBe(row.skillId);
    expect(reply.nextStep).toMatch(/harder/i);
  });

  it('ordinary hints never send the student away', async () => {
    const { user, cookie } = await student();
    const row = await openQuestion(user.id);
    expect((await ask(cookie, { message: 'hint please', practiceQuestionId: row.id })).reply.practice).toBeNull();
  });
});
