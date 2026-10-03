import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as analyzeTranscript } from '../src/app/api/ai/analyze-transcript/route';
import { POST as generateLesson } from '../src/app/api/ai/generate-lesson/route';
import { POST as generateQuestion } from '../src/app/api/ai/generate-question/route';
import { POST as analyzeMistake } from '../src/app/api/ai/analyze-mistake/route';
import { POST as tutor } from '../src/app/api/ai/tutor/route';

process.env.ANTHROPIC_API_KEY = 'test-only-key';

const emailFor = (suffix: string) =>
  `ai-test-${suffix}-${randomUUID()}@example.com`;
const transcript =
  'Today we learn how plants use sunlight, water, and carbon dioxide to make food through photosynthesis.';

const anthropicResponse = (value: unknown, status = 200) =>
  new Response(
    status === 200
      ? JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify(value) }],
        })
      : 'service failure',
    { status, headers: { 'content-type': 'application/json' } },
  );

const analysis = {
  subject: 'Science',
  gradeLevel: '8',
  mainTopic: 'Photosynthesis',
  subtopics: ['Chlorophyll'],
  learningObjectives: ['Explain how plants make food'],
  keyConcepts: ['Light energy'],
  vocabulary: [
    {
      term: 'Photosynthesis',
      definition: 'The process plants use to make food.',
    },
  ],
  examplesFromSource: ['Plants use sunlight.'],
  proceduresOrFormulas: [
    'Sunlight plus water and carbon dioxide produce food.',
  ],
  possibleMisconceptions: ['Plants do not eat food like animals.'],
  estimatedGradeConfidence: 'high',
};

const generatedQuestion = {
  type: 'multiple_choice',
  question: 'What process helps plants make food?',
  options: ['Photosynthesis', 'Digestion', 'Evaporation', 'Condensation'],
  correctIndex: 0,
  explanation: 'Photosynthesis helps plants make food using light energy.',
  skill: 'Recall',
  learningObjective: 'Identify photosynthesis.',
  difficulty: 'Easy',
};

afterEach(async () => {
  vi.restoreAllMocks();
  await db.user.deleteMany({ where: { email: { startsWith: 'ai-test-' } } });
});

async function registeredUser(role: 'STUDENT' | 'TEACHER' = 'STUDENT') {
  const response = await register(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: emailFor(role),
        password: 'StrongPass123!',
        displayName: 'AI Test User',
        role,
        inviteCode: process.env.TEACHER_INVITE_CODE,
      }),
    }),
  );
  return response.headers.get('set-cookie') ?? '';
}

describe('AI API', () => {
  it('analyzes a transcript with validated structured output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(anthropicResponse(analysis)),
    );
    const cookie = await registeredUser();
    const response = await analyzeTranscript(
      new Request('http://localhost/api/ai/analyze-transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ sourceTitle: 'Plants', transcript }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.analysis.mainTopic).toBe(
      'Photosynthesis',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects empty and overlong transcript input before calling AI', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const cookie = await registeredUser();

    const empty = await analyzeTranscript(
      new Request('http://localhost/api/ai/analyze-transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ transcript: '' }),
      }),
    );
    const long = await analyzeTranscript(
      new Request('http://localhost/api/ai/analyze-transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ transcript: 'a'.repeat(100_001) }),
      }),
    );

    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unauthorized lesson generation and validates malformed AI output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(anthropicResponse({ unexpected: true })),
    );
    const studentCookie = await registeredUser();
    const body = JSON.stringify({ transcript, analysis });

    const unauthorized = await generateLesson(
      new Request('http://localhost/api/ai/generate-lesson', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: studentCookie },
        body,
      }),
    );
    expect(unauthorized.status).toBe(403);

    const teacherCookie = await registeredUser('TEACHER');
    const malformed = await generateLesson(
      new Request('http://localhost/api/ai/generate-lesson', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: teacherCookie },
        body,
      }),
    );
    expect(malformed.status).toBe(502);
  });

  it('generates a validated practice question and mistake analysis', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(anthropicResponse(generatedQuestion))
      .mockResolvedValueOnce(
        anthropicResponse({
          understood: 'The student knows the topic is about plants.',
          misunderstood: 'The student confused food-making with digestion.',
          misconception: 'Plants eat prepared food like animals.',
          simpleExplanation:
            'Plants make their own food through photosynthesis.',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const cookie = await registeredUser();
    const student = await db.user.findFirst({
      where: { email: { contains: 'ai-test-' } },
    });
    const practiceSession = await db.practiceSession.create({
      data: {
        studentId: student!.id,
        subject: 'Science',
        topic: 'Photosynthesis',
        difficulty: 'Easy',
        total: 1,
      },
    });

    const question = await generateQuestion(
      new Request('http://localhost/api/ai/generate-question', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          sessionId: practiceSession.id,
          subject: 'Science',
          topic: 'Photosynthesis',
          difficulty: 'Easy',
          questionNumber: 1,
          total: 1,
        }),
      }),
    );
    const mistake = await analyzeMistake(
      new Request('http://localhost/api/ai/analyze-mistake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          question: 'What process helps plants make food?',
          options: generatedQuestion.options,
          correctIndex: 0,
          selectedIndex: 1,
          topic: 'Photosynthesis',
        }),
      }),
    );

    expect(question.status).toBe(200);
    expect((await question.json()).data.question.options).toHaveLength(4);
    expect(mistake.status).toBe(200);
    expect((await mistake.json()).data.analysis.simpleExplanation).toContain(
      'photosynthesis',
    );
  });

  it('handles AI service failures and timeouts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(anthropicResponse(null, 503))
      .mockRejectedValueOnce(new DOMException('Timed out', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    const cookie = await registeredUser();
    const request = () =>
      analyzeTranscript(
        new Request('http://localhost/api/ai/analyze-transcript', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Cookie: cookie },
          body: JSON.stringify({ transcript }),
        }),
      );

    expect((await request()).status).toBe(502);
    expect((await request()).status).toBe(504);
  });

  it('persists tutor messages and returns the assistant reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          anthropicResponse(
            'Try thinking of photosynthesis as a plant kitchen.',
          ),
        ),
    );
    const cookie = await registeredUser();
    const response = await tutor(
      new Request('http://localhost/api/ai/tutor', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          message: 'AI test: explain photosynthesis simply.',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.reply.content).toContain('plant kitchen');
    const messages = await db.chatMessage.findMany({
      where: { content: { contains: 'AI test' } },
    });
    expect(messages).toHaveLength(1);
    expect(payload.data.conversationId).toBeTruthy();
  });

  it('rate limits repeated AI requests for one user', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(anthropicResponse(analysis))),
    );
    const cookie = await registeredUser();
    const makeRequest = () =>
      analyzeTranscript(
        new Request('http://localhost/api/ai/analyze-transcript', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Cookie: cookie },
          body: JSON.stringify({ transcript }),
        }),
      );

    for (let index = 0; index < 10; index += 1)
      expect((await makeRequest()).status).toBe(200);
    expect((await makeRequest()).status).toBe(429);
  });
});
