/**
 * Tuklas 2.0 — Student dashboard data (master plan §2, §26).
 *
 * Everything shown on the student workspace is derived from the student's own rows.
 * Nothing here is a placeholder: with no activity the numbers are zero and there is no
 * "continue" lesson other than the first available one.
 */

import { db } from '../server/db';

export type DashboardLesson = {
  id: string;
  title: string;
  subject: string;
  estimatedMinutes: number | null;
  unitTitle: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
};

const DONE = new Set(['COMPLETED', 'MASTERED']);

export class DashboardService {
  static async getStudentDashboard(studentId: string) {
    const [progressRows, lessons, unresolvedMistakes, sessions] = await Promise.all([
      db.lessonProgress.findMany({
        where: { studentId },
        orderBy: { lastActivityAt: 'desc' },
        select: { lessonId: true, status: true, lastActivityAt: true },
      }),
      // The learning path: published, non-demo lessons in curriculum order.
      db.lesson.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [{ unitId: null }, { unit: { isDemo: false } }],
        },
        orderBy: [
          { unit: { term: { number: 'asc' } } },
          { unit: { position: 'asc' } },
          { position: 'asc' },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          title: true,
          subject: true,
          estimatedMinutes: true,
          unit: { select: { title: true } },
        },
      }),
      db.mistakeRecord.count({ where: { studentId, resolved: false } }),
      db.practiceSession.findMany({
        where: { studentId },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          total: true,
          correct: true,
          startedAt: true,
          completedAt: true,
          topic: true,
          lesson: { select: { id: true, title: true } },
        },
      }),
    ]);

    const statusByLesson = new Map(progressRows.map((row) => [row.lessonId, row.status]));
    const path: DashboardLesson[] = lessons.map((lesson) => {
      const status = statusByLesson.get(lesson.id);
      return {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        estimatedMinutes: lesson.estimatedMinutes,
        unitTitle: lesson.unit?.title ?? null,
        status: !status || status === 'NOT_STARTED' ? 'NOT_STARTED' : DONE.has(status) ? 'COMPLETED' : 'IN_PROGRESS',
      };
    });

    // Continue where they left off; otherwise the first lesson on the path not yet completed.
    const pathIds = new Set(path.map((lesson) => lesson.id));
    const lastActive = progressRows.find(
      (row) => pathIds.has(row.lessonId) && !DONE.has(row.status),
    );
    const continueLesson =
      (lastActive && path.find((lesson) => lesson.id === lastActive.lessonId)) ||
      path.find((lesson) => lesson.status !== 'COMPLETED') ||
      null;

    return {
      stats: {
        lessonsCompleted: path.filter((lesson) => lesson.status === 'COMPLETED').length,
        lessonsInProgress: path.filter((lesson) => lesson.status === 'IN_PROGRESS').length,
        lessonsAvailable: path.length,
        practiceSessions: await db.practiceSession.count({ where: { studentId } }),
        unresolvedMistakes,
      },
      continueLesson,
      path,
      recentSessions: sessions,
    };
  }
}
