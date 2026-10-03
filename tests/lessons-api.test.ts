import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, toPublicUser } from '../src/server/auth';
import { POST as register } from '../src/app/api/auth/register/route';
import {
  GET as listLessons,
  POST as createLesson,
} from '../src/app/api/lessons/route';
import { GET as getLesson } from '../src/app/api/lessons/[id]/route';

const emailFor = (suffix: string) =>
  `lesson-test-${suffix}-${randomUUID()}@example.com`;

// High position keeps this fixture clear of seeded units and of other test files that reorder units.
const TEST_UNIT_POSITION = 9001;

async function curriculumUnit(subjectCode: string, subjectName: string) {
  const subject = await db.subject.upsert({
    where: { code: subjectCode },
    update: {},
    create: { code: subjectCode, name: subjectName },
  });
  const gradeLevel = await db.gradeLevel.upsert({
    where: { level: 7 },
    update: {},
    create: { level: 7, label: 'Grade 7' },
  });
  const curriculum = await db.curriculum.upsert({
    where: {
      subjectId_gradeLevelId: {
        subjectId: subject.id,
        gradeLevelId: gradeLevel.id,
      },
    },
    update: {},
    create: { subjectId: subject.id, gradeLevelId: gradeLevel.id },
  });
  const term = await db.term.upsert({
    where: { curriculumId_number: { curriculumId: curriculum.id, number: 1 } },
    update: {},
    create: { curriculumId: curriculum.id, number: 1, title: 'Term 1' },
  });
  const id = `test-unit-${subjectCode.toLowerCase()}`;
  return db.unit.upsert({
    where: { id },
    update: { termId: term.id, position: TEST_UNIT_POSITION },
    create: { id, termId: term.id, title: `Test ${subjectName} Unit`, position: TEST_UNIT_POSITION },
  });
}

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: 'lesson-test-' } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  await db.lesson.deleteMany({ where: { authorId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('lesson api', () => {
  it('lists safe lesson metadata according to the authenticated role', async () => {
    const teacher = await db.user.create({
      data: {
        email: emailFor('list-owner'),
        passwordHash: 'test-only-hash',
        role: 'TEACHER',
        displayName: 'List Owner',
      },
    });
    const otherTeacher = await db.user.create({
      data: {
        email: emailFor('list-other'),
        passwordHash: 'test-only-hash',
        role: 'TEACHER',
        displayName: 'Other Teacher',
      },
    });
    const student = await db.user.create({
      data: {
        email: emailFor('list-student'),
        passwordHash: 'test-only-hash',
        role: 'STUDENT',
        displayName: 'Lesson Student',
      },
    });
    const draft = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Lesson API Draft',
        subject: 'Lesson API Visibility',
        gradeLevel: 'Grade 8',
        sourceTranscript: 'Private source transcript',
        sections: { create: { position: 0, heading: 'Draft section' } },
      },
    });
    const published = await db.lesson.create({
      data: {
        authorId: otherTeacher.id,
        title: 'Lesson API Published',
        subject: 'Lesson API Visibility',
        gradeLevel: 'Grade 8',
        status: 'PUBLISHED',
        sourceTranscript: 'Private published transcript',
      },
    });
    const requestFor = async (user: typeof teacher | typeof student) =>
      new Request(
        'http://localhost/api/lessons?subject=Lesson%20API%20Visibility',
        {
          headers: {
            Cookie: `tuklas_session=${await createSessionToken(toPublicUser(user))}`,
          },
        },
      );

    const teacherResponse = await listLessons(await requestFor(teacher));
    const teacherPayload = await teacherResponse.json();
    expect(teacherResponse.status).toBe(200);
    expect(
      teacherPayload.data.lessons.map((lesson: { id: string }) => lesson.id),
    ).toEqual([draft.id]);
    expect(JSON.stringify(teacherPayload)).not.toContain(
      'Private source transcript',
    );
    expect(teacherPayload.data.lessons[0]).not.toHaveProperty(
      'sourceTranscript',
    );
    expect(teacherPayload.data.lessons[0]).not.toHaveProperty('sections');

    const studentResponse = await listLessons(await requestFor(student));
    const studentPayload = await studentResponse.json();
    expect(studentResponse.status).toBe(200);
    expect(
      studentPayload.data.lessons.map((lesson: { id: string }) => lesson.id),
    ).toEqual([published.id]);
  });

  it('requires authentication to list lessons', async () => {
    const response = await listLessons(
      new Request('http://localhost/api/lessons'),
    );

    expect(response.status).toBe(401);
  });

  it('creates a lesson for an authenticated teacher', async () => {
    const unit = await curriculumUnit('MATHEMATICS', 'Mathematics');
    const email = emailFor('create');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Lesson Teacher',
          role: 'TEACHER',
          inviteCode: process.env.TEACHER_INVITE_CODE,
        }),
      }),
    );

    const cookieHeader = registerResponse.headers.get('set-cookie') ?? '';
    const registered = await registerResponse.json();

    const response = await createLesson(
      new Request('http://localhost/api/lessons', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          unitId: unit.id,
          title: 'Lesson API',
          subject: 'Mathematics',
          gradeLevel: 'Grade 7',
          estimatedMinutes: 20,
          sections: [
            {
              position: 0,
              heading: 'Integer Rules',
              sourceExplanation:
                'When signs match, add the values and keep the sign.',
              aiExplanation:
                'This helps students reason through the sign rule.',
            },
          ],
          vocabulary: [
            {
              term: 'integer',
              definition:
                'A whole number that can be positive, negative, or zero.',
            },
          ],
          checks: [
            {
              position: 0,
              question: 'What is -3 + 5?',
              options: ['2', '-2', '8', '-8'],
              correctIndex: 0,
              explanation:
                'Add the numbers and keep the sign of the larger absolute value.',
            },
          ],
          quizQuestions: [
            {
              position: 0,
              question: 'What is -4 + 9?',
              options: ['13', '5', '-5', '-13'],
              correctIndex: 1,
              explanation: 'The answer is 5 because 9 is farther from zero.',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.lesson.title).toBe('Lesson API');
    expect(payload.data.lesson.sections).toHaveLength(1);
    expect(payload.data.lesson.authorId).toBe(registered.data.user.id);
  });

  it('requires authentication to create a lesson', async () => {
    const response = await createLesson(
      new Request('http://localhost/api/lessons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Lesson API',
          subject: 'Science',
          gradeLevel: 'Grade 8',
          sections: [{ position: 0, heading: 'Intro' }],
        }),
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Authentication required.');
  });

  it('denies students access to teacher lesson creation', async () => {
    const registration = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('student-create'),
          password: 'StrongPass123!',
          displayName: 'Student Account',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await createLesson(
      new Request('http://localhost/api/lessons', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: registration.headers.get('set-cookie') ?? '',
        },
        body: JSON.stringify({
          title: 'Unauthorized lesson',
          subject: 'Science',
          gradeLevel: 'Grade 8',
        }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it('rejects invalid lesson input', async () => {
    const email = emailFor('invalid');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Lesson Teacher',
          role: 'TEACHER',
          inviteCode: process.env.TEACHER_INVITE_CODE,
        }),
      }),
    );

    const response = await createLesson(
      new Request('http://localhost/api/lessons', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: registerResponse.headers.get('set-cookie') ?? '',
        },
        body: JSON.stringify({
          title: '',
          subject: 'Mathematics',
          gradeLevel: 'Grade 7',
          checks: [
            {
              position: 0,
              question: 'Question',
              options: ['A', 'B'],
              correctIndex: 9,
              explanation: 'Bad answer',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBeTruthy();
  });

  it('loads a lesson by id for the authenticated teacher', async () => {
    const unit = await curriculumUnit('ENGLISH', 'English');
    const email = emailFor('read');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Lesson Reader',
          role: 'TEACHER',
          inviteCode: process.env.TEACHER_INVITE_CODE,
        }),
      }),
    );

    const cookieHeader = registerResponse.headers.get('set-cookie') ?? '';

    const createResponse = await createLesson(
      new Request('http://localhost/api/lessons', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          title: 'Lesson API Read',
          subject: 'English',
          gradeLevel: 'Grade 7',
          unitId: unit.id,
          sections: [{ position: 0, heading: 'Reading Strategy' }],
          checks: [
            {
              position: 0,
              question: 'What is a main idea?',
              options: [
                'A lesson detail',
                'The central point',
                'A title',
                'A book',
              ],
              correctIndex: 1,
              explanation:
                'The main idea is the central point the author wants readers to understand.',
            },
          ],
          quizQuestions: [
            {
              position: 0,
              question: 'Which is a fact?',
              options: [
                'A guess',
                'A statement that can be proven',
                'An opinion',
                'A feeling',
              ],
              correctIndex: 1,
              explanation: 'A fact can be proven with evidence.',
            },
          ],
        }),
      }),
    );

    const created = await createResponse.json();
    const lessonId = created.data.lesson.id;

    const response = await getLesson(
      new Request(`http://localhost/api/lessons/${lessonId}`, {
        headers: {
          Cookie: cookieHeader,
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.lesson.id).toBe(lessonId);
    expect(payload.data.lesson.title).toBe('Lesson API Read');
  });

  it('does not expose another teacher lesson or password hash', async () => {
    const firstTeacher = await db.user.create({
      data: {
        email: emailFor('owner'),
        passwordHash: 'owner-secret-hash',
        role: 'TEACHER',
        displayName: 'Owner Teacher',
      },
    });
    const otherTeacherResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('other'),
          password: 'StrongPass123!',
          displayName: 'Other Teacher',
          role: 'TEACHER',
          inviteCode: process.env.TEACHER_INVITE_CODE,
        }),
      }),
    );
    const lesson = await db.lesson.create({
      data: {
        authorId: firstTeacher.id,
        title: 'Lesson API Private',
        subject: 'Science',
        gradeLevel: 'Grade 8',
      },
    });

    const response = await getLesson(
      new Request(`http://localhost/api/lessons/${lesson.id}`, {
        headers: {
          Cookie: otherTeacherResponse.headers.get('set-cookie') ?? '',
        },
      }),
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(
      'owner-secret-hash',
    );
  });
});
