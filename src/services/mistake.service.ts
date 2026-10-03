/**
 * Tuklas 2.0 — Mistake Recording Domain Service
 *
 * Persists and manages diagnostic student mistake records, categorized misconceptions,
 * and review/resolution states.
 */

import { db } from '../server/db';
import { NotFoundError, AuthorizationError } from '../lib/errors';

export class MistakeService {
  /**
   * Retrieves mistake records for a student, strictly scoped to their user ID.
   */
  static async getStudentMistakes(
    studentId: string,
    filters?: {
      lessonId?: string;
      resolved?: boolean;
      limit?: number;
    },
  ) {
    const where: {
      studentId: string;
      lessonId?: string;
      resolved?: boolean;
    } = { studentId };

    if (filters?.lessonId) where.lessonId = filters.lessonId;
    if (typeof filters?.resolved === 'boolean') where.resolved = filters.resolved;

    return db.mistakeRecord.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 50,
    });
  }

  /**
   * Marks a mistake record as resolved by the student after review or targeted practice.
   */
  static async resolveMistake(mistakeId: string, studentId: string) {
    const mistake = await db.mistakeRecord.findUnique({
      where: { id: mistakeId },
    });

    if (!mistake) {
      throw new NotFoundError(`Mistake record with ID "${mistakeId}" not found.`);
    }

    if (mistake.studentId !== studentId) {
      throw new AuthorizationError('You are not authorized to modify another student’s mistake record.');
    }

    return db.mistakeRecord.update({
      where: { id: mistakeId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Records a student mistake from assessment or practice.
   */
  static async createMistake(data: {
    studentId: string;
    lessonId?: string;
    questionId?: string;
    assessmentAttemptId?: string;
    practiceSessionId?: string;
    submittedAnswer: string;
    correctReference?: string;
    category?: string;
    analysis?: string;
  }) {
    return db.mistakeRecord.create({
      data: {
        studentId: data.studentId,
        lessonId: data.lessonId,
        questionId: data.questionId,
        assessmentAttemptId: data.assessmentAttemptId,
        practiceSessionId: data.practiceSessionId,
        submittedAnswer: data.submittedAnswer,
        correctReference: data.correctReference,
        category: data.category ?? 'CONCEPTUAL',
        analysis: data.analysis,
        resolved: false,
      },
    });
  }
}
