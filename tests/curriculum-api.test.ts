import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GET as getCurriculum } from '../src/app/api/curriculum/route';
import { GET as getLesson } from '../src/app/api/lessons/[id]/route';
import { POST as register } from '../src/app/api/auth/register/route';
import { db } from '../src/server/db';

const emailFor = () => `curriculum-test-${randomUUID()}@example.com`;

afterEach(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: 'curriculum-test-' } },
  });
});

describe('curriculum api', () => {
  it('requires authentication to retrieve the curriculum hierarchy', async () => {
    const response = await getCurriculum(
      new Request('http://localhost/api/curriculum'),
    );

    expect(response.status).toBe(401);
  });

  it('returns subjects, grades, terms, units, and role-filtered lessons from the database', async () => {
    const registration = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor(),
          password: 'StrongPass123!',
          displayName: 'Curriculum Student',
          role: 'STUDENT',
        }),
      }),
    );
    const response = await getCurriculum(
      new Request('http://localhost/api/curriculum', {
        headers: { Cookie: registration.headers.get('set-cookie') ?? '' },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const mathematics = payload.data.subjects.find(
      (subject: { code: string }) => subject.code === 'MATHEMATICS',
    );
    const english = payload.data.subjects.find(
      (subject: { code: string }) => subject.code === 'ENGLISH',
    );
    expect(mathematics).toBeTruthy();
    expect(english).toBeTruthy();
    expect(mathematics.curricula.map((entry: { gradeLevel: { level: number } }) => entry.gradeLevel.level)).toEqual([7, 8, 9, 10]);
    expect(mathematics.curricula[0].terms.map((term: { number: number }) => term.number)).toEqual([1, 2, 3]);
    expect(mathematics.curricula[0].terms[0].units.length).toBeGreaterThan(0);
    const demoLesson = mathematics.curricula[0].terms[0].units[0].lessons[0];
    expect(demoLesson.title).toContain('DEMO ONLY');
    expect(demoLesson.status).toBe('PUBLISHED');
  });

  it('allows students to read published lesson content without assessment answers', async () => {
    const lesson = await db.lesson.findUniqueOrThrow({
      where: { id: 'demo-lesson-curriculum-foundation' },
      select: { id: true },
    });
    const registration = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor(),
          password: 'StrongPass123!',
          displayName: 'Lesson Student',
          role: 'STUDENT',
        }),
      }),
    );
    const response = await getLesson(
      new Request(`http://localhost/api/lessons/${lesson.id}`, {
        headers: { Cookie: registration.headers.get('set-cookie') ?? '' },
      }),
      { params: Promise.resolve({ id: lesson.id }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.lesson.contents).toHaveLength(1);
    expect(payload.data.lesson.objectives[0].skills).toHaveLength(1);
    expect(payload.data.lesson.assessments[0].questions).toHaveLength(1);
    expect(payload.data.lesson.assessments[0].questions[0]).not.toHaveProperty('correctIndex');
    expect(payload.data.lesson.assessments[0].questions[0]).not.toHaveProperty('explanation');
  });
});
