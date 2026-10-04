/**
 * The owner's problem: "my AI keeps sending the same reply". Phase D specification, driven through the real API
 * route and the real database. In Phase C these tests PINNED the defects; they now state the required behaviour.
 *
 * Four turns on ONE open question:
 *   T1 the student proposes a wrong answer      T2 the SAME wrong answer again
 *   T3 "I still don't understand"               T4 the student shows understanding
 * then repeated confusion (prerequisite review, targeted-practice recommendation) and a model that repeats itself.
 *
 * Only the network edge of the AI provider is stubbed. State transitions are asserted on the stored conversation
 * state, the stored action/strategy of each reply and the rung, not just on strings.
 */

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { statesAnswer } from '../src/server/tutor/guard';
import { PracticeService } from '../src/services/practice.service';
import { POST as askTutor } from '../src/app/api/ai/tutor/route';

const PREFIX = 'adapt-test-';
const INTEGERS = 'lesson-math-7-integers';
const ENV = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL'] as const;
const saved: Record<string, string | undefined> = {};

async function student() {
  const user = await db.user.create({
    data: { email: `${PREFIX}${randomUUID()}@example.com`, passwordHash: 'x', role: 'STUDENT', displayName: 'Adapt Test' },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role: 'STUDENT' });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

async function openQuestion(studentId: string) {
  const session = await PracticeService.startLessonBankSession(studentId, { lessonId: INTEGERS, total: 4 });
  const row = await db.practiceQuestion.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { position: 'asc' } });
  const options = row.options as string[];
  return { row, wrong: options[(row.correctIndex + 1) % 4], correct: options[row.correctIndex] };
}

type Turn = {
  text: string;
  source: 'AI' | 'AUTOMATIC';
  rung: number | null;
  hintLevel: number;
  conversationId: string;
  action: string;
  nextStep: string | null;
};

async function say(cookie: string, body: Record<string, unknown>): Promise<Turn> {
  const response = await askTutor(
    new Request('http://localhost/api/ai/tutor', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }),
  );
  expect(response.status).toBe(200);
  const data = (await response.json()).data;
  return {
    text: data.reply.content,
    source: data.reply.source,
    rung: data.reply.rung,
    hintLevel: data.hintLevel,
    conversationId: data.conversationId,
    action: data.reply.action,
    nextStep: data.reply.nextStep,
  };
}

