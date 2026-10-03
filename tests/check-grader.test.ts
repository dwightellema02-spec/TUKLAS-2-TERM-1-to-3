import { describe, expect, it } from 'vitest';
import { gradeCheck, type CheckKey } from '../src/server/check-grader';

const mc: CheckKey = {
  questionType: 'MULTIPLE_CHOICE',
  options: ['4', '10', '-4', '-10'],
  correctIndex: 1,
  correctAnswer: null,
};

describe('gradeCheck: multiple choice / true-false', () => {
  it('marks the keyed option correct and others wrong', () => {
    expect(gradeCheck(mc, { selectedIndex: 1 })).toEqual({ valid: true, correct: true });
    expect(gradeCheck(mc, { selectedIndex: 0 })).toEqual({ valid: true, correct: false });
    expect(gradeCheck(mc, { selectedIndex: 3 })).toEqual({ valid: true, correct: false });
  });

  it('rejects missing, non-integer and out-of-range selections', () => {
    expect(gradeCheck(mc, {}).valid).toBe(false);
    expect(gradeCheck(mc, { selectedIndex: 1.5 }).valid).toBe(false);
    expect(gradeCheck(mc, { selectedIndex: -1 }).valid).toBe(false);
    expect(gradeCheck(mc, { selectedIndex: 4 }).valid).toBe(false);
    expect(gradeCheck(mc, { answer: '10' }).valid).toBe(false);
  });

  it('grades true/false the same way', () => {
    const tf: CheckKey = { ...mc, questionType: 'TRUE_FALSE', options: ['True', 'False'], correctIndex: 1 };
    expect(gradeCheck(tf, { selectedIndex: 1 })).toEqual({ valid: true, correct: true });
    expect(gradeCheck(tf, { selectedIndex: 0 })).toEqual({ valid: true, correct: false });
  });

  it('treats malformed stored options as unanswerable instead of crashing', () => {
    expect(gradeCheck({ ...mc, options: null }, { selectedIndex: 0 }).valid).toBe(false);
  });
});

describe('gradeCheck: numeric', () => {
  const numeric: CheckKey = {
    questionType: 'NUMERIC',
    options: [],
    correctIndex: 0,
    correctAnswer: '-5',
  };

  it('accepts equivalent numeric forms', () => {
    expect(gradeCheck(numeric, { answer: '-5' })).toEqual({ valid: true, correct: true });
    expect(gradeCheck(numeric, { answer: ' −5 ' })).toEqual({ valid: true, correct: true });
    expect(gradeCheck(numeric, { answer: '-5.0' })).toEqual({ valid: true, correct: true });
  });

  it('marks different numbers wrong', () => {
    expect(gradeCheck(numeric, { answer: '5' })).toEqual({ valid: true, correct: false });
    expect(gradeCheck(numeric, { answer: '-5.01' })).toEqual({ valid: true, correct: false });
  });

  it('rejects non-numeric input rather than parsing a prefix', () => {
    expect(gradeCheck(numeric, { answer: '3abc' }).valid).toBe(false);
    expect(gradeCheck(numeric, { answer: 'x' }).valid).toBe(false);
    expect(gradeCheck(numeric, { answer: '' }).valid).toBe(false);
    expect(gradeCheck(numeric, {}).valid).toBe(false);
  });

  it('fails closed when the stored key is not a number', () => {
    expect(gradeCheck({ ...numeric, correctAnswer: null }, { answer: '0' })).toEqual({
      valid: true,
      correct: false,
    });
    expect(gradeCheck({ ...numeric, correctAnswer: 'five' }, { answer: '5' })).toEqual({
      valid: true,
      correct: false,
    });
  });
});

describe('gradeCheck: short answer', () => {
  const short: CheckKey = {
    questionType: 'SHORT_ANSWER',
    options: [],
    correctIndex: 0,
    correctAnswer: 'Absolute Value',
  };

  it('ignores case, spacing and punctuation', () => {
    expect(gradeCheck(short, { answer: 'absolute value' })).toEqual({ valid: true, correct: true });
    expect(gradeCheck(short, { answer: '  Absolute   Value! ' })).toEqual({ valid: true, correct: true });
  });

  it('marks other text wrong and rejects empty answers', () => {
    expect(gradeCheck(short, { answer: 'magnitude' })).toEqual({ valid: true, correct: false });
    expect(gradeCheck(short, { answer: '   ' }).valid).toBe(false);
    expect(gradeCheck(short, {}).valid).toBe(false);
  });

  it('fails closed when the stored key is empty', () => {
    expect(gradeCheck({ ...short, correctAnswer: '' }, { answer: 'anything' })).toEqual({
      valid: true,
      correct: false,
    });
    expect(gradeCheck({ ...short, correctAnswer: null }, { answer: 'anything' })).toEqual({
      valid: true,
      correct: false,
    });
  });
});
