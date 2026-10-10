import { describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { buildTerm1Lessons } from '../prisma/content/term1-lessons';
import { buildTerm1WeeklyLessons, CONVEX_CASES, WEEKLY_UNIT } from '../prisma/content/term1-weekly';
import { validateGeneratedQuestion } from '../src/server/question-validator';

/**
 * Independent oracle: re-derives each answer from the numbers WRITTEN IN THE QUESTION TEXT, with different code from
 * the generators in prisma/content/term1-weekly.ts. A wrong generator cannot pass by being wrong the same way twice.
 */
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const firstNumber = (text: string) => {
  const match = /[\d.]+/.exec(text.replace(/,/g, ''));
  if (!match) throw new Error(`No number in: ${text}`);
  return Number(match[0]);
};
const grab = (text: string, re: RegExp) => {
  const match = re.exec(text);
  if (!match) throw new Error(`Unparseable: ${text}`);
  return match.slice(1);
};
const NAMES = ['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon']; // 3..10 sides

const ORACLES: Record<string, (q: string) => number | string> = {
  // ---- Week 1
  'G7-W1-NAME': (q) => {
    const forward = /A polygon has (\d+) sides/.exec(q);
    if (forward) return NAMES[Number(forward[1]) - 3];
    return NAMES.indexOf(grab(q, /does an? (\w+) have/)[0]) + 3;
  },
  'G7-W1-PERIM': (q) => {
    const [n, s] = grab(q, /has (\d+) sides, each (\d+) cm long/).map(Number);
    let total = 0;
    for (let i = 0; i < n; i += 1) total += s; // add the sides one by one
    return total;
  },
  'G7-W1-CENTRAL': (q) => {
    const n = Number(grab(q, /with (\d+) sides inside a circle/)[0]);
    for (let angle = 1; angle <= 360; angle += 1) if (angle * n === 360) return angle;
    throw new Error('no whole-degree central angle');
  },
  // ---- Week 2
  'G7-W2-COMPSUPP': (q) => {
    const [kind, x] = grab(q, /are (complementary|supplementary)\. One measures (\d+)°/);
    return (kind === 'complementary' ? 90 : 180) - Number(x);
  },
  'G7-W2-VERTLIN': (q) => {
    const x = Number(grab(q, /One of the angles measures (\d+)°/)[0]);
    if (/directly opposite/.test(q)) return x;
    if (/right next to it/.test(q)) return 180 - x;
    throw new Error(`Unparseable: ${q}`);
  },
  'G7-W2-CONVEX': (q) => {
    const angles = [...q.matchAll(/(\d+)°/g)].map((m) => Number(m[1]));
    const n = angles.length;
    // The list must really be the angles of an n-sided polygon.
    expect(angles.reduce((a, b) => a + b, 0), q).toBe((n - 2) * 180);
    return angles.some((a) => a > 180) ? 'Non-convex polygon' : 'Convex polygon';
  },
  // ---- Week 3
  'G7-W3-EXTADJ': (q) => 180 - Number(grab(q, /measures (\d+)°/)[0]),
  'G7-W3-MISSING': (q) => {
    const [n, others, total] = grab(q, /has (\d+) sides\. Its other (\d+) interior angles add up to (\d+)°/).map(Number);
    expect(others, q).toBe(n - 1);
    // Cut into triangles from one corner: n − 2 of them, 180° each.
    let sum = 0;
    for (let t = 0; t < n - 2; t += 1) sum += 180;
    return sum - total;
  },
  'G7-W3-REGANGLE': (q) => {
    const exterior = /A regular polygon has (\d+) sides\. What is the measure of each exterior angle/.exec(q);
    if (exterior) return 360 / Number(exterior[1]);
    const x = Number(grab(q, /Each interior angle of a regular polygon measures (\d+)°/)[0]);
    return 360 / (180 - x);
  },
  // ---- Week 4
  'G7-W4-PCTINC': (q) => {
    const [a, b] = grab(q, /rises from (\d+) to (\d+)/).map(Number);
    return ((b - a) * 100) / a;
  },
  'G7-W4-PCTDEC': (q) => {
    const [a, b] = grab(q, /drops from ₱(\d+) to ₱(\d+)/).map(Number);
    return ((a - b) * 100) / a;
  },
  'G7-W4-ORIGINAL': (q) => {
    const [p, kind, b] = grab(q, /After a (\d+)% (increase|decrease), the price of a \w+ is ₱(\d+)/);
    const factor = kind === 'increase' ? 1 + Number(p) / 100 : 1 - Number(p) / 100;
    return Number(b) / factor;
  },
  // ---- Week 5
  'G7-W5-ORIGPRICE': (q) => {
    const [s, r] = grab(q, /sold for ₱(\d+) after a (\d+)% discount/).map(Number);
    return s / (1 - r / 100);
  },
  'G7-W5-INTEREST': (q) => {
    let m = /simple interest on ₱(\d+) at (\d+)% per year for (\d+) years/.exec(q);
    if (m) return (Number(m[1]) * Number(m[2]) * Number(m[3])) / 100;
    m = /invested at (\d+)% simple interest per year to earn ₱(\d+) in (\d+) years/.exec(q);
    if (m) return (Number(m[2]) * 100) / (Number(m[1]) * Number(m[3]));
    m = /₱(\d+) earns ₱(\d+) in simple interest in (\d+) years/.exec(q);
    if (m) return (Number(m[2]) * 100) / (Number(m[1]) * Number(m[3]));
    m = /loan of ₱(\d+) at (\d+)% simple interest per year costs ₱(\d+) in interest/.exec(q);
    if (m) return (Number(m[3]) * 100) / (Number(m[1]) * Number(m[2]));
    throw new Error(`Unparseable interest question: ${q}`);
  },
  'G7-W5-BUDGET': (q) => {
    let m = /allowance is ₱(\d+)\. The student saves (\d+)% first\. How much is left/.exec(q);
    if (m) return Number(m[1]) - (Number(m[1]) * Number(m[2])) / 100;
    m = /allowance is ₱(\d+)\. The student saves (\d+)% of it/.exec(q);
    if (m) return (Number(m[1]) * Number(m[2])) / 100;
    throw new Error(`Unparseable budget question: ${q}`);
  },
  // ---- Week 6
  'G7-W6-UNITRATE': (q) => {
    const [a, b] = [...q.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    return a / b;
  },
  'G7-W6-TOTAL': (q) => {
    const [a, b, c] = grab(q, /(\d+) [a-z]+ in (\d+) [a-z]+\. At this rate, how many [a-z]+ in (\d+) /).map(Number);
    return (a / b) * c;
  },
  'G7-W6-COMPARE': (q) => {
    const [xa, pa, xb, pb] = grab(q, /Store A sells (\d+) \w+ of [\w ]+ for ₱(\d+)\. Store B sells (\d+) \w+ of [\w ]+ for ₱(\d+)/).map(Number);
    const perA = pa / xa;
    const perB = pb / xb;
    if (close(perA, perB)) throw new Error('equal unit prices are not used in the bank');
    return perA < perB ? 'Store A is cheaper per unit' : 'Store B is cheaper per unit';
  },
};

const lessons = buildTerm1WeeklyLessons();
const existing = buildTerm1Lessons();
const allQuestions = lessons.flatMap((lesson) => lesson.bank.map((question) => ({ lesson, question })));

describe('Grade 7 Term 1, Weeks 1 to 6 (one lesson per Budget of Work week)', () => {
  it('defines six lessons in week order with sections, vocabulary, checks, objectives and skills', () => {
    expect(lessons).toHaveLength(6);
    expect(lessons.map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lessons.map((l) => l.competency.code)).toEqual(['G7-T1-WK1-MG', 'G7-T1-WK2-MG', 'G7-T1-WK3-MG', 'G7-T1-WK4-NA', 'G7-T1-WK5-NA', 'G7-T1-WK6-NA']);
    for (const lesson of lessons) {
      expect(lesson.unit).toBe('weekly');
      expect(lesson.sections.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.vocabulary.length, lesson.id).toBeGreaterThanOrEqual(5);
      expect(lesson.checks, lesson.id).toHaveLength(2);
      expect(lesson.objectives.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.skills, lesson.id).toHaveLength(3);
      const declared = new Set(lesson.skills.map((skill) => skill.code));
      for (const objective of lesson.objectives) for (const code of objective.skillCodes) expect(declared.has(code), code).toBe(true);
      // Every skill must be taught by at least one objective, or its questions would not link to one.
      for (const skill of lesson.skills) expect(lesson.objectives.some((o) => o.skillCodes.includes(skill.code)), skill.code).toBe(true);
    }
    expect(WEEKLY_UNIT.id).toBe('unit-math-7-term1-weekly');
  });

  it('does not collide with the existing five lessons (ids, competency codes, skill codes, question ids)', () => {
    const existingSkills = new Set(existing.flatMap((l) => l.skills.map((s) => s.code)));
    const existingIds = new Set(existing.map((l) => l.id));
    const existingCompetencies = new Set(existing.map((l) => l.competency.code));
    const existingQuestionIds = new Set(existing.flatMap((l) => l.bank.map((q) => q.id)));
    for (const lesson of lessons) {
      expect(existingIds.has(lesson.id), lesson.id).toBe(false);
      expect(existingCompetencies.has(lesson.competency.code), lesson.competency.code).toBe(false);
      for (const skill of lesson.skills) expect(existingSkills.has(skill.code), skill.code).toBe(false);
      for (const q of lesson.bank) expect(existingQuestionIds.has(q.id), q.id).toBe(false);
    }
    expect(new Set(lessons.map((l) => l.id)).size).toBe(6);
  });

  it('has an oracle for every skill, 12 questions per skill, a real difficulty spread and all four answer slots', () => {
    for (const lesson of lessons) {
      for (const skill of lesson.skills) {
        expect(ORACLES[skill.code], skill.code).toBeDefined();
        const items = lesson.bank.filter((q) => q.skillCode === skill.code);
        expect(items.length, skill.code).toBe(12);
        for (const band of ['EASY', 'MEDIUM', 'HARD']) expect(items.filter((q) => q.difficulty === band).length, `${skill.code} ${band}`).toBeGreaterThanOrEqual(3);
        expect(new Set(items.map((q) => q.correctIndex)).size, `${skill.code} answer slots`).toBe(4);
      }
    }
    expect(allQuestions).toHaveLength(216);
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
      if (typeof expected === 'string') {
        expect(marked, id).toBe(expected);
        expect(q.options.filter((o) => o === expected), id).toHaveLength(1);
      } else {
        expect(close(firstNumber(marked), expected), `${id}: marked "${marked}" but computed ${expected}`).toBe(true);
        // No other option may also equal the computed value.
        expect(q.options.filter((option) => close(firstNumber(option), expected)), id).toHaveLength(1);
      }
    },
  );

  it('has unique ids, positions and question texts, four distinct options and real explanations', () => {
    const ids = allQuestions.map(({ question }) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it('passes the deterministic question validator (no answer giveaways, distinct options)', () => {
    for (const { question: q } of allQuestions) {
      const result = validateGeneratedQuestion({ question: q.question, options: q.options, correctIndex: q.correctIndex });
      expect(result.errors, q.id).toEqual([]);
    }
  });

  it('never offers a zero or negative amount, angle or length as an option', () => {
    for (const { question: q } of allQuestions) {
      if (!/₱|km|cm|°|years|per /.test(q.options.join(' '))) continue;
      for (const option of q.options) {
        if (/^(Store|Both|It cannot|Convex|Non-convex|Regular|Not a)/.test(option)) continue;
        expect(firstNumber(option), `${q.id} ${option}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every convex/non-convex case a real polygon: the angles add up to (n − 2) × 180°', () => {
    for (const { angles, convex } of CONVEX_CASES) {
      const n = angles.length;
      expect(angles.reduce((a, b) => a + b, 0)).toBe((n - 2) * 180);
      expect(angles.some((a) => a > 180)).toBe(!convex);
      expect(angles.every((a) => a > 0 && a !== 180)).toBe(true);
    }
  });

  it('keeps every knowledge check correct, with four distinct options, and distinct from the practice bank', () => {
    const bankQuestions = new Set(allQuestions.map(({ question }) => question.question));
    for (const lesson of lessons) {
      for (const item of lesson.checks) {
        expect(new Set(item.options).size, item.question).toBe(4);
        expect(item.explanation).toContain(item.options[item.correctIndex]);
        expect(bankQuestions.has(item.question)).toBe(false);
      }
    }
    const answers = Object.fromEntries(lessons.flatMap((lesson) => lesson.checks).map((item) => [item.question, item.options[item.correctIndex]]));
    expect(answers['You are drawing a regular decagon inside a circle. At what angle from the centre should the corners be marked?']).toBe('36°');
    expect(answers['Two angles add up to 90°. What are they called?']).toBe('Complementary angles');
    expect(answers['Two straight lines cross and one of the four angles is 130°. What is the angle directly opposite it?']).toBe('130°');
    expect(answers['An interior angle of a polygon is 112°. What is the adjacent exterior angle?']).toBe('68°');
    // 6 sides give 720°; 720 − (100 + 110 + 120 + 130 + 140) = 120. (A published teacher guide answers 240°: that is wrong.)
    expect(answers['Five angles of a hexagon measure 100°, 110°, 120°, 130° and 140°. What is the sixth angle?']).toBe('120°');
    expect(answers['A price rises from ₱250 to ₱300. What is the percentage increase?']).toBe('20%');
    expect(answers['A phone drops in value from ₱10000 to ₱7500. What is the percentage decrease?']).toBe('25%');
    expect(answers['A jacket is sold for ₱680 after a 15% discount. What was its original price?']).toBe('₱800');
    expect(answers['How much simple interest does ₱20000 earn at 4% per year in 3 years?']).toBe('₱2400');
    expect(answers['A plane flies 2220 km in 3 hours. What is its speed?']).toBe('740 km/h');
    expect(answers['A tutor earns ₱1350 in 5 days at a steady rate. How much does the tutor earn in 8 days?']).toBe('₱2160');
  });

  it('teaches the correct fact that only the regular hexagon has a side equal to its circle radius', () => {
    // The side of a regular n-gon in a circle of radius R is 2R·sin(180°/n). It equals R only when sin(180°/n) = 1/2, so n = 6.
    const equalsRadius = [3, 4, 5, 6, 8, 9, 10, 12].filter((n) => close(2 * Math.sin(Math.PI / n), 1));
    expect(equalsRadius).toEqual([6]);
    const w1 = lessons[0];
    expect(w1.sections[2].sourceExplanation).toContain('NOT equal to the radius');
  });
});

describe('Grade 7 Term 1, Weeks 1 to 6, in the seeded database', () => {
  it('publishes the lessons in their own Term 1 unit with the competency, objectives, sections and checks', async () => {
    const unit = await db.unit.findUnique({ where: { id: WEEKLY_UNIT.id }, include: { term: true } });
    expect(unit?.term.number).toBe(1);
    expect(unit?.isDemo).toBe(false);
    for (const lesson of lessons) {
      const stored = await db.lesson.findUnique({
        where: { id: lesson.id },
        include: { objectives: { include: { competency: true, skills: true } }, sections: true, vocabulary: true, checks: true },
      });
      expect(stored, lesson.id).not.toBeNull();
      expect(stored!.status).toBe('PUBLISHED');
      expect(stored!.unitId).toBe(WEEKLY_UNIT.id);
      expect(stored!.sections).toHaveLength(lesson.sections.length);
      expect(stored!.vocabulary).toHaveLength(lesson.vocabulary.length);
      expect(stored!.checks).toHaveLength(2);
      expect(stored!.objectives).toHaveLength(lesson.objectives.length);
      for (const objective of stored!.objectives) {
        expect(objective.competency?.code).toBe(lesson.competency.code);
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
        expect(row.learningObjective?.skills.some((s) => s.skillId === row.skillId), row.id).toBe(true);
      });
    }
  });
});
