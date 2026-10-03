import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { resetRateLimits } from '../src/server/rate-limit';
import { generateJoinCode, normalizeJoinCode } from '../src/services/class.service';
import { GET as listClasses, POST as createClass } from '../src/app/api/classes/route';
import { POST as joinClass } from '../src/app/api/classes/join/route';
import { GET as myClasses } from '../src/app/api/classes/mine/route';
import { GET as classDetail } from '../src/app/api/classes/[id]/route';
import { DELETE as closeJoining, POST as rotateCode } from '../src/app/api/classes/[id]/join-code/route';
import { POST as addMember } from '../src/app/api/classes/[id]/members/route';
import { DELETE as removeMember } from '../src/app/api/classes/[id]/members/[userId]/route';
import { POST as assignLesson } from '../src/app/api/classes/[id]/assignments/route';
import { DELETE as archiveAssignment } from '../src/app/api/classes/[id]/assignments/[assignmentId]/route';

const PREFIX = 'class-test-';
const INTEGERS = 'lesson-math-7-integers';

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

async function actor(role: Role, tag: string) {
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

const req = (method: string, cookie: string, body?: unknown) =>
  new Request('http://localhost/api/classes', {
    method,
    headers: headers(cookie),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function makeClass(cookie: string, name = `Class ${randomUUID().slice(0, 6)}`) {
  const response = await createClass(req('POST', cookie, { name }));
  expect(response.status).toBe(201);
  return (await response.json()).data.class as { id: string; name: string; joinCode: string };
}

const join = (cookie: string, code: string) => joinClass(req('POST', cookie, { code }));

beforeEach(() => resetRateLimits());

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.class.deleteMany({ where: { teacherId: { in: ids } } });
  await db.adminAuditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.lesson.deleteMany({ where: { authorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('join codes', () => {
  it('are 8 unambiguous characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateJoinCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
    expect(new Set(Array.from({ length: 500 }, generateJoinCode)).size).toBeGreaterThan(495);
  });

  it('normalize case, spaces and dashes', () => {
    expect(normalizeJoinCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeJoinCode('abcd 2345')).toBe('ABCD2345');
  });
});

describe('creating and listing classes', () => {
  it('lets a teacher create a class and returns a formatted join code', async () => {
    const teacher = await actor('TEACHER', 'create');
    const created = await makeClass(teacher.cookie, 'Grade 7 – Sampaguita');
    expect(created.name).toBe('Grade 7 – Sampaguita');
    expect(created.joinCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const stored = await db.class.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.teacherId).toBe(teacher.user.id);
    expect(stored.joinCode).toBe(normalizeJoinCode(created.joinCode));
  });

  it('rejects bad names and duplicates', async () => {
    const teacher = await actor('TEACHER', 'names');
    expect((await createClass(req('POST', teacher.cookie, { name: 'x' }))).status).toBe(400);
    expect((await createClass(req('POST', teacher.cookie, {}))).status).toBe(400);
    await makeClass(teacher.cookie, 'Same Name');
    expect((await createClass(req('POST', teacher.cookie, { name: 'same name' }))).status).toBe(409);
  });

  it('only teachers can create classes', async () => {
    const student = await actor('STUDENT', 'nope');
    const admin = await actor('ADMIN', 'nope');
    expect((await createClass(req('POST', student.cookie, { name: 'Hack' }))).status).toBe(403);
    expect((await createClass(req('POST', admin.cookie, { name: 'Hack' }))).status).toBe(403);
    expect((await createClass(req('POST', '', { name: 'Hack' }))).status).toBe(401);
  });

  it('shows a teacher only their own classes, and an admin all of them', async () => {
    const a = await actor('TEACHER', 'list-a');
    const b = await actor('TEACHER', 'list-b');
    const admin = await actor('ADMIN', 'list-admin');
    const mineA = await makeClass(a.cookie);
    const mineB = await makeClass(b.cookie);

    const listA = (await (await listClasses(req('GET', a.cookie))).json()).data.classes as Array<{ id: string }>;
    expect(listA.map((c) => c.id)).toEqual([mineA.id]);

    const listAdmin = (await (await listClasses(req('GET', admin.cookie))).json()).data.classes as Array<{ id: string }>;
    expect(listAdmin.map((c) => c.id)).toEqual(expect.arrayContaining([mineA.id, mineB.id]));

    const student = await actor('STUDENT', 'list-student');
    expect((await listClasses(req('GET', student.cookie))).status).toBe(403);
  });
});

describe('joining with a code', () => {
  it('lets a student join, and joining again is harmless', async () => {
    const teacher = await actor('TEACHER', 'join-t');
    const student = await actor('STUDENT', 'join-s');
    const cls = await makeClass(teacher.cookie);

    const first = await join(student.cookie, cls.joinCode);
    expect(first.status).toBe(200);
    const data = (await first.json()).data;
    expect(data).toMatchObject({ alreadyMember: false, class: { id: cls.id, name: cls.name } });

    const second = await join(student.cookie, cls.joinCode);
    expect((await second.json()).data.alreadyMember).toBe(true);
    expect(await db.classMember.count({ where: { classId: cls.id } })).toBe(1);
  });

  it('accepts the code however it was typed', async () => {
    const teacher = await actor('TEACHER', 'typed-t');
    const cls = await makeClass(teacher.cookie);
    const typed = cls.joinCode.toLowerCase().replace('-', '  ');
    const student = await actor('STUDENT', 'typed-s');
    expect((await join(student.cookie, typed)).status).toBe(200);
  });

  it('answers every bad code the same way', async () => {
    const student = await actor('STUDENT', 'bad');
    const messages = new Set<string>();
    for (const code of ['AAAAAAAA', 'short1', '!!!!!!!!', 'ZZZZ-9999', '        ']) {
      const response = await join(student.cookie, code);
      expect([400, 404]).toContain(response.status);
      if (response.status === 404) messages.add((await response.json()).error);
    }
    expect(messages.size).toBe(1);
  });

  it('stops working when the teacher rotates the code', async () => {
    const teacher = await actor('TEACHER', 'rotate-t');
    const cls = await makeClass(teacher.cookie);
    const rotated = await rotateCode(req('POST', teacher.cookie), ctx({ id: cls.id }));
    expect(rotated.status).toBe(200);
    const fresh = (await rotated.json()).data.class.joinCode as string;
    expect(fresh).not.toBe(cls.joinCode);

    const student = await actor('STUDENT', 'rotate-s');
    expect((await join(student.cookie, cls.joinCode)).status).toBe(404);
    expect((await join(student.cookie, fresh)).status).toBe(200);
  });

  it('stops working when joining is closed', async () => {
    const teacher = await actor('TEACHER', 'close-t');
    const cls = await makeClass(teacher.cookie);
    const closed = await closeJoining(req('DELETE', teacher.cookie), ctx({ id: cls.id }));
    expect((await closed.json()).data.class.joinCode).toBeNull();
    const student = await actor('STUDENT', 'close-s');
    expect((await join(student.cookie, cls.joinCode)).status).toBe(404);
  });

  it('is student-only', async () => {
    const teacher = await actor('TEACHER', 'role-t');
    const cls = await makeClass(teacher.cookie);
    const other = await actor('TEACHER', 'role-o');
    expect((await join(other.cookie, cls.joinCode)).status).toBe(403);
    expect((await join('', cls.joinCode)).status).toBe(401);
  });

  it('throttles code guessing', async () => {
    const student = await actor('STUDENT', 'guess');
    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await join(student.cookie, generateJoinCode())).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });
});

describe('teacher isolation: one teacher can never touch another teacher’s class', () => {
  async function twoTeachers() {
    const owner = await actor('TEACHER', 'owner');
    const intruder = await actor('TEACHER', 'intruder');
    const cls = await makeClass(owner.cookie);
    const student = await actor('STUDENT', 'victim');
    await join(student.cookie, cls.joinCode);
    return { owner, intruder, cls, student };
  }

  it('hides the roster and returns 404 (not 403) so IDs cannot be probed', async () => {
    const { intruder, cls } = await twoTeachers();
    const response = await classDetail(req('GET', intruder.cookie), ctx({ id: cls.id }));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('victim');
    expect((await classDetail(req('GET', intruder.cookie), ctx({ id: 'does-not-exist' }))).status).toBe(404);
  });

  it('cannot rotate or close the code', async () => {
    const { intruder, cls } = await twoTeachers();
    expect((await rotateCode(req('POST', intruder.cookie), ctx({ id: cls.id }))).status).toBe(404);
    expect((await closeJoining(req('DELETE', intruder.cookie), ctx({ id: cls.id }))).status).toBe(404);
    const stored = await db.class.findUniqueOrThrow({ where: { id: cls.id } });
    expect(stored.joinCode).toBe(normalizeJoinCode(cls.joinCode));
  });

  it('cannot add or remove students', async () => {
    const { intruder, cls, student } = await twoTeachers();
    const other = await actor('STUDENT', 'other');
    expect((await addMember(req('POST', intruder.cookie, { email: other.user.email }), ctx({ id: cls.id }))).status).toBe(404);
    expect(
      (await removeMember(req('DELETE', intruder.cookie), ctx({ id: cls.id, userId: student.user.id }))).status,
    ).toBe(404);
    expect(await db.classMember.count({ where: { classId: cls.id } })).toBe(1);
  });

  it('cannot assign or archive work', async () => {
    const { owner, intruder, cls } = await twoTeachers();
    expect((await assignLesson(req('POST', intruder.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }))).status).toBe(404);
    const made = await assignLesson(req('POST', owner.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }));
    const assignmentId = (await made.json()).data.assignment.id as string;
    expect(
      (await archiveAssignment(req('DELETE', intruder.cookie), ctx({ id: cls.id, assignmentId }))).status,
    ).toBe(404);
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } })).status).toBe('ACTIVE');
  });

  it('students cannot use any teacher route', async () => {
    const { student, cls } = await twoTeachers();
    expect((await classDetail(req('GET', student.cookie), ctx({ id: cls.id }))).status).toBe(403);
    expect((await rotateCode(req('POST', student.cookie), ctx({ id: cls.id }))).status).toBe(403);
    expect((await addMember(req('POST', student.cookie, { email: 'x@y.zz' }), ctx({ id: cls.id }))).status).toBe(403);
    expect((await assignLesson(req('POST', student.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }))).status).toBe(403);
  });

  it('lets an admin view any class', async () => {
    const { cls } = await twoTeachers();
    const admin = await actor('ADMIN', 'viewer');
    expect((await classDetail(req('GET', admin.cookie), ctx({ id: cls.id }))).status).toBe(200);
  });
});

