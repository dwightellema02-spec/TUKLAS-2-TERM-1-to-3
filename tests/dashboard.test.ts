import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { DashboardService } from '../src/services/dashboard.service';

const PREFIX = 'dash-test-';
const INTEGERS = 'lesson-math-7-integers';
const DEMO_LESSON = 'demo-lesson-curriculum-foundation';

async function student(tag: string) {
  return db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: 'test-only-hash',
      role: 'STUDENT',
      displayName: `Dash ${tag}`,
    },
  });
}

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.lesson.deleteMany({ where: { authorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('student dashboard data', () => {
  it('starts at zero with the first available lesson as the place to begin', async () => {
    const s = await student('fresh');
    const dash = await DashboardService.getStudentDashboard(s.id);

    expect(dash.stats).toMatchObject({
      lessonsCompleted: 0,
      lessonsInProgress: 0,
      practiceSessions: 0,
      unresolvedMistakes: 0,
    });
    expect(dash.stats.lessonsAvailable).toBe(dash.path.length);
    expect(dash.path.map((lesson) => lesson.id)).toContain(INTEGERS);
    expect(dash.path.every((lesson) => lesson.status === 'NOT_STARTED')).toBe(true);
    expect(dash.continueLesson?.id).toBe(dash.path[0].id);
    expect(dash.recentSessions).toEqual([]);
  });

  it('never lists demo-only or draft lessons on the learning path', async () => {
    const teacher = await student('author');
    await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: 'Hidden draft',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'DRAFT',
      },
    });
    const dash = await DashboardService.getStudentDashboard(teacher.id);
    const ids = dash.path.map((lesson) => lesson.id);
    expect(ids).not.toContain(DEMO_LESSON);
    expect(dash.path.map((lesson) => lesson.title)).not.toContain('Hidden draft');
  });

  it('continues the lesson the student was in the middle of', async () => {
    const s = await student('mid');
    await db.lessonProgress.create({
      data: { studentId: s.id, lessonId: INTEGERS, status: 'IN_PROGRESS' },
    });
    const dash = await DashboardService.getStudentDashboard(s.id);
    expect(dash.continueLesson).toMatchObject({ id: INTEGERS, status: 'IN_PROGRESS' });
    expect(dash.stats.lessonsInProgress).toBe(1);
    expect(dash.stats.lessonsCompleted).toBe(0);
  });

  it('counts a completed lesson and moves on to something else', async () => {
    const s = await student('done');
    await db.lessonProgress.create({
      data: { studentId: s.id, lessonId: INTEGERS, status: 'COMPLETED', completedAt: new Date() },
    });
    const dash = await DashboardService.getStudentDashboard(s.id);
    expect(dash.stats.lessonsCompleted).toBe(1);
    expect(dash.path.find((lesson) => lesson.id === INTEGERS)?.status).toBe('COMPLETED');
    expect(dash.continueLesson?.id).not.toBe(INTEGERS);
  });

  it('treats a mastered lesson as completed', async () => {
    const s = await student('master');
    await db.lessonProgress.create({
      data: { studentId: s.id, lessonId: INTEGERS, status: 'MASTERED' },
    });
    const dash = await DashboardService.getStudentDashboard(s.id);
    expect(dash.path.find((lesson) => lesson.id === INTEGERS)?.status).toBe('COMPLETED');
  });

  it('counts only unresolved mistakes', async () => {
    const s = await student('mistakes');
    await db.mistakeRecord.createMany({
      data: [
        { studentId: s.id, lessonId: INTEGERS, submittedAnswer: '1', resolved: false },
        { studentId: s.id, lessonId: INTEGERS, submittedAnswer: '2', resolved: false },
        { studentId: s.id, lessonId: INTEGERS, submittedAnswer: '3', resolved: true },
      ],
    });
    expect((await DashboardService.getStudentDashboard(s.id)).stats.unresolvedMistakes).toBe(2);
  });

  it('lists the five most recent practice sessions, newest first, and counts them all', async () => {
    const s = await student('sessions');
    for (let i = 0; i < 7; i += 1) {
      await db.practiceSession.create({
        data: {
          studentId: s.id,
          lessonId: INTEGERS,
          subject: 'Mathematics',
          topic: `Topic ${i}`,
          difficulty: 'Mixed',
          total: 5,
          correct: i,
          startedAt: new Date(Date.UTC(2026, 0, 1 + i)),
        },
      });
    }
    const dash = await DashboardService.getStudentDashboard(s.id);
    expect(dash.stats.practiceSessions).toBe(7);
    expect(dash.recentSessions).toHaveLength(5);
    expect(dash.recentSessions.map((session) => session.topic)).toEqual([
      'Topic 6',
      'Topic 5',
      'Topic 4',
      'Topic 3',
      'Topic 2',
    ]);
  });

  it('is isolated per student', async () => {
    const a = await student('iso-a');
    const b = await student('iso-b');
    await db.lessonProgress.create({ data: { studentId: a.id, lessonId: INTEGERS, status: 'COMPLETED' } });
    await db.mistakeRecord.create({ data: { studentId: a.id, submittedAnswer: 'x' } });
    await db.practiceSession.create({
      data: { studentId: a.id, subject: 'M', topic: 'T', difficulty: 'Mixed', total: 1 },
    });

    const dash = await DashboardService.getStudentDashboard(b.id);
    expect(dash.stats).toMatchObject({
      lessonsCompleted: 0,
      lessonsInProgress: 0,
      practiceSessions: 0,
      unresolvedMistakes: 0,
    });
    expect(dash.recentSessions).toEqual([]);
  });
});
