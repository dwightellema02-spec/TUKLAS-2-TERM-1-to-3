/**
 * Tuklas 2.0 — Teachers author practice questions for their own lessons (master plan §8, §10; owner phase F).
 *
 * Practice questions are the lesson's PRACTICE BANK: QuizQuestion rows with no assessment. Students practise from
 * them (adaptive selection, mistakes, mastery) and the tutor sees the teacher's misconception notes. Only the
 * lesson's author or an administrator may manage them. Every question is checked before it is stored: four distinct
 * options, one right answer, an explanation, and, when the question is plain arithmetic, the marked answer must equal the
 * computed value (the teacher is told whether it was machine-verified).
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../server/db';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';
import { normalizeText, validateGeneratedQuestion } from '../server/question-validator';
import type { Actor } from './class.service';

export const MAX_BANK_QUESTIONS = 60;
export const BANK_POSITION_START = 100;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

/** Request shape for creating or replacing a practice question (limits are enforced again in the service). */
export const practiceQuestionSchema = z.object({
  question: z.string().max(2_000),
  options: z.array(z.string().max(1_000)).max(8),
  correctIndex: z.number().int(),
  explanation: z.string().max(5_000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  skill: z.string().max(300),
  misconceptionTags: z.array(z.string().max(300)).max(20).optional(),
});

export type PracticeQuestionInput = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: (typeof DIFFICULTIES)[number];
  skill: string;
  misconceptionTags?: string[];
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'skill';

function cleanInput(raw: PracticeQuestionInput): PracticeQuestionInput {
  const question = raw.question.trim();
  const options = raw.options.map((option) => option.trim());
  const skill = raw.skill.trim().replace(/\s+/g, ' ');
  const tags = [...new Set((raw.misconceptionTags ?? []).map((tag) => tag.trim().replace(/\s+/g, ' ')).filter(Boolean))];

  if (question.length < 5 || question.length > 600) throw new ValidationError('The question must be between 5 and 600 characters.');
  if (options.length !== 4 || options.some((option) => option.length < 1 || option.length > 200)) {
    throw new ValidationError('Give exactly four choices, each up to 200 characters.');
  }
  if (new Set(options.map(normalizeText)).size !== 4) throw new ValidationError('The four choices must all be different.');
  if (!Number.isInteger(raw.correctIndex) || raw.correctIndex < 0 || raw.correctIndex > 3) {
    throw new ValidationError('Mark which choice is correct.');
  }
  const explanation = raw.explanation.trim();
  if (explanation.length < 10 || explanation.length > 1_000) {
    throw new ValidationError('Explain why the answer is right (10 to 1000 characters). Students see it after they answer.');
  }
  if (skill.length < 2 || skill.length > 80) throw new ValidationError('Name the skill this question practises (2 to 80 characters).');
  if (!DIFFICULTIES.includes(raw.difficulty)) throw new ValidationError('Choose a difficulty: easy, medium or hard.');
  if (tags.length > 5 || tags.some((tag) => tag.length > 60)) throw new ValidationError('At most 5 misconception notes of 60 characters each.');
  return { question, options, correctIndex: raw.correctIndex, explanation, difficulty: raw.difficulty, skill, misconceptionTags: tags };
}

/** The teacher's skill name becomes a real Skill record (existing one reused by name, or a new teacher skill). */
async function resolveSkill(name: string) {
  const existing = await db.skill.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = `TCH-${slug(name)}${attempt === 0 ? '' : `-${randomBytes(2).toString('hex')}`}`;
    if (!(await db.skill.findUnique({ where: { code } }))) {
      return db.skill.create({ data: { code, name, description: 'Created by a teacher while authoring practice questions.' } });
    }
  }
  throw new ValidationError('That skill name could not be saved. Try a slightly different name.');
}

const present = (row: {
  id: string;
  question: string;
  options: unknown;
  correctIndex: number;
  explanation: string;
  difficulty: string;
  skill: string | null;
  position: number;
  misconceptionTags: string[];
}) => ({
  id: row.id,
  question: row.question,
  options: row.options as string[],
  correctIndex: row.correctIndex,
  explanation: row.explanation,
  difficulty: row.difficulty,
  skill: row.skill,
  position: row.position,
  misconceptionTags: row.misconceptionTags,
});