describe('adding and removing students by teacher', () => {
  it('adds an existing student by email (case-insensitive) and removes them', async () => {
    const teacher = await actor('TEACHER', 'add-t');
    const student = await actor('STUDENT', 'add-s');
    const cls = await makeClass(teacher.cookie);

    const added = await addMember(
      req('POST', teacher.cookie, { email: student.user.email.toUpperCase() }),
      ctx({ id: cls.id }),
    );
    expect(added.status).toBe(201);
    expect(await db.classMember.count({ where: { classId: cls.id } })).toBe(1);
    // Adding again is harmless.
    expect((await addMember(req('POST', teacher.cookie, { email: student.user.email }), ctx({ id: cls.id }))).status).toBe(201);
    expect(await db.classMember.count({ where: { classId: cls.id } })).toBe(1);

    const removed = await removeMember(req('DELETE', teacher.cookie), ctx({ id: cls.id, userId: student.user.id }));
    expect(removed.status).toBe(200);
    expect(await db.classMember.count({ where: { classId: cls.id } })).toBe(0);
    expect((await removeMember(req('DELETE', teacher.cookie), ctx({ id: cls.id, userId: student.user.id }))).status).toBe(404);
  });

  it('refuses unknown emails, teachers, admins and inactive students with the same answer', async () => {
    const teacher = await actor('TEACHER', 'refuse-t');
    const cls = await makeClass(teacher.cookie);
    const otherTeacher = await actor('TEACHER', 'refuse-o');
    const inactive = await actor('STUDENT', 'refuse-i');
    await db.user.update({ where: { id: inactive.user.id }, data: { isActive: false } });

    const messages = new Set<string>();
    for (const email of ['nobody@example.test', otherTeacher.user.email, inactive.user.email]) {
      const response = await addMember(req('POST', teacher.cookie, { email }), ctx({ id: cls.id }));
      expect(response.status).toBe(404);
      messages.add((await response.json()).error);
    }
    expect(messages.size).toBe(1);
    expect((await addMember(req('POST', teacher.cookie, { email: 'not-an-email' }), ctx({ id: cls.id }))).status).toBe(400);
  });

  it('keeps a removed student’s learning data', async () => {
    const teacher = await actor('TEACHER', 'keep-t');
    const student = await actor('STUDENT', 'keep-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);
    await db.mistakeRecord.create({ data: { studentId: student.user.id, submittedAnswer: '1' } });
    await removeMember(req('DELETE', teacher.cookie), ctx({ id: cls.id, userId: student.user.id }));
    expect(await db.mistakeRecord.count({ where: { studentId: student.user.id } })).toBe(1);
  });
});

describe('assignments', () => {
  it('assigns a published lesson, and students see it with their own status', async () => {
    const teacher = await actor('TEACHER', 'as-t');
    const student = await actor('STUDENT', 'as-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);

    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const made = await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS, dueAt: due }), ctx({ id: cls.id }));
    expect(made.status).toBe(201);

    const view = (await (await myClasses(req('GET', student.cookie))).json()).data;
    expect(view.classes).toHaveLength(1);
    expect(view.assignments).toHaveLength(1);
    expect(view.assignments[0]).toMatchObject({
      className: cls.name,
      status: 'NOT_STARTED',
      overdue: false,
      lesson: { id: INTEGERS },
    });

    await db.lessonProgress.create({ data: { studentId: student.user.id, lessonId: INTEGERS, status: 'COMPLETED' } });
    const after = (await (await myClasses(req('GET', student.cookie))).json()).data;
    expect(after.assignments[0].status).toBe('COMPLETED');
  });

  it('flags overdue work, but not once it is completed', async () => {
    const teacher = await actor('TEACHER', 'od-t');
    const student = await actor('STUDENT', 'od-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS, dueAt: past }), ctx({ id: cls.id }));
    expect((await (await myClasses(req('GET', student.cookie))).json()).data.assignments[0].overdue).toBe(true);
    await db.lessonProgress.create({ data: { studentId: student.user.id, lessonId: INTEGERS, status: 'COMPLETED' } });
    expect((await (await myClasses(req('GET', student.cookie))).json()).data.assignments[0].overdue).toBe(false);
  });

  it('only allows published lessons and validates input', async () => {
    const teacher = await actor('TEACHER', 'val-t');
    const cls = await makeClass(teacher.cookie);
    const draft = await db.lesson.create({
      data: { authorId: teacher.user.id, title: 'Draft', subject: 'M', gradeLevel: '7', status: 'DRAFT' },
    });
    expect((await assignLesson(req('POST', teacher.cookie, { lessonId: draft.id }), ctx({ id: cls.id }))).status).toBe(404);
    expect((await assignLesson(req('POST', teacher.cookie, { lessonId: 'nope' }), ctx({ id: cls.id }))).status).toBe(404);
    expect((await assignLesson(req('POST', teacher.cookie, {}), ctx({ id: cls.id }))).status).toBe(400);
    expect(
      (await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS, dueAt: 'not a date' }), ctx({ id: cls.id }))).status,
    ).toBe(400);
  });

  it('re-assigning updates the due date instead of duplicating', async () => {
    const teacher = await actor('TEACHER', 'dup-t');
    const cls = await makeClass(teacher.cookie);
    await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }));
    const later = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS, dueAt: later }), ctx({ id: cls.id }));
    const rows = await db.assignment.findMany({ where: { classId: cls.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].dueAt?.toISOString()).toBe(later);
  });

  it('archiving hides the assignment from students but keeps their progress', async () => {
    const teacher = await actor('TEACHER', 'ar-t');
    const student = await actor('STUDENT', 'ar-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);
    await db.lessonProgress.create({ data: { studentId: student.user.id, lessonId: INTEGERS, status: 'IN_PROGRESS' } });
    const made = await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }));
    const assignmentId = (await made.json()).data.assignment.id as string;

    expect((await archiveAssignment(req('DELETE', teacher.cookie), ctx({ id: cls.id, assignmentId }))).status).toBe(200);
    expect((await (await myClasses(req('GET', student.cookie))).json()).data.assignments).toEqual([]);
    expect(await db.lessonProgress.count({ where: { studentId: student.user.id } })).toBe(1);
    expect((await archiveAssignment(req('DELETE', teacher.cookie), ctx({ id: cls.id, assignmentId: 'missing' }))).status).toBe(404);
  });

  it('students only see assignments from classes they belong to', async () => {
    const teacher = await actor('TEACHER', 'only-t');
    const member = await actor('STUDENT', 'only-m');
    const outsider = await actor('STUDENT', 'only-o');
    const cls = await makeClass(teacher.cookie);
    await join(member.cookie, cls.joinCode);
    await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }));
    expect((await (await myClasses(req('GET', outsider.cookie))).json()).data).toEqual({ classes: [], assignments: [] });
  });
});

