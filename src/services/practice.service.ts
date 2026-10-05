/**
 * Tuklas 2.0 — Practice & Adaptive Learning Domain Service
 *
 * Encapsulates practice session lifecycle, answer recording, session completion,
 * and adaptive difficulty calculations within database transactions.
 *
 * Two kinds of session exist:
 *  - AI sessions: questions are generated one at a time by the AI (needs an AI key).
 *  - LESSON_BANK sessions: questions are copied from the lesson's own teacher-authored
 *    practice bank, so practice works without any AI.
 */

import { db } from '../server/db';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { z } from 'zod';
import { classifyIntegerMistake } from '../server/mistake-classifier';
import { LEVEL_ORDER, SkillMasteryService } from './skill-mastery.service';
import { difficultyDistance } from '../server/adaptive';
import type { Difficulty, MasteryLevel } from '../server/mastery';

const normalizeDifficulty = (value: string): Difficulty => {
  const upper = value.toUpperCase();
  return upper === 'EASY' || upper === 'HARD' ? upper : 'MEDIUM';
};

export type CreatePracticeSessionInput = {
  lessonId?: string;
  subject: string;
  topic: string;
  difficulty: string;
  type?: 'PRACTICE' | 'LESSON_QUIZ';
  total: number;
};

export type StartLessonBankSessionInput = {
  lessonId: string;
  /** Maximum number of questions (the session uses fewer if the bank is smaller). */
  total: number;
  /** Targeted practice: only questions that practise this skill. */
  skillId?: string;
};

