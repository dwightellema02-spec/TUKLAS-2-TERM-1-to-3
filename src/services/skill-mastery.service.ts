/**
 * Tuklas 2.0 — Persistence of evidence-based skill mastery (master plan §14).
 *
 * Mastery is always RE-COMPUTED from the student's recorded answers by the pure rules in
 * `src/server/mastery.ts`; nothing here (and nothing the client sends) can set a level.
 */

import type { Prisma } from '@prisma/client';
import { db } from '../server/db';
import {
  buildEvidence,
  evaluateMastery,
  explainMastery,
  type Difficulty,
  type MasteryAttempt,
  type MasteryEvaluation,
  type MasteryExplanation,
  type MasteryFlags,
  type MasteryLevel,
} from '../server/mastery';
import { recommendNext } from '../server/adaptive';

type Tx = Prisma.TransactionClient;

const normalizeDifficulty = (value: string | null | undefined): Difficulty => {
  const upper = (value ?? '').toUpperCase();
  return upper === 'EASY' || upper === 'HARD' ? upper : 'MEDIUM';
};

export const LEVEL_ORDER: MasteryLevel[] = ['NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'];

export class SkillMasteryService {
  /**
   * The evidence for one student and skill: their LATEST answer to each distinct question,
   * oldest first. Retrying a question replaces the earlier answer, so repetition cannot
   * inflate a score, and correcting an old mistake improves it.
   */
  static async collectAttempts(client: Tx | typeof db, studentId: string, skillId: string): Promise<MasteryAttempt[]> {
    const answers = await client.practiceAnswer.findMany({
      where: {
        session: { studentId },
        practiceQuestion: { skillId },
      },
      select: {
        correct: true,
        answeredAt: true,
        questionId: true,
        practiceQuestion: { select: { id: true, quizQuestionId: true, difficulty: true } },
      },
      orderBy: { answeredAt: 'asc' },
    });

    // Keep the latest answer for each distinct question (bank question or one-off).
    const latest = new Map<string, (typeof answers)[number]>();
    for (const answer of answers) {
      const key = answer.practiceQuestion?.quizQuestionId ?? answer.questionId ?? answer.answeredAt.toISOString();
      latest.delete(key); // re-insert so insertion order follows recency
      latest.set(key, answer);
    }
    const ordered = [...latest.values()].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());

    const wrongQuestionIds = ordered
      .filter((a) => !a.correct && a.practiceQuestion)
      .map((a) => a.practiceQuestion!.id);
    const mistakes = wrongQuestionIds.length
      ? await client.mistakeRecord.findMany({
          where: { studentId, questionId: { in: wrongQuestionIds } },
          select: { questionId: true, category: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const categoryByQuestion = new Map(mistakes.map((m) => [m.questionId, m.category]));

    return ordered.map((answer) => ({
      correct: answer.correct,
      difficulty: normalizeDifficulty(answer.practiceQuestion?.difficulty),
      mistakeCategory: answer.correct ? null : categoryByQuestion.get(answer.practiceQuestion?.id ?? '') ?? null,
    }));
  }

  /** Re-evaluates and stores mastery for one skill; logs a history entry when the level changes. */
  static async recompute(client: Tx | typeof db, studentId: string, skillId: string): Promise<MasteryEvaluation> {
    const attempts = await this.collectAttempts(client, studentId, skillId);
    const evaluation = evaluateMastery(attempts);

    const previous = await client.skillMastery.findUnique({
      where: { studentId_skillId: { studentId, skillId } },
      select: { status: true },
    });

    const details = JSON.parse(
      JSON.stringify({
        evidence: evaluation.evidence,
        flags: evaluation.flags,
        explanation: evaluation.explanation,
        ruleDescription: evaluation.ruleDescription,
      }),
    ) as Prisma.InputJsonValue;

    const data = {
      status: evaluation.level,
      ruleCode: evaluation.ruleCode,
      attemptCount: evaluation.evidence.totalAttempts,
      accuracy: evaluation.evidence.overallAccuracy,
      recentAccuracy: evaluation.evidence.recentAccuracy,
      consistency: evaluation.evidence.consistencyScore,
      details,
      masteryVersion: evaluation.masteryVersion,
    };
    await client.skillMastery.upsert({
      where: { studentId_skillId: { studentId, skillId } },
      update: data,
      create: { studentId, skillId, ...data },
    });

    if (!previous || previous.status !== evaluation.level) {
      await client.skillMasteryHistory.create({
        data: {
          studentId,
          skillId,
          previousStatus: previous?.status ?? null,
          newStatus: evaluation.level,
          ruleCode: evaluation.ruleCode,
          summary: evaluation.ruleDescription,
          masteryVersion: evaluation.masteryVersion,
        },
      });
    }

    return evaluation;
  }

  /** Mastery of every skill the student has been assessed on, with explanations. */
  static async listForStudent(studentId: string, lessonId?: string) {
    const rows = await db.skillMastery.findMany({
      where: {
        studentId,
        ...(lessonId ? { skill: { quizQuestions: { some: { lessonId } } } } : {}),
      },
      include: { skill: { select: { id: true, code: true, name: true } } },
      orderBy: { skill: { name: 'asc' } },
    });

    return rows.map((row) => {
      const details = row.details as {
        explanation?: unknown;
        flags?: unknown;
        ruleDescription?: string;
      };
      return {
        skill: row.skill,
        status: row.status,
        attemptCount: row.attemptCount,
        accuracy: row.accuracy,
        recentAccuracy: row.recentAccuracy,
        consistency: row.consistency,
        ruleDescription: details.ruleDescription ?? '',
        flags: details.flags ?? {},
        explanation: details.explanation ?? null,
        updatedAt: row.updatedAt,
      };
    });
  }

  /** The skills of a lesson (those its practice questions are tagged with), for the student view. */
  static async skillsOfLesson(lessonId: string) {
    return db.skill.findMany({
      where: { quizQuestions: { some: { lessonId, assessmentId: null } } },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Everything the student needs to see for one lesson: each of its skills (including ones not
   * started yet), their level and plain-language explanation, and what to do next.
   */
  static async lessonPicture(studentId: string, lessonId: string) {
    const skills = await this.skillsOfLesson(lessonId);
    const rows = await db.skillMastery.findMany({
      where: { studentId, skillId: { in: skills.map((s) => s.id) } },
    });
    const byId = new Map(rows.map((row) => [row.skillId, row]));

    const items = skills.map((skill) => {
      const row = byId.get(skill.id);
      const details = (row?.details ?? {}) as { explanation?: MasteryExplanation; flags?: Partial<MasteryFlags> };
      const level: MasteryLevel = row?.status ?? 'NOT_STARTED';
      return {
        skill,
        status: level,
        attemptCount: row?.attemptCount ?? 0,
        accuracy: row?.accuracy ?? 0,
        explanation: details.explanation ?? explainMastery(level, buildEvidence([]), {
          recentPerformanceDecline: false,
          limitedDifficultyEvidence: true,
          repeatedSignErrors: false,
          repeatedConceptualMistakes: false,
        }),
        flags: details.flags ?? {},
      };
    });

    const recommendation = recommendNext(
      items.map((item) => ({
        skillId: item.skill.id,
        name: item.skill.name,
        level: item.status,
        flags: item.flags,
      })),
    );
    return { skills: items, recommendation };
  }

  static async history(studentId: string, skillId: string) {
    return db.skillMasteryHistory.findMany({
      where: { studentId, skillId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
