/**
 * Tuklas 2.0 — Mastery & Research Metrics Domain Service
 *
 * Persists and computes student competency mastery across the four core
 * research metrics: Understanding, Accuracy, Application, and Consistency.
 */

import { db } from '../server/db';

export class MasteryService {
  /**
   * Retrieves a student's mastery record for a specific subject and topic.
   */
  static async getMasteryRecord(studentId: string, subject: string, topic: string) {
    return db.masteryRecord.findUnique({
      where: {
        studentId_subject_topic: { studentId, subject, topic },
      },
    });
  }

  /**
   * Retrieves all mastery records for a student.
   */
  static async getStudentMasteryOverview(studentId: string) {
    return db.masteryRecord.findMany({
      where: { studentId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Updates mastery and research metrics based on authoritative assessment or practice performance.
   *
   * Formative Practice weights toward: Understanding and Application.
   * Summative Assessment weights toward: Accuracy and Consistency.
   */
  static async recordPerformance(
    studentId: string,
    subject: string,
    topic: string,
    performanceScore: number, // 0 - 100
    isAssessment = true,
  ) {
    const existing = await db.masteryRecord.findUnique({
      where: {
        studentId_subject_topic: { studentId, subject, topic },
      },
    });

    if (!existing) {
      const initialScore = Math.round(performanceScore);
      return db.masteryRecord.create({
        data: {
          studentId,
          subject,
          topic,
          mastery: initialScore,
          understanding: isAssessment ? Math.round(initialScore * 0.9) : initialScore,
          accuracy: initialScore,
          application: isAssessment ? initialScore : Math.round(initialScore * 0.85),
          consistency: initialScore,
        },
      });
    }

    // Weighted rolling updates based on actual activity
    const alpha = 0.3; // smoothing factor for new attempts
    const newAccuracy = Math.round(existing.accuracy * (1 - alpha) + performanceScore * alpha);
    const newUnderstanding = isAssessment
      ? existing.understanding
      : Math.round(existing.understanding * (1 - alpha) + performanceScore * alpha);
    const newApplication = Math.round(existing.application * (1 - alpha) + performanceScore * alpha);
    
    // Consistency reflects variance stability between attempts
    const deviation = Math.abs(performanceScore - existing.mastery);
    const consistencyDelta = deviation < 15 ? 5 : -5;
    const newConsistency = Math.max(0, Math.min(100, existing.consistency + consistencyDelta));

    const newMastery = Math.round(
      newUnderstanding * 0.25 + newAccuracy * 0.35 + newApplication * 0.25 + newConsistency * 0.15,
    );

    return db.masteryRecord.update({
      where: { id: existing.id },
      data: {
        mastery: newMastery,
        accuracy: newAccuracy,
        understanding: newUnderstanding,
        application: newApplication,
        consistency: newConsistency,
      },
    });
  }
}
