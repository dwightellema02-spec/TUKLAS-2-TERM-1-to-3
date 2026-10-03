/**
 * Tuklas 2.0 — Server-side grading of lesson knowledge checks.
 *
 * Correctness is always decided here, from the stored answer key. The client only
 * sends what the student chose; it can never assert that it was right.
 */

import { normalizeText, parseNumericOption } from './question-validator';

export type CheckKey = {
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';
  options: unknown;
  correctIndex: number;
  correctAnswer: string | null;
};

export type CheckSubmission = {
  selectedIndex?: number;
  answer?: string;
};

export type CheckGrade =
  | { valid: true; correct: boolean }
  | { valid: false; reason: string };

export function gradeCheck(check: CheckKey, submission: CheckSubmission): CheckGrade {
  switch (check.questionType) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE': {
      const options = Array.isArray(check.options) ? check.options : [];
      const { selectedIndex } = submission;
      if (typeof selectedIndex !== 'number' || !Number.isInteger(selectedIndex)) {
        return { valid: false, reason: 'selectedIndex is required for this question.' };
      }
      if (selectedIndex < 0 || selectedIndex >= options.length) {
        return { valid: false, reason: 'selectedIndex must reference an existing option.' };
      }
      return { valid: true, correct: selectedIndex === check.correctIndex };
    }

    case 'NUMERIC': {
      if (typeof submission.answer !== 'string') {
        return { valid: false, reason: 'answer is required for this question.' };
      }
      const expected = parseNumericOption(check.correctAnswer ?? '');
      if (expected === null) {
        // A misconfigured key must fail closed: nobody can be marked correct.
        return { valid: true, correct: false };
      }
      const given = parseNumericOption(submission.answer);
      if (given === null) {
        return { valid: false, reason: 'answer must be a number.' };
      }
      return { valid: true, correct: Math.abs(given - expected) < 1e-9 };
    }

    case 'SHORT_ANSWER': {
      if (typeof submission.answer !== 'string') {
        return { valid: false, reason: 'answer is required for this question.' };
      }
      const expected = normalizeText(check.correctAnswer ?? '');
      const given = normalizeText(submission.answer);
      if (given.length === 0) {
        return { valid: false, reason: 'answer must not be empty.' };
      }
      // An empty/missing key must fail closed.
      return { valid: true, correct: expected.length > 0 && given === expected };
    }

    default:
      return { valid: false, reason: 'Unsupported question type.' };
  }
}
