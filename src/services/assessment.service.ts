/**
 * Tuklas 2.0 — Assessment Domain Service
 *
 * Implements server-authoritative assessment scoring, safe student projections,
 * mistake recording, and transactional student progress updates.
 */

import { db } from '../server/db';
import { UserRole } from '../types/domain';
import { NotFoundError, ValidationError } from '../lib/errors';

export interface AnswerSubmission {
  questionId: string;
  selectedIndex?: number;
  textAnswer?: string;
  numericAnswer?: number;
}

export interface AssessmentSubmissionData {
  answers: AnswerSubmission[];
}

export class AssessmentService {
  /**
   * Retrieves an assessment by ID with role-aware anti-cheating projection.
   * Students never receive correct answers or explanations.
   */
  static async getAssessmentById(assessmentId: string, role: UserRole) {
    const assessment = await db.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            subject: true,
            gradeLevel: true,
            status: true,
          },
        },
        questions: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundError(`Assessment with ID "${assessmentId}" not found.`);
    }

    if (role === 'STUDENT') {
      return {
        ...assessment,
        questions: assessment.questions.map((question) => {
          const safe = { ...question };
          delete (safe as Partial<typeof question>).correctIndex;
          delete (safe as Partial<typeof question>).correctAnswer;
          delete (safe as Partial<typeof question>).explanation;
          return safe;
        }),
      };
    }

    return assessment;
  }

  /**
   * Evaluates an assessment submission authoritatively on the server.
   * Executes within an atomic database transaction.
   */
  static async submitAssessment(
    assessmentId: string,
    studentId: string,
    submission: AssessmentSubmissionData,
  ) {
    const assessment = await db.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundError(`Assessment with ID "${assessmentId}" not found.`);
    }

    if (assessment.status !== 'PUBLISHED') {
      throw new ValidationError('Assessment is not currently published for submissions.');
    }

    const { questions } = assessment;
    if (questions.length === 0) {
      throw new ValidationError('Assessment contains no questions to evaluate.');
    }

    // Map questions by ID for authoritative evaluation
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Transactional evaluation and persistence
    return db.$transaction(async (tx) => {
      let correctCount = 0;
      const totalCount = questions.length;
      const gradedAnswers: {
        questionId: string;
        selectedIndex?: number;
        textAnswer?: string;
        numericAnswer?: number;
        isCorrect: boolean;
        score: number;
        question: typeof questions[0];
      }[] = [];

      for (const ans of submission.answers) {
        const question = questionMap.get(ans.questionId);
        if (!question) continue;

        let isCorrect = false;
        if (question.questionType === 'MULTIPLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
          isCorrect = typeof ans.selectedIndex === 'number' && ans.selectedIndex === question.correctIndex;
        } else if (question.questionType === 'SHORT_ANSWER') {
          isCorrect =
            Boolean(question.correctAnswer) &&
            Boolean(ans.textAnswer) &&
            ans.textAnswer!.trim().toLowerCase() === question.correctAnswer!.trim().toLowerCase();
        } else if (question.questionType === 'NUMERIC') {
          isCorrect =
            typeof ans.numericAnswer === 'number' &&
            Number(question.correctAnswer) === ans.numericAnswer;
        }

        if (isCorrect) correctCount++;

        gradedAnswers.push({
          questionId: question.id,
          selectedIndex: ans.selectedIndex,
          textAnswer: ans.textAnswer,
          numericAnswer: ans.numericAnswer,
          isCorrect,
          score: isCorrect ? 1 : 0,
          question,
        });
      }

      const scorePercentage = Math.round((correctCount / totalCount) * 100);
      const passed = scorePercentage >= assessment.passingScore;

      // 1. Create QuizAttempt record
      const attempt = await tx.quizAttempt.create({
        data: {
          studentId,
          lessonId: assessment.lessonId,
          assessmentId: assessment.id,
          correct: correctCount,
          total: totalCount,
          score: scorePercentage,
          passed,
          completedAt: new Date(),
        },
      });

      // 2. Create AssessmentAnswer records
      for (const graded of gradedAnswers) {
        await tx.assessmentAnswer.create({
          data: {
            attemptId: attempt.id,
            questionId: graded.questionId,
            selectedIndex: graded.selectedIndex,
            textAnswer: graded.textAnswer,
            numericAnswer: graded.numericAnswer,
            isCorrect: graded.isCorrect,
            score: graded.score,
          },
        });

        // 3. Create MistakeRecord for incorrect answers
        if (!graded.isCorrect) {
          const submittedStr =
            typeof graded.selectedIndex === 'number'
              ? `Option ${graded.selectedIndex}`
              : graded.textAnswer ?? String(graded.numericAnswer ?? 'No answer');
          const correctStr =
            typeof graded.question.correctIndex === 'number'
              ? `Option ${graded.question.correctIndex}`
              : graded.question.correctAnswer ?? 'Reference answer';

          await tx.mistakeRecord.create({
            data: {
              studentId,
              lessonId: assessment.lessonId,
              questionId: graded.questionId,
              assessmentAttemptId: attempt.id,
              submittedAnswer: submittedStr,
              correctReference: correctStr,
              category: 'CONCEPTUAL',
              resolved: false,
            },
          });
        }
      }

      // 4. Update LessonProgress atomically
      const existingProgress = await tx.lessonProgress.findUnique({
        where: {
          studentId_lessonId: {
            studentId,
            lessonId: assessment.lessonId,
          },
        },
      });

      const nextStatus = passed
        ? scorePercentage >= 95
          ? ('MASTERED' as const)
          : ('COMPLETED' as const)
        : ('NEEDS_PRACTICE' as const);

      if (existingProgress) {
        const bestScore = Math.max(existingProgress.bestScore ?? 0, scorePercentage);
        await tx.lessonProgress.update({
          where: { id: existingProgress.id },
          data: {
            assessmentAttempts: { increment: 1 },
            latestScore: scorePercentage,
            bestScore,
            status: nextStatus,
            masteryScore: bestScore / 100,
            completedAt: passed ? (existingProgress.completedAt ?? new Date()) : existingProgress.completedAt,
            lastActivityAt: new Date(),
          },
        });
      } else {
        await tx.lessonProgress.create({
          data: {
            studentId,
            lessonId: assessment.lessonId,
            status: nextStatus,
            latestScore: scorePercentage,
            bestScore: scorePercentage,
            practiceAttempts: 0,
            assessmentAttempts: 1,
            masteryScore: scorePercentage / 100,
            completedAt: passed ? new Date() : null,
            lastActivityAt: new Date(),
          },
        });
      }

      return {
        attemptId: attempt.id,
        assessmentId: assessment.id,
        lessonId: assessment.lessonId,
        correct: correctCount,
        total: totalCount,
        score: scorePercentage,
        passed,
        passingScore: assessment.passingScore,
        completedAt: attempt.completedAt,
        details: gradedAnswers.map((g) => ({
          questionId: g.questionId,
          isCorrect: g.isCorrect,
        })),
      };
    }, { maxWait: 15000, timeout: 20000 });
  }
}
