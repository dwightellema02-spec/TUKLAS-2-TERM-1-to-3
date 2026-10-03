/**
 * Tuklas 2.0 — Classes, enrollment, roster monitoring and assignments (master plan §20, §21).
 *
 * Authorization lives here, in one place: `requireClassAccess` is the only way a class is
 * loaded for a teacher/admin, so every route that uses it inherits the ownership rule.
 * A teacher asking for someone else's class gets "not found" (never "forbidden"), so class
 * IDs cannot be probed.
 */

import { randomInt } from 'node:crypto';
import { db } from '../server/db';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import type { UserRole } from '../types/domain';

export type Actor = { id: string; role: UserRole };

// No 0/O/1/I so a code read aloud or copied from a board is hard to get wrong.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateJoinCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

/** "abcd-2345", " ABCD 2345 " and "ABCD2345" are all the same code. */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatJoinCode(code: string | null): string | null {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : null;
}

const DONE_STATUSES = ['COMPLETED', 'MASTERED'];

export class ClassService {
  /** Loads a class the actor may manage: its teacher, or an admin. Anyone else gets NotFound. */
  static async requireClassAccess(classId: string, actor: Actor) {
    const found = await db.class.findUnique({
      where: { id: classId },
      include: { teacher: { select: { id: true, displayName: true } } },
    });
    if (!found || (actor.role !== 'ADMIN' && found.teacherId !== actor.id)) {
      throw new NotFoundError('Class not found.');
    }
    return found;
  }