describe('roster monitoring shows only real evidence', () => {
  it('reports zeros and no activity for a student who has done nothing', async () => {
    const teacher = await actor('TEACHER', 'ro-t');
    const student = await actor('STUDENT', 'ro-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);
    const detail = (await (await classDetail(req('GET', teacher.cookie), ctx({ id: cls.id }))).json()).data;
    expect(detail.summary).toEqual({ studentCount: 1, activeStudents: 0, needingAttention: 0 });
    expect(detail.students[0]).toMatchObject({
      displayName: student.user.displayName,
      lessonsCompleted: 0,
      practiceSessions: 0,
      questionsAnswered: 0,
      accuracy: null,
      unresolvedMistakes: 0,
      lastActive: null,
      needsAttention: [],
    });
  });

  it('reports each student’s own progress, accuracy and unreviewed mistakes', async () => {
    const teacher = await actor('TEACHER', 'rp-t');
    const a = await actor('STUDENT', 'rp-a');
    const b = await actor('STUDENT', 'rp-b');
    const cls = await makeClass(teacher.cookie);
    await join(a.cookie, cls.joinCode);
    await join(b.cookie, cls.joinCode);

    await db.lessonProgress.create({ data: { studentId: a.user.id, lessonId: INTEGERS, status: 'COMPLETED' } });
    const session = await db.practiceSession.create({
      data: { studentId: a.user.id, lessonId: INTEGERS, subject: 'M', topic: 'T', difficulty: 'Mixed', total: 4, correct: 3 },
    });
    for (let i = 0; i < 4; i += 1) {
      await db.practiceAnswer.create({
        data: { sessionId: session.id, question: `q${i}`, options: ['a', 'b'], correctIndex: 0, selectedIndex: 0, correct: i < 3 },
      });
    }
    await db.mistakeRecord.create({ data: { studentId: a.user.id, submittedAnswer: '1', resolved: false } });
    await db.mistakeRecord.create({ data: { studentId: a.user.id, submittedAnswer: '2', resolved: true } });

    const students = (await (await classDetail(req('GET', teacher.cookie), ctx({ id: cls.id }))).json()).data.students as Array<{
      id: string;
      lessonsCompleted: number;
      practiceSessions: number;
      questionsAnswered: number;
      accuracy: number | null;
      unresolvedMistakes: number;
      lastActive: string | null;
    }>;
    const rowA = students.find((s) => s.id === a.user.id)!;
    const rowB = students.find((s) => s.id === b.user.id)!;
    expect(rowA).toMatchObject({ lessonsCompleted: 1, practiceSessions: 1, questionsAnswered: 4, accuracy: 75, unresolvedMistakes: 1 });
    expect(rowA.lastActive).not.toBeNull();
    expect(rowB).toMatchObject({ lessonsCompleted: 0, practiceSessions: 0, accuracy: null, unresolvedMistakes: 0, lastActive: null });
  });

  it('flags a student who is still at "learning" after enough questions, with the reason', async () => {
    const teacher = await actor('TEACHER', 'at-t');
    const student = await actor('STUDENT', 'at-s');
    const cls = await makeClass(teacher.cookie);
    await join(student.cookie, cls.joinCode);
    const skill = await db.skill.findFirstOrThrow({ where: { code: 'G7-INT-ADD' } });
    await db.skillMastery.create({
      data: {
        studentId: student.user.id,
        skillId: skill.id,
        status: 'LEARNING',
        ruleCode: 'RULE_LOW_ACCURACY',
        attemptCount: 6,
        accuracy: 0.3,
        recentAccuracy: 0.2,
        consistency: 0.4,
        details: {},
        masteryVersion: 'MASTERY_V1',
      },
    });
    const detail = (await (await classDetail(req('GET', teacher.cookie), ctx({ id: cls.id }))).json()).data;
    expect(detail.summary.needingAttention).toBe(1);
    expect(detail.students[0].needsAttention[0]).toMatch(/adding integers after 6 questions/i);
  });

  it('does not include students from other classes', async () => {
    const teacher = await actor('TEACHER', 'inc-t');
    const mine = await actor('STUDENT', 'inc-mine');
    const theirs = await actor('STUDENT', 'inc-theirs');
    const cls = await makeClass(teacher.cookie);
    const otherCls = await makeClass((await actor('TEACHER', 'inc-o')).cookie);
    await join(mine.cookie, cls.joinCode);
    await join(theirs.cookie, otherCls.joinCode);
    const students = (await (await classDetail(req('GET', teacher.cookie), ctx({ id: cls.id }))).json()).data.students;
    expect(students.map((s: { id: string }) => s.id)).toEqual([mine.user.id]);
  });

  it('counts how many students completed each assignment', async () => {
    const teacher = await actor('TEACHER', 'cnt-t');
    const a = await actor('STUDENT', 'cnt-a');
    const b = await actor('STUDENT', 'cnt-b');
    const cls = await makeClass(teacher.cookie);
    await join(a.cookie, cls.joinCode);
    await join(b.cookie, cls.joinCode);
    await assignLesson(req('POST', teacher.cookie, { lessonId: INTEGERS }), ctx({ id: cls.id }));
    await db.lessonProgress.create({ data: { studentId: a.user.id, lessonId: INTEGERS, status: 'COMPLETED' } });
    const detail = (await (await classDetail(req('GET', teacher.cookie), ctx({ id: cls.id }))).json()).data;
    expect(detail.assignments[0]).toMatchObject({ completedCount: 1, memberCount: 2 });
  });
});