export class PracticeAuthoringService {
  private static async requireLessonControl(lessonId: string, actor: Actor) {
    const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, authorId: true } });
    if (!lesson) throw new NotFoundError('Lesson not found.');
    if (actor.role !== 'ADMIN' && lesson.authorId !== actor.id) {
      throw new AuthorizationError('You are not authorized to manage this lesson.');
    }
    return lesson;
  }

  private static bankWhere(lessonId: string) {
    return { lessonId, assessmentId: null, questionType: 'MULTIPLE_CHOICE' as const };
  }

  static async list(lessonId: string, actor: Actor) {
    await this.requireLessonControl(lessonId, actor);
    const rows = await db.quizQuestion.findMany({ where: this.bankWhere(lessonId), orderBy: { position: 'asc' } });
    return rows.map(present);
  }

  private static check(input: PracticeQuestionInput, priorQuestions: string[]) {
    const verdict = validateGeneratedQuestion(
      { question: input.question, options: input.options, correctIndex: input.correctIndex },
      { priorQuestions },
    );
    if (!verdict.ok) throw new ValidationError(verdict.errors[0] ?? 'This question could not be saved.');
    return verdict.mathVerified;
  }

  static async create(lessonId: string, actor: Actor, raw: PracticeQuestionInput) {
    await this.requireLessonControl(lessonId, actor);
    const input = cleanInput(raw);
    const bank = await db.quizQuestion.findMany({ where: this.bankWhere(lessonId), select: { position: true, question: true } });
    if (bank.length >= MAX_BANK_QUESTIONS) {
      throw new ValidationError(`A lesson can have at most ${MAX_BANK_QUESTIONS} practice questions. Remove one first.`);
    }
    const mathVerified = this.check(input, bank.map((row) => row.question));
    const skill = await resolveSkill(input.skill);
    const position = Math.max(BANK_POSITION_START - 1, ...bank.map((row) => row.position)) + 1;

    const row = await db.quizQuestion.create({
      data: {
        lessonId,
        position,
        question: input.question,
        options: input.options,
        correctIndex: input.correctIndex,
        explanation: input.explanation,
        difficulty: input.difficulty,
        skill: skill.name,
        skillId: skill.id,
        misconceptionTags: input.misconceptionTags ?? [],
        purpose: 'REINFORCEMENT',
        questionType: 'MULTIPLE_CHOICE',
        assessmentId: null,
      },
    });
    return { question: present(row), mathVerified };
  }

  static async update(lessonId: string, questionId: string, actor: Actor, raw: PracticeQuestionInput) {
    await this.requireLessonControl(lessonId, actor);
    const existing = await db.quizQuestion.findFirst({ where: { id: questionId, ...this.bankWhere(lessonId) } });
    if (!existing) throw new NotFoundError('Practice question not found.');
    const input = cleanInput(raw);
    const others = await db.quizQuestion.findMany({
      where: { ...this.bankWhere(lessonId), id: { not: questionId } },
      select: { question: true },
    });
    const mathVerified = this.check(input, others.map((row) => row.question));
    const skill = await resolveSkill(input.skill);
    const row = await db.quizQuestion.update({
      where: { id: questionId },
      data: {
        question: input.question,
        options: input.options,
        correctIndex: input.correctIndex,
        explanation: input.explanation,
        difficulty: input.difficulty,
        skill: skill.name,
        skillId: skill.id,
        misconceptionTags: input.misconceptionTags ?? [],
      },
    });
    return { question: present(row), mathVerified };
  }

  static async remove(lessonId: string, questionId: string, actor: Actor) {
    await this.requireLessonControl(lessonId, actor);
    const result = await db.quizQuestion.deleteMany({ where: { id: questionId, ...this.bankWhere(lessonId) } });
    if (result.count === 0) throw new NotFoundError('Practice question not found.');
  }
}
