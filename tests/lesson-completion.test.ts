import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { POST as answerCheck } from '../src/app/api/lessons/[id]/checks/[checkId]/answer/route';
import { PATCH as patchProgress } from '../src/app/api/lessons/[id]/progress/route';

const PREFIX = 'completion-test-';
const email = (tag: string) => `${PREFIX}${tag}-${randomUUID()}@example.com`;

type Role = 'STUDENT' | 'TEACHER';

async function userWithCookie(role: Role, tag: string) {
  const user = await db.user.create({
    data: {
      email: email(tag),
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

let teacherId = '';
let lessonId = '';
let checkIds: string[] = [];

async function makeLesson(status: 'PUBLISHED' | 'DRAFT', withChecks: boolean) {
  const lesson = await db.lesson.create({
    data: {
      authorId: teacherId,
      title: `Completion Lesson ${randomUUID()}`,
      subject: 'Mathematics',
      gradeLevel: 'Grade 7',
      status,
      sections: { create: [{ position: 0, heading: 'Intro' }] },
      ...(withChecks
        ? {
            checks: {
              create: [
                {
                  position: 0,
                  question: 'What is 7 − (−3)?',
                  options: ['4', '10', '-4', '-10'],
                  correctIndex: 1,
                  explanation: 'Subtracting a negative adds: 7 + 3 = 10.',
                },
                {
                  position: 1,
                  question: 'What is -8 + 5?',
                  options: ['-13', '13', '-3', '3'],
                  correctIndex: 2,
                  explanation: 'Start at -8 and move 5 right: -3.',
                },
              ],
            },
          }
        : {}),
    },
    include: { checks: { orderBy: { position: 'asc' } } },
  });
  return lesson;
}

function answer(
  cookie: string,
  lesson: string,
  check: string,
  body: Record<string, unknown>,
) {
  return answerCheck(
    new Request(`http://localhost/api/lessons/${lesson}/checks/${check}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: lesson, checkId: check }) },
  );
}

function complete(cookie: string, lesson: string, status: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED') {
  return patchProgress(
    new Request(`http://localhost/api/lessons/${lesson}/progress`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: lesson }) },
  );
}

beforeEach(async () => {
  const { user } = await userWithCookie('TEACHER', 'author');
  teacherId = user.id;
  const lesson = await makeLesson('PUBLISHED', true);
  lessonId = lesson.id;
  checkIds = lesson.checks.map((check) => check.id);
});

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.lesson.deleteMany({ where: { authorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('lesson completion is decided by the server', () => {
  it('rejects a forged COMPLETED when no checks were answered', async () => {
    const { user, cookie } = await userWithCookie('STUDENT', 'forger');
    const response = await complete(cookie, lessonId);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/2 remaining/);

    const progress = await db.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
    });
    expect(progress?.status ?? 'NONE').not.toBe('COMPLETED');
    expect(progress?.completedAt ?? null).toBeNull();
  });

  it('does not count wrong answers, even if the client claims it was correct', async () => {
    const { user, cookie } = await userWithCookie('STUDENT', 'liar');
    const wrong = await answer(cookie, lessonId, checkIds[0], {
      selectedIndex: 0,
      correct: true,
      isCorrect: true,
    });
    expect(wrong.status).toBe(200);
    const payload = (await wrong.json()).data;
    expect(payload.correct).toBe(false);
    expect(payload.explanation).toBeNull();
    expect(JSON.stringify(payload)).not.toMatch(/correctIndex|correctAnswer|7 \+ 3/);

    await answer(cookie, lessonId, checkIds[1], { selectedIndex: 0 });
    expect((await complete(cookie, lessonId)).status).toBe(409);

    const attempts = await db.lessonCheckAttempt.findMany({ where: { studentId: user.id } });
    expect(attempts).toHaveLength(2);
    expect(attempts.every((attempt) => attempt.correct === false)).toBe(true);
  });

  it('requires every check to be answered correctly; partial progress is not enough', async () => {
    const { cookie } = await userWithCookie('STUDENT', 'partial');
    expect((await answer(cookie, lessonId, checkIds[0], { selectedIndex: 1 })).status).toBe(200);
    const response = await complete(cookie, lessonId);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/1 remaining/);
  });

  it('allows completion once all checks are correct, revealing the explanation only then', async () => {
    const { user, cookie } = await userWithCookie('STUDENT', 'solver');
    // A wrong attempt first, then the right one: retries are allowed.
    await answer(cookie, lessonId, checkIds[0], { selectedIndex: 3 });
    const first = await (await answer(cookie, lessonId, checkIds[0], { selectedIndex: 1 })).json();
    expect(first.data.correct).toBe(true);
    expect(first.data.explanation).toContain('Subtracting a negative');
    await answer(cookie, lessonId, checkIds[1], { selectedIndex: 2 });

    const response = await complete(cookie, lessonId);
    expect(response.status).toBe(200);
    const progress = await db.lessonProgress.findUniqueOrThrow({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
    });
    expect(progress.status).toBe('COMPLETED');
    expect(progress.completedAt).not.toBeNull();
  });

  it('does not let one student rely on another student’s correct answers', async () => {
    const solver = await userWithCookie('STUDENT', 'solver2');
    await answer(solver.cookie, lessonId, checkIds[0], { selectedIndex: 1 });
    await answer(solver.cookie, lessonId, checkIds[1], { selectedIndex: 2 });
    expect((await complete(solver.cookie, lessonId)).status).toBe(200);

    const rider = await userWithCookie('STUDENT', 'rider');
    expect((await complete(rider.cookie, lessonId)).status).toBe(409);
  });

  it('lets a lesson without knowledge checks be completed (nothing to verify)', async () => {
    const plain = await makeLesson('PUBLISHED', false);
    const { cookie } = await userWithCookie('STUDENT', 'plain');
    expect((await complete(cookie, plain.id)).status).toBe(200);
  });

  it('does not downgrade a completed lesson when more checks are answered', async () => {
    const { user, cookie } = await userWithCookie('STUDENT', 'steady');
    await answer(cookie, lessonId, checkIds[0], { selectedIndex: 1 });
    await answer(cookie, lessonId, checkIds[1], { selectedIndex: 2 });
    await complete(cookie, lessonId);
    await answer(cookie, lessonId, checkIds[0], { selectedIndex: 0 });
    const progress = await db.lessonProgress.findUniqueOrThrow({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
    });
    expect(progress.status).toBe('COMPLETED');
  });
});

describe('POST /api/lessons/[id]/checks/[checkId]/answer access control and input', () => {
  it('requires authentication', async () => {
    expect((await answer('', lessonId, checkIds[0], { selectedIndex: 1 })).status).toBe(401);
  });

  it('is student-only', async () => {
    const teacher = await userWithCookie('TEACHER', 'other');
    expect((await answer(teacher.cookie, lessonId, checkIds[0], { selectedIndex: 1 })).status).toBe(403);
  });

  it('does not expose checks of unpublished lessons', async () => {
    const draft = await makeLesson('DRAFT', true);
    const { cookie } = await userWithCookie('STUDENT', 'drafts');
    const response = await answer(cookie, draft.id, draft.checks[0].id, { selectedIndex: 1 });
    expect(response.status).toBe(404);
  });

  it('does not accept a check ID from a different lesson', async () => {
    const other = await makeLesson('PUBLISHED', true);
    const { cookie } = await userWithCookie('STUDENT', 'mixup');
    const response = await answer(cookie, lessonId, other.checks[0].id, { selectedIndex: 1 });
    expect(response.status).toBe(404);
  });

  it('rejects invalid submissions without recording an attempt', async () => {
    const { user, cookie } = await userWithCookie('STUDENT', 'sloppy');
    expect((await answer(cookie, lessonId, checkIds[0], {})).status).toBe(400);
    expect((await answer(cookie, lessonId, checkIds[0], { selectedIndex: 9 })).status).toBe(400);
    expect((await answer(cookie, lessonId, checkIds[0], { selectedIndex: -1 })).status).toBe(400);
    expect((await answer(cookie, lessonId, checkIds[0], { selectedIndex: 'one' })).status).toBe(400);
    expect(await db.lessonCheckAttempt.count({ where: { studentId: user.id } })).toBe(0);
  });

  it('throttles answer spam with 429 (not a server error) and keeps grading honest', async () => {
    const { cookie } = await userWithCookie('STUDENT', 'spammer');
    const statuses: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      statuses.push((await answer(cookie, lessonId, checkIds[0], { selectedIndex: 0 })).status);
    }
    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(120).every((status) => status === 429)).toBe(true);
  });
});
