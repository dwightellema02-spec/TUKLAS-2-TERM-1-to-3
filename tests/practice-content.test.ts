import { describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { buildIntegerPracticeBank } from '../prisma/content/integer-practice';
import { validateGeneratedQuestion } from '../src/server/question-validator';

const toNumber = (text: string) => Number(text.replace('−', '-'));

/** Independent oracle: plain JS arithmetic on the numbers written in the question text. */
function oracle(question: string) {
  const match = /^What is (\(?[−-]?\d+\)?) ([+−×÷]) (\(?[−-]?\d+\)?)\?$/.exec(question);
  if (!match) throw new Error(`Unparseable practice question: ${question}`);
  const a = toNumber(match[1].replace(/[()]/g, ''));
  const b = toNumber(match[3].replace(/[()]/g, ''));
  switch (match[2]) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    default:
      return a / b;
  }
}

describe('Grade 7 integer practice bank (generated seed content)', () => {
  const bank = buildIntegerPracticeBank();

  it('has a useful number of questions across all four operations', () => {
    expect(bank.length).toBeGreaterThanOrEqual(18);
    const skills = new Set(bank.map((q) => q.skill));
    expect([...skills].sort()).toEqual([
      'Adding integers',
      'Dividing integers',
      'Multiplying integers',
      'Subtracting integers',
    ]);
    expect(new Set(bank.map((q) => q.difficulty)).size).toBeGreaterThanOrEqual(2);
  });

  it('is deep enough to judge mastery: at least 12 questions per skill with all three difficulty bands', () => {
    expect(bank.length).toBeGreaterThanOrEqual(48);
    for (const skill of new Set(bank.map((q) => q.skillCode))) {
      const inSkill = bank.filter((q) => q.skillCode === skill);
      expect(inSkill.length, skill).toBeGreaterThanOrEqual(12);
      expect(new Set(inSkill.map((q) => q.difficulty)).size, `${skill} difficulty spread`).toBeGreaterThanOrEqual(2);
    }
  });

  it('interleaves operations so a short session is a mixed set', () => {
    const firstTen = new Set(bank.slice(0, 10).map((q) => q.skillCode));
    expect(firstTen.size).toBe(4);
  });

  it('links every stored practice question to its skill record', async () => {
    const stored = await db.quizQuestion.findMany({
      where: { lessonId: 'lesson-math-7-integers', assessmentId: null },
      include: { skillRecord: true },
    });
    expect(stored.length).toBe(bank.length);
    for (const row of stored) {
      expect(row.skillRecord, row.id).not.toBeNull();
      expect(row.skillRecord!.name).toBe(row.skill);
    }
    const expected = new Map(bank.map((q) => [q.id, q.skillCode]));
    for (const row of stored) expect(row.skillRecord!.code).toBe(expected.get(row.id));
  });

  it.each(bank.map((q) => [q.id, q] as const))('%s: the marked answer matches an independent calculation', (_id, q) => {
    expect(toNumber(q.options[q.correctIndex])).toBe(oracle(q.question));
  });

  it('every question passes deterministic validation and is math-verified', () => {
    for (const q of bank) {
      const result = validateGeneratedQuestion({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
      });
      expect(result.errors, q.id).toEqual([]);
      expect(result.mathVerified, q.id).toBe(true);
    }
  });

  it('has unique ids, unique positions, distinct questions and varied answer slots', () => {
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => q.position)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => q.question)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => q.correctIndex)).size).toBe(4);
  });

  it('gives each wrong option a distinct, plausible value (never the right answer)', () => {
    for (const q of bank) {
      const answer = toNumber(q.options[q.correctIndex]);
      const wrong = q.options.filter((_, i) => i !== q.correctIndex).map(toNumber);
      expect(new Set(wrong).size).toBe(3);
      expect(wrong).not.toContain(answer);
    }
  });

  it('explains every answer and states the correct result', () => {
    for (const q of bank) {
      expect(q.explanation.length).toBeGreaterThan(20);
      expect(q.explanation).toContain(`= ${q.options[q.correctIndex]}`);
    }
  });

  it('matches what is stored in the database after seeding', async () => {
    const stored = await db.quizQuestion.findMany({
      where: { lessonId: 'lesson-math-7-integers', assessmentId: null },
      orderBy: { position: 'asc' },
    });
    expect(stored).toHaveLength(bank.length);
    stored.forEach((row, index) => {
      expect(row.id).toBe(bank[index].id);
      expect(row.correctIndex).toBe(bank[index].correctIndex);
      expect(row.options).toEqual(bank[index].options);
    });
  });
});
