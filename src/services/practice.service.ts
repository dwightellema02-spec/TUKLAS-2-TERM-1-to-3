/**
 * Tuklas 2.0 — Practice & Adaptive Learning Domain Service
 *
 * Encapsulates practice session lifecycle, answer recording, session completion,
 * and adaptive difficulty calculations within database transactions.
 */

import { db } from '../server/db';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { z } from 'zod';

export type CreatePracticeSessionInput = {
  lessonId?: string;
  subject: string;
  topic: string;
  difficulty: string;
  type?: 'PRACTICE' | 'LESSON_QUIZ';
  total: number;
};

export class PracticeService {
  /**
   * Starts a new practice session for a verified student.
   */
  static async startSession(studentId: string, input: CreatePracticeSessionInput) {
    if (input.lessonId) {
      const lesson = await db.lesson.findFirst({
        where: { id: input.lessonId, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (!lesson) {
        throw new NotFoundError('Lesson not found.');
      }
    }

    return db.practiceSession.create({
      data: {
        studentId,
        lessonId: input.lessonId ?? null,
        subject: input.subject,
        topic: input.topic,
        difficulty: input.difficulty,
        type: input.type ?? 'PRACTICE',
        total: input.total,
      },
    });
  }

  /**
   * Submits an answer for an active practice question transactionally.
   */
  static async submitAnswer(
    studentId: string,
    sessionId: string,
    questionId: string,
    selectedIndex: number,
  ) {
    const practiceSession = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!practiceSession) {
      throw new NotFoundError('Practice session not found.');
    }

    if (practiceSession.studentId !== studentId) {
      throw new AuthorizationError('You are not authorized to submit answers for this session.');
    }

    const question = await db.practiceQuestion.findFirst({
      where: { id: questionId, sessionId: practiceSession.id },
    });

    if (!question) {
      throw new NotFoundError('Practice question not found.');
    }

    const options = z.array(z.string()).safeParse(question.options);
    if (!options.success) {
      throw new ValidationError('Practice question options format is invalid.');
    }

    if (selectedIndex >= options.data.length || selectedIndex < 0) {
      throw new ValidationError('selectedIndex must reference an existing option.');
    }

    const correct = selectedIndex === question.correctIndex;

    return db.$transaction(async (tx) => {
      if (practiceSession.completedAt) {
        throw new ConflictError('This practice session is already complete.');
      }

      const answerCount = await tx.practiceAnswer.count({
        where: { sessionId: practiceSession.id },
      });

      if (answerCount >= practiceSession.total) {
        throw new ConflictError('This practice session already has all answers recorded.');
      }

      const answer = await tx.practiceAnswer.create({
        data: {
          sessionId: practiceSession.id,
          questionId: question.id,
          question: question.question,
          options: options.data,
          correctIndex: question.correctIndex,
          selectedIndex,
          correct,
          skill: question.skill,
          explanation: question.explanation,
        },
      });

      const nextCorrect = practiceSession.correct + (correct ? 1 : 0);
      const isNowCompleted = answerCount + 1 >= practiceSession.total;

      const updatedSession = await tx.practiceSession.update({
        where: { id: practiceSession.id },
        data: {
          correct: nextCorrect,
          completedAt: isNowCompleted ? new Date() : null,
        },
      });

      return { answer, session: updatedSession };
    });
  }

  /**
   * Retrieves a student's practice session by ID.
   */
  static async getSession(sessionId: string, studentId: string) {
    const session = await db.practiceSession.findFirst({
      where: { id: sessionId, studentId },
      include: {
        answers: { orderBy: { answeredAt: 'asc' } },
        questions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) {
      throw new NotFoundError('Practice session not found.');
    }

    return session;
  }
}
