/**
 * Tuklas 2.0 — A person's rights over their own data: download it, and delete the account (see docs/PRIVACY_AND_DATA.md).
 *
 * Export: everything Tuklas stores about the signed-in person, as JSON. Never the password hash, session tokens or other
 * people's data. Delete: students only, and only after the password is confirmed. Deleting a student removes their learning
 * records through the database's cascades (progress, practice, mistakes, mastery, conversations, reports, class membership).
 * Teachers and administrators own lessons and classes other people depend on, so their accounts are closed by an
 * administrator, not by a self-service button.
 */

import { db } from '../server/db';
import { verifyPassword } from '../server/auth';
import { AuthorizationError, ValidationError } from '../lib/errors';
import type { PublicUser } from '../types/domain';

export class AccountService {
  static async exportData(user: PublicUser) {
    const base = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        studentProfile: { select: { studentNumber: true, gradeLevel: true, section: true, schoolName: true, bio: true } },
        teacherProfile: { select: { department: true, title: true, specialization: true, schoolName: true, bio: true } },
      },
    });

    const [classes, progress, sessions, mistakes, mastery, conversations, reports, authored] = await Promise.all([
      db.classMember.findMany({ where: { userId: user.id }, select: { joinedAt: true, class: { select: { name: true } } } }),
      db.lessonProgress.findMany({ where: { studentId: user.id }, select: { status: true, lastActivityAt: true, lesson: { select: { title: true } } } }),
      db.practiceSession.findMany({
        where: { studentId: user.id },
        orderBy: { startedAt: 'asc' },
        select: {
          startedAt: true,
          completedAt: true,
          topic: true,
          total: true,
          correct: true,
          answers: { select: { question: true, options: true, selectedIndex: true, correctIndex: true, correct: true, skill: true, answeredAt: true } },
        },
      }),
      db.mistakeRecord.findMany({ where: { studentId: user.id }, select: { createdAt: true, submittedAnswer: true, correctReference: true, category: true, resolved: true } }),
      db.skillMastery.findMany({ where: { studentId: user.id }, select: { status: true, attemptCount: true, accuracy: true, updatedAt: true, skill: { select: { name: true } } } }),
      db.chatConversation.findMany({
        where: { studentId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          lesson: { select: { title: true } },
          messages: { orderBy: { createdAt: 'asc' }, select: { role: true, content: true, source: true, createdAt: true } },
        },
      }),
      db.replyReport.findMany({ where: { studentId: user.id }, select: { reason: true, note: true, createdAt: true } }),
      user.role === 'STUDENT' ? Promise.resolve([]) : db.lesson.findMany({ where: { authorId: user.id }, select: { title: true, status: true, createdAt: true } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      note: 'Everything Tuklas stores about you. It does not include your password or other people’s data.',
      account: base,
      classes: classes.map((row) => ({ name: row.class.name, joinedAt: row.joinedAt })),
      lessonProgress: progress.map((row) => ({ lesson: row.lesson.title, status: row.status, lastActivityAt: row.lastActivityAt })),
      practiceSessions: sessions,
      mistakes,
      skillMastery: mastery.map((row) => ({ skill: row.skill.name, status: row.status, attempts: row.attemptCount, accuracy: row.accuracy, updatedAt: row.updatedAt })),
      tutorConversations: conversations.map((row) => ({ startedAt: row.createdAt, lesson: row.lesson?.title ?? null, messages: row.messages })),
      repliesYouReported: reports,
      lessonsYouAuthored: authored,
    };
  }

  /** Student self-service deletion. Wrong password or missing confirmation changes nothing. */
  static async deleteStudentAccount(user: PublicUser, input: { password: string; confirm: string }) {
    if (user.role !== 'STUDENT') {
      throw new AuthorizationError('Teacher and administrator accounts are closed by an administrator. Ask yours to close it.');
    }
    if (input.confirm !== 'DELETE') throw new ValidationError('Type DELETE to confirm.');
    const stored = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!stored || !(await verifyPassword(input.password, stored.passwordHash))) {
      throw new ValidationError('That password is not correct.');
    }
    await db.user.delete({ where: { id: user.id } });
  }
}
