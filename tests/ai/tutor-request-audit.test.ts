/**
 * PHASE C evidence: exactly what the tutor would send a model, turn by turn.
 *
 * This is NOT a live-model test. The network edge is a recording stub (SIMULATED provider); the request that is
 * recorded is built by the real code from the real database. It proves what a real model WOULD RECEIVE
 * (lesson, history, student answers, constraints). Whether a real model behaves well with it is NOT VERIFIED
 * until `npm run test:live` has been run with a key.
 *
 * Set AUDIT_DUMP=<file> to write the recorded requests to a Markdown file for human review.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/server/auth';
import { POST as askTutor } from '../../src/app/api/ai/tutor/route';

const PREFIX = 'audit-test-';
const INTEGERS = 'lesson-math-7-integers';
const POLYGONS = 'lesson-math-7-polygons';
const ENV = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL'] as const;
const saved: Record<string, string | undefined> = {};

type Recorded = { url: string; model: string; messageCount: number; roles: string[]; system: string; user: string; maxTokens: number };
const requests: Recorded[] = [];
let replyFor: (index: number) => Response = (index) =>
  json({ content: [{ type: 'text', text: `Tutor reply ${index + 1}: think about the number line.` }], usage: { input_tokens: 1200 + index, output_tokens: 40 } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function student() {
  const user = await db.user.create({
    data: { email: `${PREFIX}${randomUUID()}@example.com`, passwordHash: 'x', role: 'STUDENT', displayName: 'Audit' },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role: 'STUDENT' });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

async function ask(cookie: string, body: Record<string, unknown>) {
  const response = await askTutor(
    new Request('http://localhost/api/ai/tutor', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }),
  );
  return { status: response.status, text: await response.text() };
}

beforeEach(() => {
  for (const key of ENV) saved[key] = process.env[key];
  process.env.AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-only-key-never-real';
  process.env.ANTHROPIC_MODEL = 'audit-model';
  requests.length = 0;
  replyFor = (index) =>
    json({ content: [{ type: 'text', text: `Tutor reply ${index + 1}: think about the number line.` }], usage: { input_tokens: 1200 + index, output_tokens: 40 } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      requests.push({
        url,
        model: body.model,
        messageCount: body.messages.length,
        roles: body.messages.map((m: { role: string }) => m.role),
        system: body.system,
        user: body.messages[0].content,
        maxTokens: body.max_tokens,
      });
      return replyFor(requests.length - 1);
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('what a model receives over a four-turn conversation (owner’s Phase C script)', () => {
  async function conversation() {
    const { cookie } = await student();
    const t1 = await ask(cookie, { message: 'I think -3 + 7 = -10.', lessonId: INTEGERS });
    const conversationId = JSON.parse(t1.text).data.conversationId as string;
    for (const message of ["I still don't understand.", 'Should I move left or right?', 'I think right.']) {
      await ask(cookie, { message, lessonId: INTEGERS, conversationId });
    }
    return conversationId;
  }

  it('sends the lesson, the student’s words and the earlier turns on every request; the context is not reset', async () => {
    await conversation();
    expect(requests).toHaveLength(4);

    for (const request of requests) {
      expect(request.url).toBe('https://api.anthropic.com/v1/messages');
      expect(request.model).toBe('audit-model');
      expect(request.system).toContain('Operations on Integers'); // lesson title
      expect(request.system).toContain('Integers are the set of whole numbers'); // lesson content block
      expect(request.system).toMatch(/Vocabulary: .*Absolute Value/); // vocabulary
      expect(request.system).toContain('mathematics tutor for Filipino Grade 7');
      expect(request.system).toMatch(/not to hand over answers/i); // the educational constraint
      expect(request.user.match(/<student_message>/g)).toHaveLength(1);
    }

    // Turn 1 has no history; every later turn carries ALL earlier student messages and tutor replies, in order.
    expect(requests[0].user).not.toContain('Conversation so far');
    expect(requests[1].user).toContain('Student: I think -3 + 7 = -10.');
    expect(requests[1].user).toContain('Tuklas: Tutor reply 1');
    expect(requests[2].user).toContain("Student: I still don't understand.");
    expect(requests[2].user).toContain('Tuklas: Tutor reply 2');
    expect(requests[3].user).toContain('Student: Should I move left or right?');
    expect(requests[3].user).toContain('Tuklas: Tutor reply 3');
    expect(requests[3].user).toContain('Student: I think -3 + 7 = -10.'); // the first answer is still there on turn 4
    expect(requests[3].user.endsWith('<student_message>I think right.</student_message>')).toBe(true);
  });

  it('(architecture fact) history is flattened into ONE user message; there is no multi-turn messages array', async () => {
    await conversation();
    for (const request of requests) {
      expect(request.messageCount).toBe(1);
      expect(request.roles).toEqual(['user']);
    }
    // Tutor replies therefore travel as text inside the user turn ("Tuklas: ..."), not as assistant turns.
    expect(requests[3].user).toMatch(/Tuklas: Tutor reply 1[\s\S]*Tuklas: Tutor reply 2[\s\S]*Tuklas: Tutor reply 3/);
  });

  it('(Phase D) every request carries a teaching plan; later ones say what was already tried', async () => {
    await conversation();
    for (const request of requests) expect(request.system).toContain('TEACHING PLAN');
    expect(requests[0].system).not.toContain('Already used with this student here'); // nothing tried yet
    expect(requests[1].system).toMatch(/Already used with this student here: rule/); // turn 1 explained the rule
    expect(requests[1].system).toMatch(/action CHANGE_EXPLANATION/); // "I still don't understand"
  });

  it('keeps cost and size bounded: max tokens fixed, history capped, no answer key in a general chat', async () => {
    await conversation();
    for (const request of requests) {
      expect(request.maxTokens).toBe(450);
      expect(request.system.length).toBeLessThan(6_000);
      expect(request.user.length).toBeLessThan(4_000);
    }
  });

  it('writes the recorded requests for human review when AUDIT_DUMP is set', async () => {
    await conversation();
    const file = process.env.AUDIT_DUMP;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const blocks = requests.map(
      (r, i) => `## Request ${i + 1}\n\nmodel: ${r.model} | max_tokens: ${r.maxTokens} | messages: ${r.messageCount} (${r.roles.join(',')})\n\n### system\n\n\`\`\`\n${r.system}\n\`\`\`\n\n### user\n\n\`\`\`\n${r.user}\n\`\`\`\n`,
    );
    writeFileSync(
      file,
      `# Phase C: requests the tutor builds (recording stub; NOT a live model)\n\nLesson: Operations on Integers (seeded). Provider URL, key and headers are not recorded.\n\n${blocks.join('\n')}`,
    );
  });
});

describe('lesson objectives and teacher material reach the request', () => {
  it('includes the learning objectives of a Term 1 lesson', async () => {
    const { cookie } = await student();
    await ask(cookie, { message: 'How do I find the angles of a hexagon?', lessonId: POLYGONS });
    expect(requests[0].system).toContain('Polygons and Their Angles');
    expect(requests[0].system).toMatch(/Objectives: .*interior angles/i);
    expect(requests[0].system).toMatch(/\(n − 2\) × 180°/); // the lesson's own rule
  });
});

describe('error paths through the tutor (provider failures never reach the student as errors or secrets)', () => {
  const cases: Array<[string, () => Response | Promise<Response>, string]> = [
    ['rate limited by the provider (429)', () => json({ error: 'slow down' }, 429), 'AI_429'],
    ['provider unavailable (503)', () => json({ error: 'down' }, 503), 'AI_502'],
    ['invalid provider response (no text)', () => json({ content: [] }), 'AI_502'],
    ['invalid provider response (not JSON)', () => new Response('<html>gateway error</html>', { status: 200 }), 'AI_502'],
  ];

  it.each(cases)('%s: the student gets an automatic hint, labelled as such', async (_name, make, reason) => {
    replyFor = () => make() as Response;
    const { user, cookie } = await student();
    const response = await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
    expect(response.status).toBe(200);
    const data = JSON.parse(response.text).data;
    expect(data.reply).toMatchObject({ source: 'AUTOMATIC', label: 'Automatic hint (not AI)' });

    // Nothing sensitive or internal is in what the browser receives.
    for (const forbidden of ['test-only-key-never-real', 'x-api-key', 'DATABASE_URL', 'postgres', 'at Object.', 'node_modules', 'gateway error']) {
      expect(response.text).not.toContain(forbidden);
    }

    const audit = await db.aIInteraction.findFirstOrThrow({ where: { userId: user.id } });
    expect(audit.success).toBe(false);
    expect(audit.metadata).toMatchObject({ source: 'AUTOMATIC', fallbackReason: reason });
    expect(JSON.stringify(audit)).not.toContain('test-only-key-never-real');
  });

  it('a provider call that is aborted by the 20 s timeout becomes a 504 reason and the student still gets help', async () => {
    // The 20-second timer itself is covered in tests/ai-providers.test.ts; here the abort it raises is delivered
    // straight to the tutor (fake timers would also freeze the database driver).
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('aborted', 'AbortError'))));
    const { user, cookie } = await student();
    const response = await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
    expect(JSON.parse(response.text).data.reply).toMatchObject({ source: 'AUTOMATIC', label: 'Automatic hint (not AI)' });
    const audit = await db.aIInteraction.findFirstOrThrow({ where: { userId: user.id } });
    expect(audit.metadata).toMatchObject({ fallbackReason: 'AI_504' });
  });
});

describe('cost and reliability records (Phase K hardening)', () => {
  it('token usage and the model id of every AI call are stored, so cost per student can be measured', async () => {
    const { user, cookie } = await student();
    await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
    const audit = await db.aIInteraction.findFirstOrThrow({ where: { userId: user.id } });
    expect(audit.promptTokens).toBe(1200);
    expect(audit.outputTokens).toBe(40);
    expect(audit.metadata).toMatchObject({ modelId: 'audit-model', source: 'AI' });
  });

  it('a provider outage (5xx) is retried once automatically and the student never notices', async () => {
    replyFor = (index) =>
      index === 0 ? json({ error: 'x' }, 503) : json({ content: [{ type: 'text', text: 'Think about the signs.' }], usage: { input_tokens: 10, output_tokens: 5 } });
    const { cookie } = await student();
    const response = await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
    expect(JSON.parse(response.text).data.reply.source).toBe('AI');
    expect(requests).toHaveLength(2);
  });

  it('a failure that cannot be fixed by trying again (4xx, 429) is NOT retried', async () => {
    for (const status of [400, 401, 429]) {
      requests.length = 0;
      replyFor = () => json({ error: 'x' }, status);
      const { cookie } = await student();
      await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
      expect(requests, `status ${status}`).toHaveLength(1);
    }
  });

  it('still only two attempts in total when the provider stays down, then an honest automatic hint', async () => {
    replyFor = () => json({ error: 'x' }, 503);
    const { cookie } = await student();
    const response = await ask(cookie, { message: 'hint please', lessonId: INTEGERS });
    expect(requests).toHaveLength(2);
    expect(JSON.parse(response.text).data.reply).toMatchObject({ source: 'AUTOMATIC', label: 'Automatic hint (not AI)' });
  });
});