  private static async uniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateJoinCode();
      if (!(await db.class.findUnique({ where: { joinCode: code }, select: { id: true } }))) return code;
    }
    throw new ConflictError('Could not generate a join code. Please try again.');
  }

  static async createClass(teacherId: string, name: string) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new ValidationError('Class name must be between 2 and 80 characters.');
    }
    const duplicate = await db.class.findFirst({
      where: { teacherId, name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError('You already have a class with that name.');

    const created = await db.class.create({
      data: { name: trimmed, teacherId, joinCode: await this.uniqueJoinCode() },
    });
    return this.present(created);
  }

  private static present<T extends { joinCode: string | null }>(row: T) {
    return { ...row, joinCode: formatJoinCode(row.joinCode) };
  }

  static async listClasses(actor: Actor) {
    const rows = await db.class.findMany({
      where: actor.role === 'ADMIN' ? {} : { teacherId: actor.id },
      include: {
        teacher: { select: { id: true, displayName: true } },
        _count: { select: { members: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.present(row));
  }

  static async rotateJoinCode(classId: string, actor: Actor) {
    await this.requireClassAccess(classId, actor);
    const updated = await db.class.update({
      where: { id: classId },
      data: { joinCode: await this.uniqueJoinCode() },
    });
    return this.present(updated);
  }

  static async closeJoining(classId: string, actor: Actor) {
    await this.requireClassAccess(classId, actor);
    const updated = await db.class.update({ where: { id: classId }, data: { joinCode: null } });
    return this.present(updated);
  }

  // ---------------------------------------------------------------- enrollment

  /** A student joins with a code. Invalid, rotated and closed codes all look the same. */
  static async joinByCode(studentId: string, rawCode: string) {
    const code = normalizeJoinCode(rawCode);
    const invalid = new NotFoundError('That join code is not valid. Check it with your teacher.');
    if (code.length !== CODE_LENGTH) throw invalid;

    const found = await db.class.findUnique({
      where: { joinCode: code },
      include: { teacher: { select: { displayName: true } } },
    });
    if (!found) throw invalid;

    const existing = await db.classMember.findUnique({
      where: { classId_userId: { classId: found.id, userId: studentId } },
    });
    if (!existing) {
      await db.classMember.create({ data: { classId: found.id, userId: studentId } });
    }
    return {
      class: { id: found.id, name: found.name, teacher: found.teacher.displayName },
      alreadyMember: Boolean(existing),
    };
  }

  /** A teacher adds an existing student account by email. */
  static async addMemberByEmail(classId: string, actor: Actor, email: string) {
    await this.requireClassAccess(classId, actor);
    const student = await db.user.findFirst({
      where: { email: email.trim().toLowerCase(), role: 'STUDENT', isActive: true },
      select: { id: true, displayName: true, email: true },
    });
    if (!student) throw new NotFoundError('No active student account was found with that email.');

    await db.classMember.upsert({
      where: { classId_userId: { classId, userId: student.id } },
      update: {},
      create: { classId, userId: student.id },
    });
    return student;
  }

  static async removeMember(classId: string, actor: Actor, userId: string) {
    await this.requireClassAccess(classId, actor);
    const result = await db.classMember.deleteMany({ where: { classId, userId } });
    if (result.count === 0) throw new NotFoundError('That student is not in this class.');
  }

  // ---------------------------------------------------------------- monitoring

  /**
   * The class roster with real activity per student. Every number comes from the student's
   * own rows; a student with no activity shows zeros and "no activity", never placeholders.
   */
  static async getClassDetail(classId: string, actor: Actor) {
    const cls = await this.requireClassAccess(classId, actor);

    const members = await db.classMember.findMany({
      where: { classId },
      include: { user: { select: { id: true, displayName: true, email: true, isActive: true } } },
      orderBy: { user: { displayName: 'asc' } },
    });
    const ids = members.map((member) => member.userId);

    const [progress, sessions, mistakes, mastery, assignments] = await Promise.all([
      db.lessonProgress.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, status: true, lastActivityAt: true },
      }),
      db.practiceSession.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, correct: true, startedAt: true, _count: { select: { answers: true } } },
      }),
      db.mistakeRecord.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids }, resolved: false },
        _count: { _all: true },
      }),
      db.skillMastery.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, status: true, attemptCount: true, skill: { select: { name: true } } },
      }),
      this.listAssignments(classId, actor),
    ]);

    const students = members.map((member) => {
      const id = member.userId;
      const myProgress = progress.filter((p) => p.studentId === id);
      const mySessions = sessions.filter((s) => s.studentId === id);
      const answered = mySessions.reduce((sum, s) => sum + s._count.answers, 0);
      const correct = mySessions.reduce((sum, s) => sum + s.correct, 0);
      const myMistakes = mistakes.find((m) => m.studentId === id)?._count._all ?? 0;
      const mySkills = mastery.filter((m) => m.studentId === id);

      const times = [
        ...myProgress.map((p) => p.lastActivityAt.getTime()),
        ...mySessions.map((s) => s.startedAt.getTime()),
      ];
      const attention: string[] = [];
      for (const skill of mySkills) {
        if (skill.status === 'LEARNING' && skill.attemptCount >= 4) {
          attention.push(`Still learning ${skill.skill.name.toLowerCase()} after ${skill.attemptCount} questions`);
        }
      }
      if (myMistakes >= 5) attention.push(`${myMistakes} mistakes not yet reviewed`);

      return {
        id,
        displayName: member.user.displayName,
        email: member.user.email,
        joinedAt: member.joinedAt,
        lessonsCompleted: myProgress.filter((p) => DONE_STATUSES.includes(p.status)).length,
        lessonsInProgress: myProgress.filter((p) => !DONE_STATUSES.includes(p.status) && p.status !== 'NOT_STARTED').length,
        practiceSessions: mySessions.length,
        questionsAnswered: answered,
        accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
        unresolvedMistakes: myMistakes,
        skills: mySkills.map((s) => ({ name: s.skill.name, status: s.status, attempts: s.attemptCount })),
        lastActive: times.length > 0 ? new Date(Math.max(...times)) : null,
        needsAttention: attention,
      };
    });

    return {
      class: this.present({
        id: cls.id,
        name: cls.name,
        joinCode: cls.joinCode,
        createdAt: cls.createdAt,
        teacher: cls.teacher,
      }),
      students,
      summary: {
        studentCount: students.length,
        activeStudents: students.filter((s) => s.lastActive !== null).length,
        needingAttention: students.filter((s) => s.needsAttention.length > 0).length,
      },
      assignments,
    };
  }

  // --------------------------------------------------------------- assignments

  static async assignLesson(classId: string, actor: Actor, lessonId: string, dueAt: Date | null) {
    await this.requireClassAccess(classId, actor);
    const lesson = await db.lesson.findFirst({
      where: { id: lessonId, status: 'PUBLISHED' },
      select: { id: true, title: true },
    });
    if (!lesson) throw new NotFoundError('Only published lessons can be assigned.');

    // The unique index cannot guard NULL student ids, so check for an existing class-wide assignment.
    const existing = await db.assignment.findFirst({ where: { classId, lessonId, studentId: null } });
    if (existing) {
      return db.assignment.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', dueAt },
      });
    }
    return db.assignment.create({ data: { classId, lessonId, dueAt, status: 'ACTIVE' } });
  }

  static async archiveAssignment(classId: string, actor: Actor, assignmentId: string) {
    await this.requireClassAccess(classId, actor);
    const result = await db.assignment.updateMany({
      where: { id: assignmentId, classId },
      data: { status: 'ARCHIVED' },
    });
    if (result.count === 0) throw new NotFoundError('Assignment not found.');
  }

  static async listAssignments(classId: string, actor: Actor) {
    await this.requireClassAccess(classId, actor);
    const [rows, memberCount] = await Promise.all([
      db.assignment.findMany({
        where: { classId, status: 'ACTIVE' },
        include: { lesson: { select: { id: true, title: true } } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      }),
      db.classMember.count({ where: { classId } }),
    ]);

    return Promise.all(
      rows.map(async (row) => {
        const completed = await db.lessonProgress.count({
          where: {
            lessonId: row.lessonId,
            status: { in: ['COMPLETED', 'MASTERED'] },
            student: { classMemberships: { some: { classId } } },
          },
        });
        return {
          id: row.id,
          lesson: row.lesson,
          dueAt: row.dueAt,
          createdAt: row.createdAt,
          completedCount: completed,
          memberCount,
        };
      }),
    );
  }

  // ------------------------------------------------------------ student's view

  /** The student's classes and the work their teachers assigned, with their own progress. */
  static async getStudentView(studentId: string) {
    const memberships = await db.classMember.findMany({
      where: { userId: studentId },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            teacher: { select: { displayName: true } },
            assignments: {
              where: { status: 'ACTIVE' },
              include: { lesson: { select: { id: true, title: true, status: true } } },
              orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const lessonIds = [
      ...new Set(memberships.flatMap((m) => m.class.assignments.map((a) => a.lessonId))),
    ];
    const progress = await db.lessonProgress.findMany({
      where: { studentId, lessonId: { in: lessonIds } },
      select: { lessonId: true, status: true },
    });
    const statusOf = (lessonId: string) => {
      const status = progress.find((p) => p.lessonId === lessonId)?.status;
      if (!status || status === 'NOT_STARTED') return 'NOT_STARTED' as const;
      return DONE_STATUSES.includes(status) ? ('COMPLETED' as const) : ('IN_PROGRESS' as const);
    };

    const now = Date.now();
    const assignments = memberships
      .flatMap((m) =>
        m.class.assignments
          .filter((a) => a.lesson.status === 'PUBLISHED')
          .map((a) => {
            const status = statusOf(a.lessonId);
            return {
              id: a.id,
              className: m.class.name,
              lesson: { id: a.lesson.id, title: a.lesson.title },
              dueAt: a.dueAt,
              status,
              overdue: status !== 'COMPLETED' && a.dueAt !== null && a.dueAt.getTime() < now,
            };
          }),
      )
      .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));

    return {
      classes: memberships.map((m) => ({
        id: m.class.id,
        name: m.class.name,
        teacher: m.class.teacher.displayName,
        joinedAt: m.joinedAt,
      })),
      assignments,
    };
  }
}
