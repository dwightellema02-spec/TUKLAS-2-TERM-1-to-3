import { describe, expect, it } from 'vitest';
import {
  evaluateArithmetic,
  extractExpression,
  parseNumericOption,
  validateGeneratedQuestion,
} from '../src/server/question-validator';

describe('evaluateArithmetic', () => {
  it.each([
    ['7 - 3', 4],
    ['7 − (−3)', 10],
    ['-8 + 5', -3],
    ['(-4) × (-6)', 24],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['12 ÷ 4', 3],
    ['-(3 + 2)', -5],
    ['0.5 + 0.25', 0.75],
  ])('computes %s = %s', (expression, expected) => {
    expect(evaluateArithmetic(expression)).toBeCloseTo(expected, 9);
  });

  it.each([
    '',
    '1 / 0',
    '2 +',
    '(3 + 4',
    '3 + 4)',
    'alert(1)',
    'process.exit()',
    '2x + 3',
    '1'.repeat(200),
    '((((((((((((((((((((((((1))))))))))))))))))))))))',
  ])('refuses to evaluate %j', (expression) => {
    expect(evaluateArithmetic(expression)).toBeNull();
  });
});

describe('extractExpression / parseNumericOption', () => {
  it('extracts expressions from standard question phrasing', () => {
    expect(extractExpression('What is 7 − (−3)?')).toBe('7 − (−3)');
    expect(extractExpression('Compute -8 + 5')).toBe('-8 + 5');
    // A sentence-ending period must not silently disable verification.
    expect(extractExpression('Evaluate: (-4) × (-6).')).toBe('(-4) × (-6)');
    expect(evaluateArithmetic(extractExpression('Evaluate: (-4) × (-6).') ?? '')).toBe(24);
  });

  it('does not treat dates, lone numbers or algebra as expressions', () => {
    expect(extractExpression('What is 2026?')).toBeNull();
    expect(extractExpression('Find 2x + 3')).toBeNull();
    expect(extractExpression('What process helps plants make food?')).toBeNull();
  });

  it('parses numeric options including unicode minus', () => {
    expect(parseNumericOption('7')).toBe(7);
    expect(parseNumericOption('−5')).toBe(-5);
    expect(parseNumericOption(' +3 ')).toBe(3);
    expect(parseNumericOption('2.50')).toBe(2.5);
    expect(parseNumericOption('seven')).toBeNull();
    expect(parseNumericOption('3abc')).toBeNull();
  });
});

describe('validateGeneratedQuestion', () => {
  const good = {
    question: 'What is 7 − (−3)?',
    options: ['4', '10', '-4', '-10'],
    correctIndex: 1,
  };

  it('accepts a correct arithmetic question and marks it math-verified', () => {
    const result = validateGeneratedQuestion(good);
    expect(result).toEqual({ ok: true, errors: [], mathVerified: true });
  });

  it('rejects a wrong marked answer (AI got the arithmetic wrong)', () => {
    const result = validateGeneratedQuestion({ ...good, correctIndex: 0 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/wrong; computed value is 10/);
  });

  it('rejects when no option equals the computed value', () => {
    const result = validateGeneratedQuestion({ ...good, options: ['4', '11', '-4', '-10'] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/No option equals/);
  });

  it('rejects when two options both equal the computed value', () => {
    const result = validateGeneratedQuestion({ ...good, options: ['10', '10.0', '-4', '-10'] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/More than one option/);
  });

  it('rejects non-numeric options on an arithmetic question', () => {
    const result = validateGeneratedQuestion({
      ...good,
      options: ['ten', '10', '-4', '-10'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate or empty options and out-of-range indexes', () => {
    expect(validateGeneratedQuestion({ ...good, options: ['4', '4', '-4', '-10'] }).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...good, options: ['4', '', '-4', '-10'] }).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...good, correctIndex: 4 }).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...good, correctIndex: -1 }).ok).toBe(false);
    expect(validateGeneratedQuestion({ ...good, options: ['1', '2', '3'] }).ok).toBe(false);
  });

  it('rejects options that differ only by case or spacing', () => {
    const result = validateGeneratedQuestion({
      question: 'Which process helps plants make food?',
      options: ['Photosynthesis', 'photosynthesis ', 'Digestion', 'Evaporation'],
      correctIndex: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/distinct/);
  });

  it('rejects a repeat of a prior question regardless of case and punctuation', () => {
    const result = validateGeneratedQuestion(good, {
      priorQuestions: ['what is 7 - (-3) ??'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects questions that give the answer away', () => {
    expect(
      validateGeneratedQuestion({
        question: 'The correct answer is 10. What is 7 − (−3)?',
        options: ['4', '10', '-4', '-10'],
        correctIndex: 1,
      }).ok,
    ).toBe(false);
    const leak = validateGeneratedQuestion({
      question: 'Photosynthesis lets plants make food from light. What is this process called?',
      options: ['Photosynthesis', 'Digestion', 'Evaporation', 'Condensation'],
      correctIndex: 0,
    });
    expect(leak.ok).toBe(false);
    expect(leak.errors.join(' ')).toMatch(/contains the correct option/);
  });

  it('accepts a non-arithmetic question but does not claim math verification', () => {
    const result = validateGeneratedQuestion({
      question: 'What process helps plants make food?',
      options: ['Photosynthesis', 'Digestion', 'Evaporation', 'Condensation'],
      correctIndex: 0,
    });
    expect(result).toEqual({ ok: true, errors: [], mathVerified: false });
  });

  it('does not misread an algebra question as multiplication', () => {
    const result = validateGeneratedQuestion({
      question: 'Find 2x + 3',
      options: ['6', '5x', '2x + 3', '8'],
      correctIndex: 2,
    });
    expect(result.mathVerified).toBe(false);
  });
});
