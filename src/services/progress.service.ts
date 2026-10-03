/**
 * Tuklas 2.0 — Student Progress Domain Service
 *
 * Provides persistent progress tracking, completion status management,
 * and aggregated learning activity statistics.
 */

import { db } from '../server/db';
import { LessonProgressStatus } from '../types/domain';

export class ProgressService {
  /**
   * Retrieves student progress across all lessons or for a specific lesson.
   */
  static async getStudentProgress(studentId: string, lessonId?: string) {
    if (lessonId) {
      const progress = await db.lessonProgress.findUnique({
        where: {
          studentId_lessonId: { studentId, lessonId },
        },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              subject: true,
              gradeLevel: true,
              estimatedMinutes: true,
            },
          },
        },
      });

      return progress;
    }

    const [progressList, practiceCount, attempts] = await Promise.all([
      db.lessonProgress.findMany({
        where: { studentId },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              subject: true,
              gradeLevel: true,
            },
          },
        },
        orderBy: { lastActivityAt: 'desc' },
      }),
      db.practiceSession.count({ where: { studentId } }),
      db.quizAttempt.findMany({
        where: { studentId },
        select: { score: true, passed: true },
      }),
    ]);

    const completedCount = progressList.filter(
      (p) => p.status === 'COMPLETED' || p.status === 'MASTERED',
    ).length;
    const masteredCount = progressList.filter((p) => p.status === 'MASTERED').length;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const averageScore = attempts.length > 0 ? Math.round(totalScore / attempts.length) : 0;

    return {
      progress: progressList,
      summary: {
        totalLessonsTracked: progressList.length,
        completedCount,
        masteredCount,
        practiceSessionsCount: practiceCount,
        assessmentsTakenCount: attempts.length,
        averageAssessmentScore: averageScore,
      },
    };
  }

  /**
   * Updates or initiates progress on a lesson.
   */
  static async updateProgress(
    studentId: string,
    lessonId: string,
    data: {
      status?: LessonProgressStatus;
      latestScore?: number;
      bestScore?: number;
      masteryScore?: number;
      incrementPractice?: boolean;
      incrementAssessment?: boolean;
    },
  ) {
    const existing = await db.lessonProgress.findUnique({
      where: {
        studentId_lessonId: { studentId, lessonId },
      },
    });

    const now = new Date();
    const isComplete = data.status === 'COMPLETED' || data.status === 'MASTERED';

    if (existing) {
      const bestScore =
        typeof data.bestScore === 'number'
          ? Math.max(existing.bestScore ?? 0, data.bestScore)
          : existing.bestScore;

      return db.lessonProgress.update({
        where: { id: existing.id },
        data: {
          status: data.status ?? existing.status,
          latestScore: data.latestScore ?? existing.latestScore,
          bestScore,
          masteryScore: data.masteryScore ?? existing.masteryScore,
          practiceAttempts: data.incrementPractice
            ? { increment: 1 }
            : existing.practiceAttempts,
          assessmentAttempts: data.incrementAssessment
            ? { increment: 1 }
            : existing.assessmentAttempts,
          completedAt: isComplete ? (existing.completedAt ?? now) : existing.completedAt,
          lastActivityAt: now,
        },
      });
    }

    return db.lessonProgress.create({
      data: {
        studentId,
        lessonId,
        status: data.status ?? 'IN_PROGRESS',
        latestScore: data.latestScore,
        bestScore: data.bestScore ?? data.latestScore,
        masteryScore: data.masteryScore ?? 0,
        practiceAttempts: data.incrementPractice ? 1 : 0,
        assessmentAttempts: data.incrementAssessment ? 1 : 0,
        completedAt: isComplete ? now : null,
        startedAt: now,
        lastActivityAt: now,
      },
    });
  }
}