const stored = (conversationId: string) =>
  db.chatConversation.findUniqueOrThrow({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('four-turn conversation with NO AI (the rule-based fallback)', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
  });

  async function fourTurns() {
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    const claim = `I think it's ${q.wrong}`;
    const base = { practiceQuestionId: q.row.id };
    const t1 = await say(cookie, { message: claim, ...base });
    const t2 = await say(cookie, { message: claim, ...base, conversationId: t1.conversationId });
    const t3 = await say(cookie, { message: "I still don't understand", ...base, conversationId: t1.conversationId });
    const t4 = await say(cookie, { message: 'Oh I get it now, the signs decide the result', ...base, conversationId: t1.conversationId });
    return { t1, t2, t3, t4, q, cookie, base };
  }

  it('is honest: every reply is labelled automatic and never states the answer or gives a verdict', async () => {
    const { t1, t2, t3, t4, q } = await fourTurns();
    for (const turn of [t1, t2, t3, t4]) {
      expect(turn.source).toBe('AUTOMATIC');
      expect(statesAnswer(turn.text, q.correct, q.row.question)).toBe(false);
      expect(turn.text).not.toMatch(/that'?s (correct|wrong|right|incorrect)|well done/i);
    }
  });

  it('T2: the same wrong answer twice is recognised and gets a DIFFERENT strategy, not the same reply', async () => {
    const { t1, t2, q } = await fourTurns();
    expect(t2.text).not.toBe(t1.text);
    expect(t2.text).toContain(`You have suggested ${q.wrong.replace('-', '−')} 2 times`); // it knows it is a repeat
    const conversation = await stored(t1.conversationId);
    const assistants = conversation.messages.filter((m) => m.role === 'assistant');
    expect(assistants[0].action).toBe('GIVE_HINT'); // T1: first time, a nudge
    expect(assistants[1].action).toBe('REVIEW_MISTAKE'); // T2: review the working, not the result
    expect(assistants[1].strategy).toBe('STEP_BY_STEP');
    expect(assistants[1].strategy).not.toBe(assistants[0].strategy);
  });

  it('T3 "I still don’t understand" changes strategy again (a strategy not yet used) and climbs the ladder', async () => {
    const { t2, t3, t1 } = await fourTurns();
    expect(t3.hintLevel).toBeGreaterThan(t2.hintLevel);
    expect(t3.text).toMatch(/different way/i);
    expect(t3.text).not.toBe(t1.text);
    expect(t3.text).not.toBe(t2.text);
    const assistants = (await stored(t1.conversationId)).messages.filter((m) => m.role === 'assistant');
    expect(assistants[2].action).toBe('CHANGE_EXPLANATION');
    const strategies = assistants.slice(0, 3).map((m) => m.strategy);
    expect(new Set(strategies).size).toBe(3); // three turns, three different strategies
  });

  it('T4: showing understanding moves FORWARD: no more scaffolding, the student is asked to apply it', async () => {
    const { t3, t4, t1 } = await fourTurns();
    expect(t4.hintLevel).toBe(t3.hintLevel); // the ladder does not climb for a student who says they understand
    expect(t4.action).toBe('ASK_STUDENT_TO_TRY');
    expect(t4.text).toMatch(/no more hints are needed|Submit/i);
    expect(t4.nextStep).toMatch(/submit/i);
    expect(t4.text).not.toBe(t3.text);
    const conversation = await stored(t1.conversationId);
    expect(conversation.messages.filter((m) => m.role === 'user').map((m) => m.intent)).toEqual(['CHECK_ANSWER', 'CHECK_ANSWER', 'STILL_CONFUSED', 'UNDERSTOOD']);
  });

  it('stores only safe educational state on the conversation (counts and strategy names, no free text)', async () => {
    const { t1, q } = await fourTurns();
    const conversation = await stored(t1.conversationId);
    expect(conversation.state).toMatchObject({
      v: 1,
      turn: 4,
      sameAttemptCount: 1,
      confusedCount: 0, // reset by "I get it"
      understanding: 'UNDERSTANDS',
      lastAction: 'ASK_STUDENT_TO_TRY',
    });
    const state = conversation.state as { attempts: string[]; strategiesUsed: string[] };
    expect(state.attempts).toEqual([q.wrong.replace('−', '-'), q.wrong.replace('−', '-')]); // a normalized number, nothing else
    expect(state.strategiesUsed.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(conversation.state)).not.toMatch(/I think|signs decide|get it now/i); // none of the student's words
  });

  it('keeps being confused: second time reviews the prerequisite, third time recommends targeted practice', async () => {
    const { cookie, base, t1 } = await fourTurns();
    const t5 = await say(cookie, { message: "I still don't get it", ...base, conversationId: t1.conversationId });
    const t6 = await say(cookie, { message: "I'm still confused", ...base, conversationId: t1.conversationId });
    const t7 = await say(cookie, { message: "I still don't understand this", ...base, conversationId: t1.conversationId });
    // confusedCount was reset to 0 by T4 ("I get it"), so these are the 1st, 2nd and 3rd confusion since then.
    expect(t5.action).toBe('CHANGE_EXPLANATION');
    expect(t6.action).toBe('REVIEW_PREREQUISITE');
    expect(t6.text).toMatch(/go back one step|go back to/i);
    expect(t6.nextStep).toMatch(/review the idea/i);
    expect(t7.action).toBe('RECOMMEND_PRACTICE');
    expect(t7.text).toMatch(/Practice this lesson/);
    expect(t7.nextStep).toMatch(/practise/i);
    expect(new Set([t5.text, t6.text, t7.text]).size).toBe(3);
  });

  it('plain hint requests never repeat the previous reply word for word, even after the ladder is capped', async () => {
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    let conversationId: string | undefined;
    const texts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const turn = await say(cookie, { message: 'hint please', practiceQuestionId: q.row.id, ...(conversationId ? { conversationId } : {}) });
      conversationId = turn.conversationId;
      texts.push(turn.text);
      expect(statesAnswer(turn.text, q.correct, q.row.question)).toBe(false);
    }
    for (let i = 1; i < texts.length; i += 1) expect(texts[i], `reply ${i + 1} repeats reply ${i}`).not.toBe(texts[i - 1]);
    expect(new Set(texts).size).toBeGreaterThanOrEqual(6);
  });

  it('after the answer is submitted, "I get it" leads to a check of understanding, not another full explanation', async () => {
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    const session = await db.practiceQuestion.findUniqueOrThrow({ where: { id: q.row.id }, select: { sessionId: true, correctIndex: true } });
    await PracticeService.submitAnswer(user.id, session.sessionId, q.row.id, (session.correctIndex + 1) % 4);
    const explained = await say(cookie, { message: 'why was I wrong?', practiceQuestionId: q.row.id });
    expect(explained.action).toBe('EXPLAIN_AFTER_ANSWER');
    const understood = await say(cookie, { message: 'ah okay I get it now', practiceQuestionId: q.row.id, conversationId: explained.conversationId });
    expect(understood.action).toBe('CHECK_UNDERSTANDING');
    expect(understood.text).not.toBe(explained.text);
  });
});

