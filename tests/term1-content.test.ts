import { describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { buildTerm1Lessons } from '../prisma/content/term1-lessons';
import { validateGeneratedQuestion } from '../src/server/question-validator';

/** Independent oracle: re-derives each answer from the numbers WRITTEN IN THE QUESTION TEXT. */
const n = (text: string) => Number(text.replace(/[−]/g, '-').replace(/[₱°%,]|km\/h|km|hours?/g, '').trim());
const first = (text: string, re: RegExp) => {
  const match = re.exec(text);
  if (!match) throw new Error(`Unparseable: ${text}`);
  return match.slice(1);
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const ORACLES: Record<string, (question: string) => number | string> = {
  'G7-POLY-SUM': (q) => {
    const [sides] = first(q, /with (\d+) sides/);
    // A polygon splits into (sides − 2) triangles of 180°.
    return Array.from({ length: Number(sides) - 2 }).reduce<number>((total) => total + 180, 0);
  },
  'G7-POLY-REG': (q) => {
    const sides = Number(first(q, /with (\d+) sides/)[0]);
    const total = Array.from({ length: sides - 2 }).reduce<number>((t) => t + 180, 0);
    return total / sides;
  },
  'G7-POLY-EXT': (q) => {
    const angle = Number(first(q, /measures (\d+)°/)[0]);
    let sides = 0;
    for (let k = 3; k <= 360; k += 1) if (close(k * angle, 360)) sides = k;
    return sides;
  },
  'G7-PCT-CHANGE': (q) => {
    const [price, direction, rate] = first(q, /costs ₱(\d+)\. Its price (increases|decreases) by (\d+)%/);
    const part = (Number(price) / 100) * Number(rate);
    return direction === 'increases' ? Number(price) + part : Number(price) - part;
  },
  'G7-PCT-MONEY': (q) => {
    let m = /marked ₱(\d+).*?(\d+)% discount/.exec(q);
    if (m) return Number(m[1]) * (1 - Number(m[2]) / 100);
    m = /costs ₱(\d+) before a (\d+)% sales tax/.exec(q);
    if (m) return Number(m[1]) * (1 + Number(m[2]) / 100);
    m = /earns a (\d+)% commission on ₱(\d+)/.exec(q);
    if (m) return (Number(m[2]) * Number(m[1])) / 100;
    m = /₱(\d+) is deposited at (\d+)% simple interest per year for (\d+) years/.exec(q);
    if (m) return (Number(m[1]) * Number(m[2]) * Number(m[3])) / 100;
    throw new Error(`Unparseable money question: ${q}`);
  },
  'G7-RATE-SPEED': (q) => {
    let m = /travels (\d+) km in (\d+) hours/.exec(q);
    if (m) return Number(m[1]) / Number(m[2]);
    m = /moves at (\d+) km\/h for (\d+) hours/.exec(q);
    if (m) return Number(m[1]) * Number(m[2]);
    m = /covers (\d+) km at (\d+) km\/h/.exec(q);
    if (m) return Number(m[1]) / Number(m[2]);
    throw new Error(`Unparseable speed question: ${q}`);
  },
  'G7-RATE-UNIT': (q) => {
    let m = /(\d+) notebooks cost ₱(\d+)/.exec(q);
    if (m) return Number(m[2]) / Number(m[1]);
    m = /costs ₱(\d+) per kilogram.*do (\d+) kilograms/.exec(q);
    if (m) return Number(m[1]) * Number(m[2]);
    throw new Error(`Unparseable unit-rate question: ${q}`);
  },
  'G7-RAT-CONVERT': (q) => {
    let m = /Write (\d+)\/(\d+) as a decimal/.exec(q);
    if (m) return Number(m[1]) / Number(m[2]);
    m = /Write (\d+)\/(\d+) as a percent/.exec(q);
    if (m) return (Number(m[1]) * 100) / Number(m[2]);
    m = /Write ([\d.]+) as a percent/.exec(q);
    if (m) return Math.round(Number(m[1]) * 100 * 1e6) / 1e6;
    throw new Error(`Unparseable conversion: ${q}`);
  },
  'G7-RAT-OPS': (q) => {
    const m = /What is (\(?[−\d.-]+\)?) ([+−×÷]) (\(?[−\d.-]+\)?)\?/.exec(q);
    if (!m) throw new Error(`Unparseable: ${q}`);
    const a = n(m[1].replace(/[()]/g, ''));
    const b = n(m[3].replace(/[()]/g, ''));
    const value = m[2] === '+' ? a + b : m[2] === '−' ? a - b : m[2] === '×' ? a * b : a / b;
    return Math.round(value * 1e6) / 1e6;
  },
  'G7-ROOT-SQ': (q) => {
    const target = Number(first(q, /square root of (\d+)/)[0]);
    for (let r = 0; r <= 100; r += 1) if (r * r === target) return r;
    throw new Error('not a perfect square');
  },
  'G7-ROOT-CUBE': (q) => {
    const target = n(first(q, /cube root of (−?\d+)/)[0]);
    for (let r = -100; r <= 100; r += 1) if (r * r * r === target) return r;
    throw new Error('not a perfect cube');
  },
  'G7-ROOT-LOC': (q) => {
    const target = Number(first(q, /√(\d+)/)[0]);
    let low = 0;
    while ((low + 1) * (low + 1) <= target) low += 1;
    return `${low} and ${low + 1}`;
  },
};

const lessons = buildTerm1Lessons();
const allQuestions = lessons.flatMap((lesson) => lesson.bank.map((question) => ({ lesson, question })));

describe('Grade 7 Term 1 lessons (MATATAG first term)', () => {
  it('defines five lessons with sections, vocabulary, checks, objectives and skills', () => {
    expect(lessons).toHaveLength(5);
    for (const lesson of lessons) {
      expect(lesson.sections.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.vocabulary.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.checks, lesson.id).toHaveLength(2);
      expect(lesson.objectives.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.competency.code, lesson.id).toMatch(/^G7-T1-W\d+-/);
      const declared = new Set(lesson.skills.map((skill) => skill.code));
      for (const objective of lesson.objectives) for (const code of objective.skillCodes) expect(declared.has(code), code).toBe(true);
    }
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(5);
  });

  it('has an oracle for every skill and at least 12 questions per skill with a real difficulty spread', () => {
    for (const lesson of lessons) {
      for (const skill of lesson.skills) {
        expect(ORACLES[skill.code], skill.code).toBeDefined();
        const items = lesson.bank.filter((q) => q.skillCode === skill.code);
        expect(items.length, skill.code).toBeGreaterThanOrEqual(12);
        for (const band of ['EASY', 'MEDIUM', 'HARD']) {
          expect(items.filter((q) => q.difficulty === band).length, `${skill.code} ${band}`).toBeGreaterThanOrEqual(3);
        }
        expect(new Set(items.map((q) => q.correctIndex)).size, `${skill.code} answer slots`).toBe(4);
      }
    }
  });

  it('interleaves skills so a short session is mixed', () => {
    for (const lesson of lessons) {
      const prefix = new Set(lesson.bank.slice(0, lesson.skills.length).map((q) => q.skillCode));
      expect(prefix.size, lesson.id).toBe(lesson.skills.length);
    }
  });

  it.each(allQuestions.map(({ question }) => [question.id, question] as const))(
    '%s: the marked answer matches an independent calculation from the question text',
    (id, q) => {
      const expected = ORACLES[q.skillCode](q.question);
      const marked = q.options[q.correctIndex];
      if (typeof expected === 'string') expect(marked).toBe(expected);
      else expect(close(n(marked), expected), `${id}: marked "${marked}" but computed ${expected}`).toBe(true);
      // No other option may also equal the computed value.
      if (typeof expected === 'number') {
        const equal = q.options.filter((option) => close(n(option), expected));
        expect(equal, id).toHaveLength(1);
      }
    },
  );

  it('has unique ids, positions and question texts within each lesson, four distinct options, and real explanations', () => {
    const allIds = allQuestions.map(({ question }) => question.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const lesson of lessons) {
      expect(new Set(lesson.bank.map((q) => q.position)).size, lesson.id).toBe(lesson.bank.length);
      expect(new Set(lesson.bank.map((q) => q.question)).size, lesson.id).toBe(lesson.bank.length);
      for (const q of lesson.bank) {
        expect(new Set(q.options).size, q.id).toBe(4);
        expect(q.explanation.length, q.id).toBeGreaterThan(30);
        expect(q.explanation, q.id).toContain(q.options[q.correctIndex]);
      }
    }
  });

  it('passes deterministic validation; plain arithmetic items are math-verified by the validator', () => {
    let verified = 0;
    for (const { question: q } of allQuestions) {
      const result = validateGeneratedQuestion({ question: q.question, options: q.options, correctIndex: q.correctIndex });
      expect(result.errors, q.id).toEqual([]);
      if (result.mathVerified) verified += 1;
    }
    expect(verified).toBeGreaterThanOrEqual(12); // the decimal-operations bank
  });

  it('keeps wrong options plausible: never equal to the answer and never negative where an amount cannot be', () => {
    for (const { question: q } of allQuestions) {
      if (!/₱|km|hours|sides|°/.test(q.options.join(' '))) continue;
      for (const option of q.options) expect(n(option), `${q.id} ${option}`).toBeGreaterThan(0);
    }
  });

  it('keeps every knowledge check correct and distinct from the practice bank', () => {
    const bankQuestions = new Set(allQuestions.map(({ question }) => question.question));
    for (const lesson of lessons) {
      for (const item of lesson.checks) {
        expect(new Set(item.options).size, item.question).toBe(4);
        expect(item.explanation).toContain(item.options[item.correctIndex]);
        expect(bankQuestions.has(item.question)).toBe(false);
      }
    }
    const byQuestion = Object.fromEntries(lessons.flatMap((lesson) => lesson.checks).map((item) => [item.question, item.options[item.correctIndex]]));
    expect(byQuestion['What is the sum of the interior angles of a hexagon?']).toBe('720°');
    expect(byQuestion['How large is each interior angle of a regular octagon?']).toBe('135°');
    expect(byQuestion['A bag costs ₱600 and is sold at a 30% discount. What is the sale price?']).toBe('₱420');
    expect(byQuestion['A price of ₱250 increases by 20%. What is the new price?']).toBe('₱300');
    expect(byQuestion['A van travels 210 km in 3 hours. What is its average speed?']).toBe('70 km/h');
    expect(byQuestion['6 pens cost ₱126. What is the price of one pen?']).toBe('₱21');
    expect(byQuestion['Write 9/20 as a decimal.']).toBe('0.45');
    expect(byQuestion['What is (−2.5) + 4.75?']).toBe('2.25');
    expect(byQuestion['What is the square root of 196?']).toBe('14');
    expect(byQuestion['What is the cube root of −216?']).toBe('−6');
  });
});

describe('Grade 7 Term 1 content in the seeded database', () => {
  it('publishes the lessons under Term 1 units, each with its competency from the Budget of Work', async () => {
    for (const lesson of lessons) {
      const stored = await db.lesson.findUnique({
        where: { id: lesson.id },
        include: { unit: { include: { term: true } }, objectives: { include: { competency: true, skills: true } }, sections: true, vocabulary: true, checks: true },
      });
      expect(stored, lesson.id).not.toBeNull();
      expect(stored!.status).toBe('PUBLISHED');
      expect(stored!.unit?.term.number).toBe(1);
      expect(stored!.unit?.isDemo).toBe(false);
      expect(stored!.sections).toHaveLength(lesson.sections.length);
      expect(stored!.vocabulary).toHaveLength(lesson.vocabulary.length);
      expect(stored!.checks).toHaveLength(2);
      expect(stored!.objectives).toHaveLength(lesson.objectives.length);
      for (const objective of stored!.objectives) {
        expect(objective.competency?.code).toBe(lesson.competency.code);
        expect(objective.competency?.source).toContain('MATATAG');
        expect(objective.skills.length).toBeGreaterThan(0);
      }
    }
  });

  it('stores every practice question exactly as built, linked to its skill and learning objective', async () => {
    for (const lesson of lessons) {
      const stored = await db.quizQuestion.findMany({
        where: { lessonId: lesson.id, assessmentId: null },
        orderBy: { position: 'asc' },
        include: { skillRecord: true, learningObjective: { include: { skills: true } } },
      });
      expect(stored, lesson.id).toHaveLength(lesson.bank.length);
      stored.forEach((row, index) => {
        const built = lesson.bank[index];
        expect(row.id).toBe(built.id);
        expect(row.options).toEqual(built.options);
        expect(row.correctIndex).toBe(built.correctIndex);
        expect(row.skillRecord?.code).toBe(built.skillCode);
        // The objective a question points to must actually list that question's skill.
        expect(row.learningObjective?.skills.some((s) => s.skillId === row.skillId), row.id).toBe(true);
      });
    }
  });
});
