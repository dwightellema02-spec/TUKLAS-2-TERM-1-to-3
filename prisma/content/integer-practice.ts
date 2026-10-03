/**
 * Grade 7 Integers practice bank (Operations on Integers).
 *
 * Every answer is COMPUTED with the deterministic evaluator, never typed by hand, and
 * every distractor models a common integer mistake (sign error, wrong operation,
 * dropped sign, magnitude slip). Tests re-validate the whole bank with
 * `validateGeneratedQuestion` and an independent calculation.
 *
 * Operations are interleaved so any prefix of the bank is a mixed set.
 */

import { evaluateArithmetic } from '../../src/server/question-validator';

type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export type PracticeSeedQuestion = {
  id: string;
  position: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  skill: string;
  skillCode: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
};

/** The four skills practiced in "Operations on Integers" (curriculum skill records). */
export const INTEGER_SKILLS: Record<Operation, { code: string; name: string; description: string }> = {
  add: {
    code: 'G7-INT-ADD',
    name: 'Adding integers',
    description: 'Add integers with the same or different signs.',
  },
  subtract: {
    code: 'G7-INT-SUB',
    name: 'Subtracting integers',
    description: 'Subtract integers, including subtracting a negative number.',
  },
  multiply: {
    code: 'G7-INT-MUL',
    name: 'Multiplying integers',
    description: 'Multiply integers using the sign rules.',
  },
  divide: {
    code: 'G7-INT-DIV',
    name: 'Dividing integers',
    description: 'Divide integers using the sign rules.',
  },
};

const SYMBOL: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
};

// Each skill has 12 pairs in a repeating EASY, MEDIUM, HARD pattern (4 of each), so any
// prefix of the bank is a mixed set and the adaptive selection always has a real choice.
// Difficulty is computed from the numbers (see `hurdles` below), not hand-labelled.
const PAIRS: Record<Operation, Array<[number, number]>> = {
  add: [[3, -2], [-8, 15], [-3, -11], [9, -4], [12, -19], [-20, 35], [7, 8], [-6, -9], [-17, -9], [-3, 5], [-14, 14], [-25, -30]],
  subtract: [[9, 4], [7, -3], [-10, -4], [2, 5], [-5, 8], [-18, -5], [3, 8], [12, -9], [-11, -6], [6, 9], [3, 11], [14, -14]],
  multiply: [[-3, 8], [-6, -4], [-15, -2], [7, -5], [-9, -2], [-13, -12], [4, -2], [-8, -7], [-12, -11], [5, 6], [11, -3], [-14, -5]],
  divide: [[8, 2], [-8, 2], [-36, -6], [9, 3], [9, -3], [48, -8], [6, 3], [54, 6], [-45, -9], [8, 4], [-6, 3], [-56, 7]],
};

const ORDER: Operation[] = ['add', 'subtract', 'multiply', 'divide'];

const show = (n: number) => (n < 0 ? `(−${Math.abs(n)})` : String(n));
const fmt = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

function expressionFor(op: Operation, a: number, b: number) {
  // Plain-ASCII twin of the displayed expression, evaluated deterministically.
  return `(${a}) ${op === 'add' ? '+' : op === 'subtract' ? '-' : op === 'multiply' ? '*' : '/'} (${b})`;
}

function distractors(op: Operation, a: number, b: number, answer: number): number[] {
  const candidates: number[] = [-answer]; // sign error
  if (op === 'add') candidates.push(Math.abs(a) + Math.abs(b), a - b, -(Math.abs(a) + Math.abs(b)));
  if (op === 'subtract') candidates.push(a + b, b - a, -(a + b));
  if (op === 'multiply') candidates.push(a + b, Math.abs(answer), -Math.abs(answer));
  if (op === 'divide') candidates.push(a - b, Math.abs(answer), a + b);
  candidates.push(answer + 1, answer - 1, answer + 10, answer - 10);

  const picked: number[] = [];
  for (const value of candidates) {
    if (value !== answer && !picked.includes(value)) picked.push(value);
    if (picked.length === 3) break;
  }
  return picked;
}

function explain(op: Operation, a: number, b: number, answer: number) {
  const base = `${show(a)} ${SYMBOL[op]} ${show(b)} = ${fmt(answer)}.`;
  switch (op) {
    case 'add':
      return Math.sign(a) === Math.sign(b) || a === 0 || b === 0
        ? `Same signs: add the absolute values and keep the sign. ${base}`
        : `Different signs: subtract the smaller absolute value from the larger and keep the sign of the larger one. ${base}`;
    case 'subtract':
      return `Subtracting a number is the same as adding its opposite: ${show(a)} − ${show(b)} = ${show(a)} + ${show(-b)}. ${base}`;
    case 'multiply':
      return `Same signs give a positive product; different signs give a negative product. ${base}`;
    case 'divide':
      return `Same signs give a positive quotient; different signs give a negative quotient. ${base}`;
  }
}

export function buildIntegerPracticeBank(): PracticeSeedQuestion[] {
  // Round-robin over the four operations so every prefix is a mixed set.
  const items: Array<[Operation, number, number]> = [];
  const rounds = PAIRS.add.length;
  for (let round = 0; round < rounds; round += 1) {
    for (const op of ORDER) {
      const [a, b] = PAIRS[op][round];
      items.push([op, a, b]);
    }
  }

  return items.map(([op, a, b], index) => {
    const answer = evaluateArithmetic(expressionFor(op, a, b));
    if (answer === null || !Number.isInteger(answer)) {
      throw new Error(`Practice item ${index} did not evaluate to an integer.`);
    }
    const wrong = distractors(op, a, b, answer);
    if (wrong.length !== 3) throw new Error(`Practice item ${index} needs 3 distractors.`);

    // Rotate the correct option's slot so the answer is not always in the same place.
    const correctIndex = index % 4;
    const options: string[] = [];
    let wrongCursor = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      options.push(slot === correctIndex ? fmt(answer) : fmt(wrong[wrongCursor++]));
    }

    // Difficulty = number of hurdles: negative operands, two-digit operands, and the
    // operations that students find harder (subtraction and division).
    const hurdles =
      [a, b].filter((n) => n < 0).length +
      (Math.max(Math.abs(a), Math.abs(b)) >= 10 ? 1 : 0) +
      (op === 'subtract' || op === 'divide' ? 1 : 0);
    return {
      id: `practice-int-${String(index + 1).padStart(3, '0')}`,
      position: 100 + index,
      question: `What is ${show(a)} ${SYMBOL[op]} ${show(b)}?`,
      options,
      correctIndex,
      explanation: explain(op, a, b, answer),
      skill: INTEGER_SKILLS[op].name,
      skillCode: INTEGER_SKILLS[op].code,
      difficulty: hurdles <= 1 ? 'EASY' : hurdles === 2 ? 'MEDIUM' : 'HARD',
    };
  });
}
