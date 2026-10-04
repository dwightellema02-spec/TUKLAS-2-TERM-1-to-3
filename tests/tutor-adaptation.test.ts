/**
 * Baseline evidence for the owner's problem: "my AI keeps sending the same reply".
 *
 * Four turns on ONE open question, driven through the real API route and the real database:
 *   T1 the student proposes a wrong answer      T2 the SAME wrong answer again
 *   T3 "I still don't understand"               T4 the student shows understanding
 *
 * Tests named "(known gap)" use `it.fails`: they state what the tutor SHOULD do and currently do NOT pass.
 * They keep the suite green while recording the defect; when the behaviour is built, vitest turns them red,
 * which is the signal to remove `.fails`. Nothing here is mocked except the network edge of the AI provider.
 */

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
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
  return { row, wrong: options[(row.correctIndex + 1) % 4] };
}

type Turn = { text: string; source: 'AI' | 'AUTOMATIC'; rung: number | null; hintLevel: number; conversationId: string };

/** One student message through the real route. */
async function say(cookie: string, body: Record<string, unknown>): Promise<Turn> {
  const response = await askTutor(
    new Request('http://localhost/api/ai/tutor', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }),
  );
  expect(response.status).toBe(200);
  const data = (await response.json()).data;
  return { text: data.reply.content, source: data.reply.source, rung: data.reply.rung, hintLevel: data.hintLevel, conversationId: data.conversationId };
}

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
    const t1 = await say(cookie, { message: claim, practiceQuestionId: q.row.id });
    const t2 = await say(cookie, { message: claim, practiceQuestionId: q.row.id, conversationId: t1.conversationId });
    const t3 = await say(cookie, { message: "I still don't understand", practiceQuestionId: q.row.id, conversationId: t1.conversationId });
    const t4 = await say(cookie, { message: 'Oh I get it now, the signs decide the result', practiceQuestionId: q.row.id, conversationId: t1.conversationId });
    return { t1, t2, t3, t4, q };
  }

  it('is honest: every reply is labelled automatic and never states the answer to the open question', async () => {
    const { t1, t2, t3, t4, q } = await fourTurns();
    for (const turn of [t1, t2, t3, t4]) expect(turn.source).toBe('AUTOMATIC');
    const correct = (q.row.options as string[])[q.row.correctIndex];
    for (const turn of [t1, t2, t3, t4]) expect(turn.text).not.toContain(`= ${correct}`);
  });

  it('T3 "I still don’t understand" is a real state transition: the rung rises and the strategy changes', async () => {
    const { t1, t2, t3 } = await fourTurns();
    expect(t3.hintLevel).toBeGreaterThan(t2.hintLevel); // the ladder moved up
    expect(t3.text).not.toBe(t1.text);
    expect(t3.text).not.toBe(t2.text);
    expect(t3.text).toMatch(/different way/i); // changeStrategy reached the reply
    const conversation = await db.chatConversation.findUniqueOrThrow({ where: { id: t3.conversationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    expect(conversation.messages.filter((m) => m.role === 'user').map((m) => m.intent)).toEqual(['CHECK_ANSWER', 'CHECK_ANSWER', 'STILL_CONFUSED', 'OTHER']);
  });

  it('(known gap, BROKEN) T2: the same wrong answer twice gets the IDENTICAL reply', async () => {
    // Characterisation of the defect. CHECK_ANSWER keeps the same rung and the fallback is deterministic.
    // When fixed, the right assertion is `expect(t2.text).not.toBe(t1.text)`: flip this test then.
    const { t1, t2 } = await fourTurns();
    expect(t2.text).toBe(t1.text);
    expect(t2.hintLevel).toBe(t1.hintLevel);
  });

  it('(known gap, BROKEN) T4: showing understanding is not recognised, so the tutor keeps adding scaffolding', async () => {
    // There is no "understood" intent: the message is OTHER, which climbs the ladder again.
    // When fixed, the right assertions are `t4.hintLevel === t3.hintLevel` and a forward-moving reply.
    const { t3, t4 } = await fourTurns();
    expect(t4.hintLevel).toBeGreaterThan(t3.hintLevel);
    expect(t4.text).toMatch(/rule to use/i); // it hands over the rule instead of moving on
  });

  it('(known gap) repeated plain hint requests at the top rung must not repeat word for word', async () => {
    const { user, cookie } = await student();
    const q = await openQuestion(user.id);
    let conversationId: string | undefined;
    const texts: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const turn = await say(cookie, { message: 'hint please', practiceQuestionId: q.row.id, ...(conversationId ? { conversationId } : {}) });
      conversationId = turn.conversationId;
      texts.push(turn.text);
    }
    // The ladder stops at rung 6 (worked example), so later replies are the same string.
    expect(new Set(texts).size).toBeLessThan(texts.length); // evidence of the repetition the owner saw
    expect(texts[7]).toBe(texts[8]);
  });
});

describe('four-turn conversation WITH an AI provider (network edge stubbed, nothing else)', () => {
  const calls: { system: string; user: string }[] = [];

  beforeEach(() => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-only-key';
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        calls.push({ system: body.system, user: body.messages[0].content });
        return new Response(JSON.stringify({ content: [{ type: 'text', text: `Think about the signs. (reply ${calls.length})` }] }), {
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
    const t1 = await say(cookie, { message: claim, practiceQuestionId: q.row.id });
    const t2 = await say(cookie, { message: claim, practiceQuestionId: q.row.id, conversationId: t1.conversationId });
    const t3 = await say(cookie, { message: "I still don't understand", practiceQuestionId: q.row.id, conversationId: t1.conversationId });
    return { t1, t2, t3 };
  }

  it('carries the conversation forward: the model sees earlier turns, and a strategy change is instructed on T3', async () => {
    await turns();
    expect(calls).toHaveLength(3);
    expect(calls[0].user).not.toContain('(reply 1)'); // nothing earlier on turn 1
    expect(calls[1].user).toContain('(reply 1)'); // turn 2 sees turn 1's tutor reply
    expect(calls[2].user).toContain('(reply 2)');
    expect(calls[2].system).toMatch(/did not work\. Do NOT repeat it/); // changeStrategy reached the model
    expect(calls[1].system).not.toMatch(/did not work\. Do NOT repeat it/); // and only when the student said so
  });

  it('(known gap, BROKEN) T2: the model is never told the student repeated the same answer', async () => {
    // No code compares a student's attempts, so the prompt cannot say "same attempt as before".
    // When fixed, remove the `not`.
    await turns();
    expect(calls[1].system).not.toMatch(/same (answer|attempt)|already (tried|suggested|said)/i);
    expect(calls[1].system).toBe(calls[0].system.replace(/hint level \d/, 'hint level 1')); // T2's rules equal T1's
  });
});
