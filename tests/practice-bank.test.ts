import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { GET as listSessions, POST as startSession } from '../src/app/api/practice/sessions/route';
import { GET as getSession } from '../src/app/api/practice/sessions/[id]/route';
import { POST as submitAnswer } from '../src/app/api/practice/sessions/[id]/answers/route';
import { GET as listMistakes } from '../src/app/api/mistakes/route';

const PREFIX = 'bank-test-';
const INTEGERS = 'lesson-math-7-integers';
const KEY_FIELDS = ['correctIndex', 'correctAnswer', 'explanation'];

async function actor(role: 'STUDENT' | 'TEACHER', tag: string) {
  const user = await db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: 'test-only-hash',
      role,
      displayName: `${role} ${tag}`,
    },
  });
  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role,
  });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const headers = (cookie: string) => ({
  'content-type': 'application/json',
  ...(cookie ? { Cookie: cookie } : {}),
});

function start(cookie: string, body: Record<string, unknown>) {
  return startSession(
    new Request('http://localhost/api/practice/sessions', {
      method: 'POST',
      headers: headers(cookie),
      body: JSON.stringify(body),
    }),
  );
}

const bankSession = (cookie: string, total?: number, lessonId = INTEGERS) =>
  start(cookie, { source: 'LESSON_BANK', lessonId, ...(total === undefined ? {} : { total }) });

function view(cookie: string, id: string) {
  return getSession(
    new Request(`http://localhost/api/practice/sessions/${id}`, { headers: headers(cookie) }),
    { params: Promise.resolve({ id }) },
  );
}

