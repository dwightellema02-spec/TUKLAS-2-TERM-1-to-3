import { describe, expect, it } from 'vitest';
import { buildIntegerPracticeBank } from '../prisma/content/integer-practice';
import { classifyIntegerMistake, parseIntegerQuestion } from '../src/server/mistake-classifier';

const classify = (question: string, selectedText: string, correctText: string) =>
  classifyIntegerMistake({ question, selectedText, correctText });

describe('parseIntegerQuestion', () => {
  it('reads operands and the operation from practice-style questions', () => {
    expect(parseIntegerQuestion('What is (−8) + 15?')).toEqual({ a: -8, op: '+', b: 15 });
    expect(parseIntegerQuestion('What is 7 − (−3)?')).toEqual({ a: 7, op: '-', b: -3 });
    expect(parseIntegerQuestion('What is (−5) − 8?')).toEqual({ a: -5, op: '-', b: 8 });
    expect(parseIntegerQuestion('What is (−6) × (−4)?')).toEqual({ a: -6, op: '*', b: -4 });
    expect(parseIntegerQuestion('What is (−36) ÷ (−6)?')).toEqual({ a: -36, op: '/', b: -6 });
    expect(parseIntegerQuestion('What is the value of (-8) + 15?')).toEqual({ a: -8, op: '+', b: 15 });
  });

  it('returns null when there is no arithmetic', () => {
    expect(parseIntegerQuestion('Which of the following is true about zero?')).toBeNull();
  });
});

describe('classifyIntegerMistake', () => {
  it('recognises a sign error', () => {
    const result = classify('What is (−8) + 15?', '−7', '7');
    expect(result).toMatchObject({ category: 'SIGN_ERROR', confidence: 'HIGH' });
    expect(result.observation).toContain('wrong sign');
  });

  it('recognises a sign error in multiplication with its own tip', () => {
    const result = classify('What is 7 × (−5)?', '35', '−35');
    expect(result.category).toBe('SIGN_ERROR');
    expect(result.tip).toMatch(/same signs/i);
  });

  it('recognises that a different operation was used, and which one', () => {
    const subtractedInstead = classify('What is (−8) + 15?', '−23', '7');
    expect(subtractedInstead).toMatchObject({ category: 'WRONG_OPERATION', rule: 'SELECTED_IS_RESULT_OF_SUBTRACTED' });

    const addedInstead = classify('What is 7 − (−3)?', '4', '10');
    expect(addedInstead.category).toBe('WRONG_OPERATION');
    expect(addedInstead.tip).toMatch(/opposite/i); // targeted at subtracting a negative

    expect(classify('What is (−3) × 8?', '5', '−24').category).toBe('WRONG_OPERATION');
  });

  it('recognises ignored signs', () => {
    const result = classify('What is (−8) + 15?', '23', '7');
    expect(result).toMatchObject({ category: 'IGNORED_SIGNS', confidence: 'MEDIUM' });
  });

  it('recognises a small calculation slip', () => {
    expect(classify('What is 25 + (−7)?', '17', '18')).toMatchObject({ category: 'CALCULATION_ERROR', rule: 'OFF_BY_1' });
    expect(classify('What is 25 + (−7)?', '28', '18')).toMatchObject({ category: 'CALCULATION_ERROR', rule: 'OFF_BY_10' });
  });

  it('falls back to a concept review when nothing mechanical explains the answer', () => {
    const result = classify('What is (−14) + 14?', '99', '0');
    expect(result).toMatchObject({ category: 'CONCEPTUAL', confidence: 'LOW' });
  });

  it('makes no claim about non-arithmetic or non-numeric questions', () => {
    expect(classify('Which statement about zero is true?', 'It is positive', 'It is neither').category).toBe('UNCLASSIFIED');
    expect(classify('What is (−8) + 15?', 'seven', '7').category).toBe('UNCLASSIFIED');
  });

  it('never calls a correct answer a mistake', () => {
    expect(classify('What is (−8) + 15?', '7', '7').rule).toBe('NOT_A_MISTAKE');
  });

  it('does not treat a sign flip of zero as a sign error', () => {
    expect(classify('What is (−14) + 14?', '0', '0').category).toBe('UNCLASSIFIED');
    expect(classify('What is (−14) + 14?', '28', '0').category).not.toBe('SIGN_ERROR');
  });

  it('always explains itself and offers a next step', () => {
    for (const result of [
      classify('What is (−8) + 15?', '−7', '7'),
      classify('What is (−8) + 15?', '23', '7'),
      classify('What is (−14) + 14?', '99', '0'),
    ]) {
      expect(result.rule.length).toBeGreaterThan(3);
      expect(result.observation.length).toBeGreaterThan(10);
      expect(result.tip.length).toBeGreaterThan(10);
    }
  });
});

describe('classification of every wrong option in the practice bank', () => {
  const bank = buildIntegerPracticeBank();

  it('classifies every distractor into a real category', () => {
    const seen = new Map<string, number>();
    for (const q of bank) {
      const correct = q.options[q.correctIndex];
      q.options.forEach((option, index) => {
        if (index === q.correctIndex) return;
        const result = classify(q.question, option, correct);
        expect(result.category, `${q.id} "${option}"`).not.toBe('UNCLASSIFIED');
        seen.set(result.category, (seen.get(result.category) ?? 0) + 1);
      });
    }
    // The bank was built to model sign errors, wrong operations and dropped signs.
    expect(seen.get('SIGN_ERROR') ?? 0).toBeGreaterThanOrEqual(bank.length - 1);
    expect(seen.get('WRONG_OPERATION') ?? 0).toBeGreaterThan(0);
    expect(seen.get('IGNORED_SIGNS') ?? 0).toBeGreaterThan(0);
  });

  it('never classifies the correct option as a mistake', () => {
    for (const q of bank) {
      const correct = q.options[q.correctIndex];
      expect(classify(q.question, correct, correct).rule, q.id).toBe('NOT_A_MISTAKE');
    }
  });
});
