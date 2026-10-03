/**
 * Tuklas 2.0 — Deterministic classification of integer-arithmetic mistakes (master plan §12).
 *
 * Given a question like "What is (−8) + 15?", the correct answer and the option the
 * student chose, decide WHAT kind of mistake it was by recomputing, not by keywords:
 *   - SIGN_ERROR:        the answer has the right size but the wrong sign
 *   - WRONG_OPERATION:   the choice equals the result of a different operation on the same numbers
 *   - IGNORED_SIGNS:     the choice is what you get by treating the numbers as if they had no signs
 *   - CALCULATION_ERROR: the choice is off by a small slip (±1, ±2, ±10)
 *   - CONCEPTUAL:        none of the above — the idea itself needs another look
 *   - UNCLASSIFIED:      the question is not a plain arithmetic expression, so no claim is made
 *
 * Every result carries the rule that produced it and a targeted tip, so the mistake can
 * lead to an intervention ("what should happen next?") and not just a record.
 */

import { parseNumericOption } from './question-validator';

export type MistakeCategory =
  | 'SIGN_ERROR'
  | 'WRONG_OPERATION'
  | 'IGNORED_SIGNS'
  | 'CALCULATION_ERROR'
  | 'CONCEPTUAL'
  | 'UNCLASSIFIED';

export type MistakeClassification = {
  category: MistakeCategory;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Machine-readable rule that fired, for audit and research. */
  rule: string;
  /** What the student likely did, in plain language. */
  observation: string;
  /** A targeted next step for the student. */
  tip: string;
};

export const MISTAKE_LABELS: Record<MistakeCategory, string> = {
  SIGN_ERROR: 'Sign error',
  WRONG_OPERATION: 'Used a different operation',
  IGNORED_SIGNS: 'Ignored the signs',
  CALCULATION_ERROR: 'Calculation slip',
  CONCEPTUAL: 'Concept to review',
  UNCLASSIFIED: 'Mistake',
};

type Operation = '+' | '-' | '*' | '/';

const EXPRESSION = /(\(?[−\-]?\d+\)?)\s*([+−\-×÷*/])\s*(\(?[−\-]?\d+\)?)/;

function toInt(text: string) {
  return Number(text.replace(/[−–—]/g, '-').replace(/[()\s]/g, ''));
}

function normalizeOperation(symbol: string): Operation {
  if (symbol === '+') return '+';
  if (symbol === '×' || symbol === '*') return '*';
  if (symbol === '÷' || symbol === '/') return '/';
  return '-';
}

function apply(op: Operation, a: number, b: number): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 || a % b !== 0 ? null : a / b;
  }
}

const OPERATION_NAME: Record<Operation, string> = {
  '+': 'added',
  '-': 'subtracted',
  '*': 'multiplied',
  '/': 'divided',
};

/** Extracts the operands and operation from a question such as "What is (−8) + 15?". */
export function parseIntegerQuestion(question: string) {
  const match = EXPRESSION.exec(question);
  if (!match) return null;
  return { a: toInt(match[1]), op: normalizeOperation(match[2]), b: toInt(match[3]) };
}

const unclassified = (rule: string): MistakeClassification => ({
  category: 'UNCLASSIFIED',
  confidence: 'LOW',
  rule,
  observation: 'This answer was not what the question asked for.',
  tip: 'Read the explanation, then try a similar question.',
});

export function classifyIntegerMistake(input: {
  question: string;
  selectedText: string;
  correctText: string;
}): MistakeClassification {
  const parsed = parseIntegerQuestion(input.question);
  if (!parsed) return unclassified('NOT_ARITHMETIC');

  const selected = parseNumericOption(input.selectedText);
  const correct = parseNumericOption(input.correctText);
  if (selected === null || correct === null) return unclassified('NON_NUMERIC_OPTION');
  if (selected === correct) return unclassified('NOT_A_MISTAKE');

  const { a, op, b } = parsed;

  // 1. Right size, wrong sign.
  if (correct !== 0 && selected === -correct) {
    return {
      category: 'SIGN_ERROR',
      confidence: 'HIGH',
      rule: 'SELECTED_IS_NEGATED_ANSWER',
      observation: `The number is the right size (${Math.abs(correct)}) but has the wrong sign.`,
      tip:
        op === '+' || op === '-'
          ? 'Check the sign at the end: on a number line, which direction did you end up from zero?'
          : 'Same signs give a positive result; different signs give a negative result. Count the negatives.',
    };
  }

  // 2. The result of a different operation on the same numbers.
  for (const other of ['+', '-', '*', '/'] as const) {
    if (other === op) continue;
    if (apply(other, a, b) === selected) {
      return {
        category: 'WRONG_OPERATION',
        confidence: 'HIGH',
        rule: `SELECTED_IS_RESULT_OF_${OPERATION_NAME[other].toUpperCase()}`,
        observation: `It looks like the numbers were ${OPERATION_NAME[other]} instead.`,
        tip:
          op === '-'
            ? 'Subtracting a number is the same as adding its opposite. Rewrite it as an addition first.'
            : 'Re-read the operation sign in the question before you start.',
      };
    }
  }

  // 3. Signs dropped: the result of the same or a related operation on |a| and |b|.
  const magnitudes = [apply(op, Math.abs(a), Math.abs(b)), Math.abs(a) + Math.abs(b), Math.abs(a) - Math.abs(b)];
  if (magnitudes.some((value) => value !== null && (selected === value || selected === -value))) {
    return {
      category: 'IGNORED_SIGNS',
      confidence: 'MEDIUM',
      rule: 'SELECTED_MATCHES_UNSIGNED_NUMBERS',
      observation: 'It looks like the negative signs were ignored when working this out.',
      tip: 'Circle each negative sign first. Decide what the signs do to the answer before you calculate the size.',
    };
  }

  // 4. A small slip.
  const difference = Math.abs(selected - correct);
  if (difference === 1 || difference === 2 || difference === 10) {
    return {
      category: 'CALCULATION_ERROR',
      confidence: 'MEDIUM',
      rule: `OFF_BY_${difference}`,
      observation: `The answer is off by ${difference}, which looks like an arithmetic slip.`,
      tip: 'Your idea may be right. Redo the calculation slowly and check each step.',
    };
  }

  // 5. Nothing mechanical explains it.
  return {
    category: 'CONCEPTUAL',
    confidence: 'LOW',
    rule: 'NO_MECHANICAL_PATTERN',
    observation: 'The answer does not match a common slip, so the idea itself may need another look.',
    tip: 'Re-read the lesson example for this skill, then try an easier question.',
  };
}
