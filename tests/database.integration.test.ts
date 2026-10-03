import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';

const teacherEmail = `phase3-${randomUUID()}@example.test`;
const studentEmail = `phase3-student-${randomUUID()}@example.test`;

describe('database relationships', () => {
  let teacherId: string;
  let studentId: string;
  let classId: string;
  let lessonId: string;

  it('creates and reads related records', async () => {
    const teacher = await db.user.create({
      data: {
        email: teacherEmail,
        passwordHash: 'test-only-hash',
        role: 'TEACHER',
        displayName: 'Phase 3 Teacher',
      },
    });
    teacherId = teacher.id;

    const student = await db.user.create({
      data: {
        email: studentEmail,
        passwordHash: 'test-only-hash',
        role: 'STUDENT',
        displayName: 'Phase 3 Student',
      },
    });
    studentId = student.id;

    const createdClass = await db.class.create({
      data: {
        name: 'Phase 3 Mathematics',
        teacherId,
        members: { create: { userId: studentId } },
      },
      include: { members: true, teacher: true },
    });
    classId = createdClass.id;

    const lesson = await db.lesson.create({
      data: {
        authorId: teacherId,
        title: 'Adding Integers',
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        sections: { create: { position: 0, heading: 'Integer Rules' } },
      },
      include: { sections: true, author: true },
    });
    lessonId = lesson.id;

    const assignment = await db.assignment.create({
      data: { lessonId, classId, studentId },
      include: { lesson: true, class: true, student: true },
    });

    expect(createdClass.teacher.id).toBe(teacherId);
    expect(createdClass.members).toHaveLength(1);
    expect(lesson.sections).toHaveLength(1);
    expect(assignment.lesson.id).toBe(lessonId);
    expect(assignment.class.id).toBe(classId);
    expect(assignment.student?.id).toBe(studentId);
  });

  afterAll(async () => {
    const users = await db.user.findMany({
      where: { email: { in: [teacherEmail, studentEmail] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const classes = await db.class.findMany({
      where: { teacherId: { in: userIds } },
      select: { id: true },
    });
    const lessons = await db.lesson.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true },
    });
    const classIds = classes.map((item) => item.id);
    const lessonIds = lessons.map((item) => item.id);

    await db.assignment.deleteMany({
      where: {
        OR: [
          { lessonId: { in: lessonIds } },
          { classId: { in: classIds } },
          { studentId: { in: userIds } },
        ],
      },
    });
    await db.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    await db.class.deleteMany({ where: { id: { in: classIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });
});
