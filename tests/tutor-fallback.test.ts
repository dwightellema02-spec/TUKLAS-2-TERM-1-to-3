import { describe, expect, it } from 'vitest';
import { buildIntegerPracticeBank } from '../prisma/content/integer-practice';
import { automaticHint } from '../src/server/tutor/fallback';
import { statesValue } from '../src/server/tutor/guard';

const bank = buildIntegerPracticeBank();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('automatic hints never give away the answer to an open question', () => {
  it('for every bank question, at every rung, with every combination of flags', () => {
    for (const q of bank) {
      const answer = q.options[q.correctIndex];
      const bareAnswer = answer.replace('−', '-');
      for (let rung = 1; rung <= 6; rung += 1) {
        for (const changeStrategy of [false, true]) {
          for (const useDifferentExample of [false, true]) {
            const text = automaticHint({
              rung,
              question: q.question,
              changeStrategy,
              useDifferentExample,
              avoidValues: [answer],
            });
            const where = `${q.id} rung ${rung} strategy=${changeStrategy} example=${useDifferentExample}`;
            // Never an explicit result statement for the student's own problem.
            expect(text, where).not.toMatch(/answer is\b/i);
            expect(text, where).not.toMatch(new RegExp(`=\\s*[+]?${escape(bareAnswer)}(?![\\d.])`));
            expect(text.length, where).toBeGreaterThan(20);
          }
        }
      }
    }
  });

  it('does not use an example whose result equals a value that must be avoided', () => {
    // If the student's answer were +2, the first "add" example (…= +2) must not be used.
    const text = automaticHint({
      rung: 4,
      question: 'What is (−8) + 15?',
      useDifferentExample: true,
      avoidValues: ['2'],
    });
    expect(statesValue(text, '2')).toBe(false);
  });
});

describe('automatic hints follow the ladder', () => {
  const question = 'What is (−8) + 15?';

  it('rung 1 is a gentle nudge about the signs', () => {
    expect(automaticHint({ rung: 1, question })).toMatch(/signs/i);
  });

  it('rung 2 asks a guiding question', () => {
    expect(automaticHint({ rung: 2, question })).toMatch(/\?/);
  });

  it('rung 3 states the rule', () => {
    expect(automaticHint({ rung: 3, question })).toMatch(/rule to use/i);
  });

  it('rung 4 explains the concept with a different example', () => {
    const text = automaticHint({ rung: 4, question });
    expect(text).toMatch(/for example/i);
    expect(text).not.toContain('(−8) + 15');
  });

  it('rung 5 gives first steps on the student’s own numbers without the result', () => {
    const text = automaticHint({ rung: 5, question });
    expect(text).toContain('8');
    expect(text).toContain('15');
    expect(text).toMatch(/subtract the smaller size/i);
  });

  it('rung 6 is a worked example of different numbers', () => {
    const text = automaticHint({ rung: 6, question });
    expect(text).toMatch(/worked example/i);
    expect(text).not.toContain('(−8) + 15');
  });

  it('hints at different rungs are different (it does not repeat itself)', () => {
    const texts = [1, 2, 3, 4, 5, 6].map((rung) => automaticHint({ rung, question }));
    expect(new Set(texts).size).toBe(6);
  });

  it('changes approach (number line / groups) when the student says it did not work', () => {
    const normal = automaticHint({ rung: 2, question });
    const changed = automaticHint({ rung: 2, question, changeStrategy: true });
    expect(changed).not.toBe(normal);
    expect(changed).toMatch(/different way/i);
    expect(changed).toMatch(/number line/i);
  });
});

describe('other situations', () => {
  it('uses the diagnosis of the student’s own attempt at the early rungs', () => {
    const text = automaticHint({
      rung: 2,
      question: 'What is (−8) + 15?',
      diagnosis: { observation: 'The size of the number is right, but it has the wrong sign.', tip: 'Check the sign at the end.' },
    });
    expect(text).toContain('wrong sign');
    expect(text).toContain('Check the sign at the end.');
  });

  it('after the student has answered, shares the full explanation', () => {
    const text = automaticHint({ rung: 7, question: 'What is (−8) + 15?', answeredExplanation: '(−8) + 15 = 7.' });
    expect(text).toContain('(−8) + 15 = 7.');
  });

  it('falls back to lesson text for questions that are not integer arithmetic', () => {
    expect(automaticHint({ rung: 1, question: 'Which statement about zero is true?' })).toMatch(/question again/i);
    const withLesson = automaticHint({ rung: 4, question: 'Which statement about zero is true?', lessonExcerpt: 'Zero is neither positive nor negative.' });
    expect(withLesson).toContain('Your lesson explains');
    expect(withLesson).toContain('Zero is neither positive nor negative.');
    expect(automaticHint({ rung: 4, question: null })).toMatch(/open the lesson/i);
  });

  it('never claims to be an AI', () => {
    for (let rung = 1; rung <= 6; rung += 1) {
      expect(automaticHint({ rung, question: 'What is 3 + 4?' })).not.toMatch(/\bI\b|as an ai|tuklas says/i);
    }
  });
});
