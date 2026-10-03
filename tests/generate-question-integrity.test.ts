import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as generateQuestion } from '../src/app/api/ai/generate-question/route';

process.env.ANTHROPIC_API_KEY = 'test-only-key';

const PREFIX = 'genq-test-';

const anthropicResponse = (value: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(value) }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const baseQuestion = {
  type: 'multiple_choice',
  question: 'What is 7 − (−3)?',
  options: ['4', '10', '-4', '-10'],
  correctIndex: 1,
  explanation: 'Subtracting a negative is the same as adding its opposite: 7 + 3 = 10.',
  skill: 'Integer subtraction',
  learningObjective: 'Subtract integers.',
  difficulty: 'Easy',
};

let studentCookie = '';
let sessionId = '';
let studentId = '';

async function newSession(total = 3) {
  const session = await db.practiceSession.create({
    data: {
      studentId,
      subject: 'Mathematics',
      topic: 'Integers',
      difficulty: 'Easy',
      total,
    },
  });
  return session.id;
}

function ask(id: string, questionNumber = 1, priorQuestions: string[] = []) {
  return generateQuestion(
    new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({
        sessionId: id,
        subject: 'Mathematics',
        topic: 'Integers',
        difficulty: 'Easy',
        questionNumber,
        total: 3,
        priorQuestions,
      }),
    }),
  );
}

beforeEach(async () => {
  const response = await register(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${PREFIX}${randomUUID()}@example.com`,
        password: 'StrongPass123!',
        displayName: 'GenQ Student',
        role: 'STUDENT',
      }),
    }),
  );
  studentCookie = response.headers.get('set-cookie') ?? '';
  const student = await db.user.findFirstOrThrow({
    where: { email: { startsWith: PREFIX } },
  });
  studentId = student.id;
  sessionId = await newSession();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('POST /api/ai/generate-question integrity', () => {
  it('stores the key server-side but never returns it before the student answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anthropicResponse(baseQuestion)));
    const response = await ask(sessionId);
    expect(response.status).toBe(200);

    const payload = await response.json();
    const returned = payload.data.question;
    expect(returned.options).toHaveLength(4);
    expect(returned).not.toHaveProperty('correctIndex');
    expect(returned).not.toHaveProperty('explanation');
    expect(returned).not.toHaveProperty('correctAnswer');
    expect(JSON.stringify(payload)).not.toContain('Subtracting a negative');

    const stored = await db.practiceQuestion.findUniqueOrThrow({ where: { id: returned.id } });
    expect(stored.correctIndex).toBe(1);
    expect(stored.explanation).toContain('Subtracting a negative');
  });

  it('rejects and does not store a question whose marked answer is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(anthropicResponse({ ...baseQuestion, correctIndex: 0 })),
    );
    const response = await ask(sessionId);
    expect(response.status).toBe(502);
    expect(await db.practiceQuestion.count({ where: { sessionId } })).toBe(0);
  });

  it('rejects a question with duplicate options', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        anthropicResponse({ ...baseQuestion, options: ['10', '10', '-4', '-10'], correctIndex: 0 }),
      ),
    );
    expect((await ask(sessionId)).status).toBe(502);
    expect(await db.practiceQuestion.count({ where: { sessionId } })).toBe(0);
  });

  it('rejects a repeat of a question already in the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anthropicResponse(baseQuestion)));
    expect((await ask(sessionId, 1)).status).toBe(200);
    expect((await ask(sessionId, 2)).status).toBe(502);
    expect(await db.practiceQuestion.count({ where: { sessionId } })).toBe(1);
  });

  it('rejects a repeat of a client-supplied prior question', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anthropicResponse(baseQuestion)));
    const response = await ask(sessionId, 2, ['what is 7 - (-3)?']);
    expect(response.status).toBe(502);
  });

  it('rejects a question that states its own answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        anthropicResponse({ ...baseQuestion, question: 'The answer is 10. What is 7 − (−3)?' }),
      ),
    );
    expect((await ask(sessionId)).status).toBe(502);
  });

  it('still accepts a valid non-arithmetic question', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        anthropicResponse({
          ...baseQuestion,
          question: 'Which number is the opposite of 5?',
          options: ['-5', '5', '0', '1/5'],
          correctIndex: 0,
        }),
      ),
    );
    expect((await ask(sessionId)).status).toBe(200);
  });
});