function answer(cookie: string, sessionId: string, questionId: string, selectedIndex: number) {
  return submitAnswer(
    new Request(`http://localhost/api/practice/sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: headers(cookie),
      body: JSON.stringify({ questionId, selectedIndex }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

async function loadView(cookie: string, id: string) {
  const response = await view(cookie, id);
  expect(response.status).toBe(200);
  return (await response.json()).data.session as {
    id: string;
    total: number;
    correct: number;
    answeredCount: number;
    completedAt: string | null;
    questions: Array<{
      id: string;
      position: number;
      question: string;
      options: string[];
      answered: null | { selectedIndex: number; correct: boolean; correctIndex: number; explanation: string };
    }>;
  };
}

/** The database's own answer key for a session question (what the server will grade against). */
async function keyOf(questionId: string) {
  return db.practiceQuestion.findUniqueOrThrow({ where: { id: questionId } });
}

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await db.lesson.deleteMany({ where: { authorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('starting a lesson-bank practice session (no AI needed)', () => {
  it('copies questions from the lesson practice bank, never from the assessment', async () => {
    const { cookie } = await actor('STUDENT', 'copy');
    const response = await bankSession(cookie, 5);
    expect(response.status).toBe(201);
    const session = (await response.json()).data.session;
    expect(session.total).toBe(5);
    expect(session.lessonId).toBe(INTEGERS);

    const copies = await db.practiceQuestion.findMany({
      where: { sessionId: session.id },
      orderBy: { position: 'asc' },
      include: { quizQuestion: true },
    });
    expect(copies).toHaveLength(5);
    expect(copies.map((copy) => copy.position)).toEqual([0, 1, 2, 3, 4]);
    for (const copy of copies) {
      expect(copy.quizQuestion).not.toBeNull();
      expect(copy.quizQuestion!.assessmentId).toBeNull(); // practice bank only
      expect(copy.correctIndex).toBe(copy.quizQuestion!.correctIndex);
      expect(copy.question).toBe(copy.quizQuestion!.question);
    }
  });

  it('uses the whole bank when asked for more questions than exist, and defaults to 10', async () => {
    const { cookie } = await actor('STUDENT', 'size');
    const bankSize = await db.quizQuestion.count({ where: { lessonId: INTEGERS, assessmentId: null } });
    expect(bankSize).toBeGreaterThanOrEqual(18);

    const all = (await (await bankSession(cookie, 50)).json()).data.session;
    expect(all.total).toBe(bankSize);
    const dflt = (await (await bankSession(cookie)).json()).data.session;
    expect(dflt.total).toBe(10);
  });

  it('does not reveal the answer key before a question is answered', async () => {
    const { cookie } = await actor('STUDENT', 'hidden');
    const id = (await (await bankSession(cookie, 4)).json()).data.session.id;
    const response = await view(cookie, id);
    const raw = await response.text();
    for (const field of KEY_FIELDS) expect(raw).not.toContain(`"${field}"`);

    const loaded = JSON.parse(raw).data.session;
    expect(loaded.questions).toHaveLength(4);
    expect(loaded.questions.every((q: { answered: unknown }) => q.answered === null)).toBe(true);
    expect(loaded.questions.map((q: { position: number }) => q.position)).toEqual([0, 1, 2, 3]);
    // The explanation text from the database must not appear anywhere either.
    const first = await keyOf(loaded.questions[0].id);
    expect(raw).not.toContain(first.explanation!);
  });

  it('records a mistake for a wrong answer, reveals only that answer, and not for a right one', async () => {
    const { user, cookie } = await actor('STUDENT', 'mistake');
    const id = (await (await bankSession(cookie, 3)).json()).data.session.id;
    const [q1, q2, q3] = (await loadView(cookie, id)).questions;
    const key1 = await keyOf(q1.id);
    const wrongIndex = (key1.correctIndex + 1) % 4;

    const wrong = await answer(cookie, id, q1.id, wrongIndex);
    expect(wrong.status).toBe(200);
    expect((await wrong.json()).data.answer.correct).toBe(false);

    const right = await answer(cookie, id, q2.id, (await keyOf(q2.id)).correctIndex);
    expect((await right.json()).data.answer.correct).toBe(true);

    const mistakes = await db.mistakeRecord.findMany({ where: { studentId: user.id } });
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toMatchObject({
      lessonId: INTEGERS,
      questionId: q1.id,
      practiceSessionId: id,
      submittedAnswer: q1.options[wrongIndex],
      correctReference: q1.options[key1.correctIndex],
      resolved: false,
    });

    // After answering, only the answered questions expose their key; q3 stays hidden.
    const after = await loadView(cookie, id);
    expect(after.questions[0].answered).toMatchObject({
      correct: false,
      correctIndex: key1.correctIndex,
      selectedIndex: wrongIndex,
    });
    expect(after.questions[1].answered?.correct).toBe(true);
    expect(after.questions[2].answered).toBeNull();
    expect(after.answeredCount).toBe(2);
    expect(after.correct).toBe(1);
    expect(q3.id).toBe(after.questions[2].id);
  });

  it('completes the session after the last answer and then refuses more', async () => {
    const { cookie } = await actor('STUDENT', 'finish');
    const id = (await (await bankSession(cookie, 2)).json()).data.session.id;
    const { questions } = await loadView(cookie, id);
    for (const question of questions) {
      expect((await answer(cookie, id, question.id, (await keyOf(question.id)).correctIndex)).status).toBe(200);
    }
    const done = await loadView(cookie, id);
    expect(done.completedAt).not.toBeNull();
    expect(done.correct).toBe(2);
    expect((await answer(cookie, id, questions[0].id, 0)).status).toBe(409);
  });

  it('brings back previously missed questions first and skips ones already answered correctly', async () => {
    const { cookie } = await actor('STUDENT', 'adaptive');
    const firstId = (await (await bankSession(cookie, 3)).json()).data.session.id;
    const first = (await loadView(cookie, firstId)).questions;
    const sources = await Promise.all(first.map(async (q) => (await keyOf(q.id)).quizQuestionId));

    // miss the first question, get the other two right
    await answer(cookie, firstId, first[0].id, ((await keyOf(first[0].id)).correctIndex + 1) % 4);
    await answer(cookie, firstId, first[1].id, (await keyOf(first[1].id)).correctIndex);
    await answer(cookie, firstId, first[2].id, (await keyOf(first[2].id)).correctIndex);

    const secondId = (await (await bankSession(cookie, 3)).json()).data.session.id;
    const second = (await loadView(cookie, secondId)).questions;
    const secondSources = await Promise.all(second.map(async (q) => (await keyOf(q.id)).quizQuestionId));

    expect(secondSources[0]).toBe(sources[0]); // the missed item comes back first
    expect(secondSources).not.toContain(sources[1]); // already-correct items are skipped
    expect(secondSources).not.toContain(sources[2]);
    expect(new Set(secondSources).size).toBe(3);
  });

  it('serves the mistake in the mistakes list so the student can review it', async () => {
    const { cookie } = await actor('STUDENT', 'review');
    const id = (await (await bankSession(cookie, 1)).json()).data.session.id;
    const [q] = (await loadView(cookie, id)).questions;
    await answer(cookie, id, q.id, ((await keyOf(q.id)).correctIndex + 1) % 4);

    const response = await listMistakes(
      new Request('http://localhost/api/mistakes?resolved=false', { headers: headers(cookie) }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    const { mistakes } = (await response.json()).data;
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].lesson.title).toBeTruthy();
    expect(mistakes[0].analysis).toBeTruthy(); // the explanation, so the student can learn why
  });
});

describe('practice session access control and edge cases', () => {
  it('requires authentication and the student role', async () => {
    expect((await bankSession('', 3)).status).toBe(401);
    const teacher = await actor('TEACHER', 'teacher');
    expect((await bankSession(teacher.cookie, 3)).status).toBe(403);
    const id = (await (await bankSession((await actor('STUDENT', 'owner')).cookie, 2)).json()).data.session.id;
    expect((await view('', id)).status).toBe(401);
    expect((await view(teacher.cookie, id)).status).toBe(403);
    expect(
      (await listSessions(new Request('http://localhost/api/practice/sessions', { headers: headers(teacher.cookie) })))
        .status,
    ).toBe(403);
  });

  it('does not let another student see or answer a session', async () => {
    const owner = await actor('STUDENT', 'owner2');
    const snoop = await actor('STUDENT', 'snoop');
    const id = (await (await bankSession(owner.cookie, 2)).json()).data.session.id;
    const [q] = (await loadView(owner.cookie, id)).questions;
    expect((await view(snoop.cookie, id)).status).toBe(404);
    expect((await answer(snoop.cookie, id, q.id, 0)).status).toBe(403);
  });

  it('lists only the caller’s own recent sessions', async () => {
    const mine = await actor('STUDENT', 'mine');
    const theirs = await actor('STUDENT', 'theirs');
    await bankSession(mine.cookie, 2);
    await bankSession(theirs.cookie, 2);
    const response = await listSessions(
      new Request('http://localhost/api/practice/sessions', { headers: headers(mine.cookie) }),
    );
    const { sessions } = (await response.json()).data;
    expect(sessions).toHaveLength(1);
  });

  it('404s for an unpublished lesson and 409s for a lesson with no practice bank', async () => {
    const teacher = await actor('TEACHER', 'author');
    const draft = await db.lesson.create({
      data: {
        authorId: teacher.user.id,
        title: 'Bank Draft',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'DRAFT',
        quizQuestions: {
          create: [{ position: 0, question: 'q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e' }],
        },
      },
    });
    const empty = await db.lesson.create({
      data: {
        authorId: teacher.user.id,
        title: 'Bank Empty',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'PUBLISHED',
      },
    });
    const { cookie } = await actor('STUDENT', 'edge');
    expect((await bankSession(cookie, 3, draft.id)).status).toBe(404);
    const noBank = await bankSession(cookie, 3, empty.id);
    expect(noBank.status).toBe(409);
    expect((await noBank.json()).error).toMatch(/no practice questions/i);
    expect((await bankSession(cookie, 3, 'does-not-exist')).status).toBe(404);
  });

  it('excludes questions that belong to an assessment from a lesson’s bank', async () => {
    const teacher = await actor('TEACHER', 'assess');
    const lesson = await db.lesson.create({
      data: {
        authorId: teacher.user.id,
        title: 'Bank Mixed',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'PUBLISHED',
        assessments: { create: { title: 'Quiz', passingScore: 70, status: 'PUBLISHED' } },
      },
      include: { assessments: true },
    });
    await db.quizQuestion.createMany({
      data: [
        {
          lessonId: lesson.id,
          assessmentId: lesson.assessments[0].id,
          position: 0,
          question: 'ASSESSMENT ONLY',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 0,
          explanation: 'e',
        },
        {
          lessonId: lesson.id,
          assessmentId: null,
          position: 1,
          question: 'PRACTICE ITEM',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 1,
          explanation: 'e',
        },
      ],
    });
    const { cookie } = await actor('STUDENT', 'mixed');
    const id = (await (await bankSession(cookie, 10, lesson.id)).json()).data.session.id;
    const { questions } = await loadView(cookie, id);
    expect(questions.map((q) => q.question)).toEqual(['PRACTICE ITEM']);
  });

  it('rejects malformed requests', async () => {
    const { cookie } = await actor('STUDENT', 'bad');
    expect((await start(cookie, { source: 'LESSON_BANK' })).status).toBe(400);
    expect((await start(cookie, { source: 'LESSON_BANK', lessonId: INTEGERS, total: 0 })).status).toBe(400);
    expect((await start(cookie, { source: 'LESSON_BANK', lessonId: INTEGERS, total: 500 })).status).toBe(400);
    expect((await start(cookie, { source: 'NOPE', lessonId: INTEGERS })).status).toBe(400);
  });
});