/** Question types that are answered by choosing an option. */
const OPTION_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE'] as const;

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
   * Starts a practice session from the lesson's own practice bank (teacher-authored
   * questions that are not part of an assessment).
   *
   * Which questions are served: items the student got wrong most recently first, then
   * items they have never seen, then items they already answered correctly; ties are
   * broken by the lesson's own question order. Nothing here needs an AI.
   */
  static async startLessonBankSession(studentId: string, input: StartLessonBankSessionInput) {
    const lesson = await db.lesson.findFirst({
      where: { id: input.lessonId, status: 'PUBLISHED' },
      select: { id: true, title: true, subject: true },
    });
    if (!lesson) {
      throw new NotFoundError('Lesson not found.');
    }

    const bank = await db.quizQuestion.findMany({
      where: {
        lessonId: lesson.id,
        assessmentId: null,
        questionType: { in: [...OPTION_TYPES] },
        ...(input.skillId ? { skillId: input.skillId } : {}),
      },
      orderBy: { position: 'asc' },
    });
    if (bank.length === 0) {
      throw new ConflictError(
        input.skillId ? 'This lesson has no practice questions for that skill yet.' : 'This lesson has no practice questions yet.',
      );
    }

    // How this student has done on each bank question before (via their earlier copies).
    const history = await db.practiceAnswer.findMany({
      where: {
        practiceQuestion: {
          quizQuestionId: { in: bank.map((question) => question.id) },
          session: { studentId },
        },
      },
      select: { correct: true, answeredAt: true, practiceQuestion: { select: { quizQuestionId: true } } },
      orderBy: { answeredAt: 'asc' },
    });
    const lastResult = new Map<string, boolean>();
    for (const entry of history) {
      const sourceId = entry.practiceQuestion?.quizQuestionId;
      if (sourceId) lastResult.set(sourceId, entry.correct); // later answers overwrite earlier ones
    }
    const priority = (id: string) => (lastResult.get(id) === false ? 0 : lastResult.has(id) ? 2 : 1);

    // Adaptive difficulty: among questions of the same priority, prefer those closest to the
    // difficulty this student should be practicing for the question's skill (from mastery).
    const skillIds = [...new Set(bank.map((q) => q.skillId).filter((id): id is string => Boolean(id)))];
    const masteryRows = skillIds.length
      ? await db.skillMastery.findMany({
          where: { studentId, skillId: { in: skillIds } },
          select: { skillId: true, status: true },
        })
      : [];
    const levelBySkill = new Map(masteryRows.map((row) => [row.skillId, row.status as MasteryLevel]));
    const distance = (question: (typeof bank)[number]) =>
      difficultyDistance(
        normalizeDifficulty(question.difficulty),
        (question.skillId && levelBySkill.get(question.skillId)) || 'NOT_STARTED',
      );

    const ranked = [...bank].sort(
      (a, b) =>
        priority(a.id) - priority(b.id) || distance(a) - distance(b) || a.position - b.position,
    );

    // 1. Questions the student missed come back first.
    const missed = ranked.filter((question) => priority(question.id) === 0);
    const rest = ranked.filter((question) => priority(question.id) !== 0);

    // 2. The rest rotate across skills (weakest skill first) so a session stays mixed, and each
    //    skill offers its best-matching question (right priority and difficulty) next.
    const queues = new Map<string, typeof rest>();
    for (const question of rest) {
      const key = question.skillId ?? 'none';
      queues.set(key, [...(queues.get(key) ?? []), question]);
    }
    const levelRank = (key: string) => LEVEL_ORDER.indexOf(levelBySkill.get(key) ?? 'NOT_STARTED');
    const rotation = [...queues.keys()].sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b));
    const rotated: typeof rest = [];
    while (rotated.length < rest.length) {
      for (const key of rotation) {
        const next = queues.get(key)?.shift();
        if (next) rotated.push(next);
      }
    }

    const chosen = [...missed, ...rotated].slice(0, input.total);

    return db.$transaction(async (tx) => {
      const session = await tx.practiceSession.create({
        data: {
          studentId,
          lessonId: lesson.id,
          subject: lesson.subject,
          topic: lesson.title,
          difficulty: 'Mixed',
          type: 'PRACTICE',
          total: chosen.length,
        },
      });

      await tx.practiceQuestion.createMany({
        data: chosen.map((question, index) => ({
          sessionId: session.id,
          position: index,
          quizQuestionId: question.id,
          question: question.question,
          questionType: question.questionType,
          options: question.options as never,
          correctIndex: question.correctIndex,
          correctAnswer: question.correctAnswer,
          skill: question.skill,
          explanation: question.explanation,
          lessonId: lesson.id,
          learningObjectiveId: question.learningObjectiveId,
          skillId: question.skillId,
          purpose: 'REINFORCEMENT' as const,
          difficulty: question.difficulty,
        })),
      });

      return session;
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

      // Every wrong answer becomes a reviewable mistake for the student. The category is
      // generic until the mistake engine classifies it (master plan §12).
      if (!correct) {
        const submittedAnswer = options.data[selectedIndex];
        const correctReference = options.data[question.correctIndex] ?? null;
        const classification = classifyIntegerMistake({
          question: question.question,
          selectedText: submittedAnswer,
          correctText: correctReference ?? '',
        });
        // What happened, what to do next, and why the right answer is right.
        const analysis = [classification.observation, classification.tip, question.explanation]
          .filter(Boolean)
          .join(' ');
        await tx.mistakeRecord.create({
          data: {
            studentId,
            lessonId: practiceSession.lessonId,
            questionId: question.id,
            practiceSessionId: practiceSession.id,
            submittedAnswer,
            correctReference,
            category: classification.category,
            analysis,
          },
        });
      }

      // Mastery is recomputed from recorded evidence in the same transaction, so an answer
      // and the level it produces are saved together (or not at all).
      if (question.skillId) {
        await SkillMasteryService.recompute(tx, studentId, question.skillId);
      }

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

  /**
   * The view of a session that is safe to send to the student's browser: the answer key
   * and explanation of a question are included only once that question has been answered.
   */
  static async getSessionForStudent(sessionId: string, studentId: string) {
    const session = await db.practiceSession.findFirst({
      where: { id: sessionId, studentId },
      include: {
        lesson: { select: { id: true, title: true } },
        answers: true,
        questions: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!session) {
      throw new NotFoundError('Practice session not found.');
    }

    const answerByQuestion = new Map(
      session.answers.filter((a) => a.questionId).map((a) => [a.questionId as string, a]),
    );

    return {
      id: session.id,
      lesson: session.lesson,
      topic: session.topic,
      total: session.total,
      correct: session.correct,
      answeredCount: session.answers.length,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      questions: session.questions.map((question) => {
        const answer = answerByQuestion.get(question.id);
        return {
          id: question.id,
          position: question.position,
          question: question.question,
          options: question.options,
          skill: question.skill,
          difficulty: question.difficulty,
          answered: answer
            ? {
                selectedIndex: answer.selectedIndex,
                correct: answer.correct,
                correctIndex: answer.correctIndex,
                explanation: answer.explanation,
              }
            : null,
        };
      }),
    };
  }

  /** The student's most recent sessions (for the dashboard). */
  static async listRecentSessions(studentId: string, limit = 5) {
    return db.practiceSession.findMany({
      where: { studentId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        topic: true,
        total: true,
        correct: true,
        startedAt: true,
        completedAt: true,
        lesson: { select: { id: true, title: true } },
      },
    });
  }
}
