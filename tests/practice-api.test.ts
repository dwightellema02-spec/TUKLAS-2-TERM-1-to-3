import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, toPublicUser } from '../src/server/auth';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as createPracticeSession } from '../src/app/api/practice/sessions/route';
import { POST as submitAnswer } from '../src/app/api/practice/sessions/[id]/answers/route';

const emailFor = (suffix: string) =>
  `practice-test-${suffix}-${randomUUID()}@example.com`;

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: 'practice-test-' } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  await db.lesson.deleteMany({ where: { authorId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('practice api', () => {
  it('creates a practice session for an authenticated student', async () => {
    const teacher = await db.user.create({
      data: {
        email: emailFor('teacher'),
        passwordHash: 'teacher-hash',
        role: 'TEACHER',
        displayName: 'Teacher One',
      },
    });

    const lesson = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Practice Lesson One',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'PUBLISHED',
        sections: {
          create: [{ position: 0, heading: 'Intro' }],
        },
      },
    });

    const studentEmail = emailFor('create');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          password: 'StrongPass123!',
          displayName: 'Practice Student',
          role: 'STUDENT',
        }),
      }),
    );

    const studentCookie = registerResponse.headers.get('set-cookie') ?? '';

    const response = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: studentCookie,
        },
        body: JSON.stringify({
          lessonId: lesson.id,
          subject: 'Mathematics',
          topic: 'Integers',
          difficulty: 'Medium',
          total: 2,
          studentId: 'forged-client-student-id',
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.session.subject).toBe('Mathematics');
    expect(payload.data.session.total).toBe(2);
    const registered = await registerResponse.json();
    expect(payload.data.session.studentId).toBe(registered.data.user.id);
    expect(payload.data.session.studentId).not.toBe('forged-client-student-id');
  });

  it('requires authentication to create a practice session', async () => {
    const response = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: 'Practice',
          topic: 'Integers',
          difficulty: 'Medium',
          total: 1,
        }),
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Authentication required.');
  });

  it('does not start a session for an unpublished lesson', async () => {
    const teacher = await db.user.create({
      data: {
        email: emailFor('teacher'),
        passwordHash: 'teacher-hash',
        role: 'TEACHER',
        displayName: 'Draft Teacher',
      },
    });
    const lesson = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Practice Lesson Draft',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
      },
    });
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('draft'),
          password: 'StrongPass123!',
          displayName: 'Draft Student',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: registerResponse.headers.get('set-cookie') ?? '',
        },
        body: JSON.stringify({
          lessonId: lesson.id,
          subject: 'Mathematics',
          topic: 'Integers',
          difficulty: 'Medium',
          total: 1,
        }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('accepts practice answers and updates session performance', async () => {
    const teacher = await db.user.create({
      data: {
        email: emailFor('teacher'),
        passwordHash: 'teacher-hash',
        role: 'TEACHER',
        displayName: 'Teacher Two',
      },
    });

    const lesson = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Practice Lesson Two',
        subject: 'Science',
        gradeLevel: 'Grade 8',
        status: 'PUBLISHED',
        sections: {
          create: [{ position: 0, heading: 'Cells' }],
        },
      },
    });

    const studentEmail = emailFor('answer');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          password: 'StrongPass123!',
          displayName: 'Answer Student',
          role: 'STUDENT',
        }),
      }),
    );

    const studentCookie = registerResponse.headers.get('set-cookie') ?? '';

    const sessionResponse = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: studentCookie,
        },
        body: JSON.stringify({
          lessonId: lesson.id,
          subject: 'Science',
          topic: 'Cells',
          difficulty: 'Medium',
          total: 1,
        }),
      }),
    );

    const sessionPayload = await sessionResponse.json();
    const sessionId = sessionPayload.data.session.id;
    const question = await db.practiceQuestion.create({
      data: {
        sessionId,
        question: 'Practice test question',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        skill: 'Recall',
        explanation: 'Correct because B is the right answer.',
        difficulty: 'Medium',
      },
    });

    const answerResponse = await submitAnswer(
      new Request(
        `http://localhost/api/practice/sessions/${sessionId}/answers`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: studentCookie,
          },
          body: JSON.stringify({
            questionId: question.id,
            selectedIndex: 1,
          }),
        },
      ),
    );

    expect(answerResponse.status).toBe(200);
    const answerPayload = await answerResponse.json();
    expect(answerPayload.success).toBe(true);
    expect(answerPayload.data.answer.correct).toBe(true);
    expect(answerPayload.data.session.correct).toBe(1);
  });

  it('prevents one student from submitting answers to another student session', async () => {
    const ownerRegister = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('owner'),
          password: 'StrongPass123!',
          displayName: 'Session Owner',
          role: 'STUDENT',
        }),
      }),
    );
    const ownerCookie = ownerRegister.headers.get('set-cookie') ?? '';
    const sessionResponse = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          subject: 'Mathematics',
          topic: 'Fractions',
          difficulty: 'Easy',
          total: 1,
        }),
      }),
    );
    const sessionId = (await sessionResponse.json()).data.session.id;
    const question = await db.practiceQuestion.create({
      data: {
        sessionId,
        question: 'Private session question',
        options: ['A', 'B'],
        correctIndex: 0,
        difficulty: 'Easy',
      },
    });
    const otherRegister = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('other-student'),
          password: 'StrongPass123!',
          displayName: 'Other Student',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await submitAnswer(
      new Request(
        `http://localhost/api/practice/sessions/${sessionId}/answers`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: otherRegister.headers.get('set-cookie') ?? '',
          },
          body: JSON.stringify({ questionId: question.id, selectedIndex: 0 }),
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(await db.practiceAnswer.count({ where: { sessionId } })).toBe(0);
  });

  it('denies teachers access to student practice creation', async () => {
    const teacher = await db.user.create({
      data: {
        email: emailFor('teacher-role'),
        passwordHash: 'test-only-hash',
        role: 'TEACHER',
        displayName: 'Practice Teacher',
      },
    });
    const cookie = `tuklas_session=${await createSessionToken(toPublicUser(teacher))}`;
    const response = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          subject: 'Mathematics',
          topic: 'Fractions',
          difficulty: 'Easy',
          total: 1,
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it('rejects invalid answer payloads', async () => {
    const teacher = await db.user.create({
      data: {
        email: `teacher-${randomUUID()}@example.com`,
        passwordHash: 'teacher-hash',
        role: 'TEACHER',
        displayName: 'Teacher Three',
      },
    });

    const lesson = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Practice Lesson Three',
        subject: 'English',
        gradeLevel: 'Grade 6',
        status: 'PUBLISHED',
        sections: {
          create: [{ position: 0, heading: 'Reading' }],
        },
      },
    });

    const studentEmail = emailFor('invalid');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          password: 'StrongPass123!',
          displayName: 'Invalid Student',
          role: 'STUDENT',
        }),
      }),
    );

    const sessionResponse = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: registerResponse.headers.get('set-cookie') ?? '',
        },
        body: JSON.stringify({
          lessonId: lesson.id,
          subject: 'English',
          topic: 'Reading',
          difficulty: 'Easy',
          total: 1,
        }),
      }),
    );

    const sessionId = (await sessionResponse.json()).data.session.id;

    const response = await submitAnswer(
      new Request(
        `http://localhost/api/practice/sessions/${sessionId}/answers`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: registerResponse.headers.get('set-cookie') ?? '',
          },
          body: JSON.stringify({
            questionId: '',
            selectedIndex: 1,
          }),
        },
      ),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBeTruthy();
  });

  it('rejects answers after a session is complete', async () => {
    const studentEmail = emailFor('complete');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          password: 'StrongPass123!',
          displayName: 'Complete Student',
          role: 'STUDENT',
        }),
      }),
    );
    const studentCookie = registerResponse.headers.get('set-cookie') ?? '';
    const sessionResponse = await createPracticeSession(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({
          subject: 'Practice',
          topic: 'Fractions',
          difficulty: 'Easy',
          total: 1,
        }),
      }),
    );
    const sessionId = (await sessionResponse.json()).data.session.id;
    const question = await db.practiceQuestion.create({
      data: {
        sessionId,
        question: 'Practice test completed question',
        options: ['A', 'B'],
        correctIndex: 0,
        difficulty: 'Easy',
      },
    });
    const answer = {
      questionId: question.id,
      selectedIndex: 0,
    };

    const firstResponse = await submitAnswer(
      new Request(
        `http://localhost/api/practice/sessions/${sessionId}/answers`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: studentCookie,
          },
          body: JSON.stringify(answer),
        },
      ),
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await submitAnswer(
      new Request(
        `http://localhost/api/practice/sessions/${sessionId}/answers`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: studentCookie,
          },
          body: JSON.stringify(answer),
        },
      ),
    );
    expect(secondResponse.status).toBe(409);
  });
});