describe('four-turn conversation WITH an AI provider (network edge stubbed, nothing else)', () => {
  const calls: { system: string; user: string }[] = [];
  let reply: (index: number) => string = (index) => `Think about the signs. (reply ${index + 1})`;

  beforeEach(() => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-only-key';
    calls.length = 0;
    reply = (index) => `Think about the signs. (reply ${index + 1})`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        calls.push({ system: body.system, user: body.messages[0].content });
        return new Response(JSON.stringify({ content: [{ type: 'text', text: reply(calls.length - 1) }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  async function turns() {
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    const claim = `I think it's ${q.wrong}`;
    const base = { practiceQuestionId: q.row.id };
    const t1 = await say(cookie, { message: claim, ...base });
    const t2 = await say(cookie, { message: claim, ...base, conversationId: t1.conversationId });
    const t3 = await say(cookie, { message: "I still don't understand", ...base, conversationId: t1.conversationId });
    return { t1, t2, t3, q };
  }

  it('carries the conversation forward and tells the model the teaching plan on every turn', async () => {
    await turns();
    expect(calls).toHaveLength(3);
    expect(calls[1].user).toContain('(reply 1)'); // earlier turns
    expect(calls[2].user).toContain('(reply 2)');
    for (const call of calls) expect(call.system).toContain('TEACHING PLAN');
  });

  it('T2: the model IS told the student repeated the same answer, and what was already tried', async () => {
    const { q } = await turns();
    expect(calls[0].system).not.toMatch(/same answer/i); // first time: nothing to say
    expect(calls[1].system).toMatch(new RegExp(`proposed the same answer \\(${q.wrong.replace('−', '-')}\\) 2 times in a row`));
    expect(calls[1].system).toMatch(/Do not repeat your last reply/);
    expect(calls[1].system).toMatch(/Already used with this student here: nudge/);
    expect(calls[1].system).toMatch(/action REVIEW_MISTAKE/);
    expect(calls[1].system).not.toMatch(/correct answer|official explanation/i);
  });

  it('T3: a different strategy is instructed, one the student has not had yet', async () => {
    await turns();
    expect(calls[2].system).toMatch(/action CHANGE_EXPLANATION/);
    expect(calls[2].system).toMatch(/number line or a picture/);
    expect(calls[2].system).toMatch(/Already used with this student here: nudge, step by step/);
    expect(calls[2].system).toMatch(/did not work\. Do NOT repeat it/);
  });

  it('a model that repeats itself is not shown: the planned strategy replaces the repeated reply', async () => {
    reply = () => 'Look at the signs of both numbers and decide whether the result is positive or negative.'; // identical every time
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    const base = { practiceQuestionId: q.row.id };
    const first = await say(cookie, { message: 'hint please', ...base });
    const second = await say(cookie, { message: 'another hint', ...base, conversationId: first.conversationId });
    expect(first.source).toBe('AI');
    expect(second.source).toBe('AUTOMATIC'); // identical to the previous reply: refused
    expect(second.text).not.toBe(first.text);
    const audit = await db.aIInteraction.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(audit.metadata).toMatchObject({ fallbackReason: 'GUARD_REPEATED', source: 'AUTOMATIC' });
  });
});
