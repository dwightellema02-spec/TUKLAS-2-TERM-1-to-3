/**
 * Grade 7 Mathematics, First Term, Weeks 1 to 6: one lesson per Budget of Work week.
 *
 * ORIGINAL student-facing lessons, written in our own words from the competencies in the DepEd MATATAG Grade 7
 * Mathematics Budget of Work (updated April 17, 2026). They are NOT copies of the DepEd Lesson Exemplars, which are
 * marked for teacher use only. A teacher still has to review the text before students see it.
 *
 * Every practice answer is COMPUTED from the numbers in the question (see tests/term1-weekly-content.test.ts, which
 * re-derives each one independently from the question text). Competency codes are Tuklas identifiers, not DepEd codes.
 *
 * This file sits beside term1-lessons.ts and does not change it. The loader publishes both sets; a school that wants
 * only one set can unpublish the other unit in the lesson studio.
 */

import {
  buildSkill,
  deg,
  interleave,
  num,
  peso,
  pct,
  textsFrom,
  type BankQuestion,
  type SkillDef,
} from './term1-banks';
import { check, TERM1_SOURCE, type Term1Lesson, type Term1Unit } from './term1-lessons';

export { TERM1_SOURCE };

export const WEEKLY_UNIT: Term1Unit = {
  id: 'unit-math-7-term1-weekly',
  position: 5,
  title: 'Term 1, Weeks 1 to 6 (one lesson per week)',
  description: 'Polygons, angle pairs, exterior angles, percentage change, money problems and rates, in Budget of Work order.',
};

export type WeeklyLesson = Omit<Term1Lesson, 'unit'> & { unit: 'weekly' };

/** Two decimals, no trailing zeros, true minus sign. */
const d2 = (n: number) => num(Math.round(n * 100) / 100);
const positive = (values: number[]) => values.filter((v) => Number.isFinite(v) && v > 0);

// ============================================================ Week 1: polygons

export const W1_SKILLS = {
  name: { code: 'G7-W1-NAME', name: 'Naming polygons', description: 'Name a polygon from its number of sides, and the reverse.' },
  perimeter: { code: 'G7-W1-PERIM', name: 'Perimeter of a regular polygon', description: 'Find the perimeter of a regular polygon from its number of sides and side length.' },
  central: { code: 'G7-W1-CENTRAL', name: 'Central angle for drawing', description: 'Find the angle at the centre of the circle that marks the corners of a regular polygon.' },
} satisfies Record<string, SkillDef>;

const POLYGON_NAMES: Record<number, string> = {
  3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon',
};
export const POLYGON_NAME_LIST = POLYGON_NAMES;
const PREFIX_MEANING: Record<number, string> = {
  3: 'tri- means three', 4: 'quad- means four', 5: 'penta- means five', 6: 'hexa- means six',
  7: 'hepta- means seven', 8: 'octa- means eight', 9: 'nona- means nine', 10: 'deca- means ten',
};

export function buildW1Bank(): BankQuestion[] {
  const forward = [5, 7, 9, 10, 6, 8];
  const reverse = [3, 4, 5, 6, 7, 8];
  const nameSkill = buildSkill(W1_SKILLS.name, 'w1-name', 12, (i) => {
    if (i % 2 === 0) {
      const n = forward[i / 2];
      const answer = POLYGON_NAMES[n];
      const others = Object.values(POLYGON_NAMES).filter((name) => name !== answer);
      // The names closest in sides are the most tempting wrong answers.
      const near = [n - 1, n + 1, n - 2, n + 2].map((k) => POLYGON_NAMES[k]).filter(Boolean);
      return {
        question: `A polygon has ${n} sides. What is it called?`,
        answer,
        wrong: [...near, ...others],
        explanation: `The name comes from the number of sides: a polygon with ${n} sides is a ${answer}.`,
      };
    }
    const n = reverse[(i - 1) / 2];
    const name = POLYGON_NAMES[n];
    const article = /^[aeiou]/.test(name) ? 'an' : 'a';
    return {
      question: `How many sides does ${article} ${name} have?`,
      answer: num(n),
      wrong: textsFrom([n - 1, n + 1, n + 2, n - 2, 2 * n].filter((v) => v >= 3), num, n),
      explanation: `The prefix in "${name}" (${PREFIX_MEANING[n]}) tells the count, so ${article} ${name} has ${num(n)} sides.`,
    };
  });

  const sides = [5, 6, 8, 10, 6, 5, 8, 10, 9, 12, 7, 4];
  const lengths = [4, 3, 5, 6, 8, 7, 9, 2, 6, 5, 3, 12];
  const perimeter = buildSkill(W1_SKILLS.perimeter, 'w1-perim', 12, (i) => {
    const n = sides[i];
    const s = lengths[i];
    const total = n * s;
    return {
      question: `A regular polygon has ${n} sides, each ${s} cm long. What is its perimeter?`,
      answer: `${num(total)} cm`,
      wrong: textsFrom(positive([n + s, (n - 1) * s, total + s, 2 * total]), (v) => `${num(v)} cm`, total),
      explanation: `All ${n} sides of a regular polygon are equal, so the perimeter is ${n} × ${s} cm = ${num(total)} cm.`,
    };
  });

  const centralSides = [3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24];
  const central = buildSkill(W1_SKILLS.central, 'w1-central', 12, (i) => {
    const n = centralSides[i];
    const angle = 360 / n;
    const interior = ((n - 2) * 180) / n;
    return {
      question: `You are drawing a regular polygon with ${n} sides inside a circle. What angle at the centre of the circle separates two neighbouring corners?`,
      answer: deg(angle),
      wrong: textsFrom(positive([interior, 180 / n, n, 2 * angle]), deg, angle),
      explanation: `One full turn around the centre is 360°, shared equally by ${n} corners: 360° ÷ ${n} = ${deg(angle)}.`,
    };
  });

  return interleave([nameSkill, perimeter, central]);
}

// ======================================================= Week 2: angle pairs

export const W2_SKILLS = {
  compSupp: { code: 'G7-W2-COMPSUPP', name: 'Complementary and supplementary angles', description: 'Find the missing angle when two angles add up to 90° or 180°.' },
  vertLinear: { code: 'G7-W2-VERTLIN', name: 'Vertical angles and linear pairs', description: 'Use equal vertical angles and the 180° linear pair when two lines cross.' },
  convex: { code: 'G7-W2-CONVEX', name: 'Convex or non-convex', description: 'Decide from the interior angles whether a polygon is convex.' },
} satisfies Record<string, SkillDef>;

/** Interior angle lists that really are polygons: each list adds up to (n − 2) × 180°. */
export const CONVEX_CASES: Array<{ angles: number[]; convex: boolean }> = [
  { angles: [95, 85, 95, 85], convex: true },
  { angles: [210, 60, 60, 30], convex: false },
  { angles: [105, 105, 105, 105, 120], convex: true },
  { angles: [240, 60, 60, 90, 90], convex: false },
  { angles: [110, 130, 110, 130, 110, 130], convex: true },
  { angles: [250, 60, 90, 100, 110, 110], convex: false },
  { angles: [80, 100, 70, 110], convex: true },
  { angles: [200, 70, 50, 40], convex: false },
  { angles: [100, 110, 120, 100, 110], convex: true },
  { angles: [220, 80, 70, 90, 80], convex: false },
  { angles: [100, 130, 110, 140, 120, 120], convex: true },
  { angles: [200, 70, 80, 90, 140, 140], convex: false },
];

const listAngles = (angles: number[]) => `${angles.slice(0, -1).map((a) => `${a}°`).join(', ')} and ${angles[angles.length - 1]}°`;

export function buildW2Bank(): BankQuestion[] {
  const comp = [15, 25, 35, 40, 55, 62];
  const supp = [30, 65, 80, 110, 125, 150];
  const compSupp = buildSkill(W2_SKILLS.compSupp, 'w2-compsupp', 12, (i) => {
    if (i % 2 === 0) {
      const x = comp[i / 2];
      const answer = 90 - x;
      return {
        question: `Two angles are complementary. One measures ${x}°. How large is the other?`,
        answer: deg(answer),
        wrong: textsFrom(positive([180 - x, x, 90 + x, 100 - x]), deg, answer),
        explanation: `Complementary angles add up to 90°, so the other angle is 90° − ${x}° = ${deg(answer)}.`,
      };
    }
    const x = supp[(i - 1) / 2];
    const answer = 180 - x;
    return {
      question: `Two angles are supplementary. One measures ${x}°. How large is the other?`,
      answer: deg(answer),
      wrong: textsFrom(positive([90 - x, x, 360 - x, 180 + x]), deg, answer),
      explanation: `Supplementary angles add up to 180°, so the other angle is 180° − ${x}° = ${deg(answer)}.`,
    };
  });

  const vertical = [40, 70, 115, 125, 50, 135];
  const linear = [35, 65, 100, 120, 145, 75];
  const vertLinear = buildSkill(W2_SKILLS.vertLinear, 'w2-vertlin', 12, (i) => {
    if (i % 2 === 0) {
      const x = vertical[i / 2];
      return {
        question: `Two straight lines cross. One of the angles measures ${x}°. What is the measure of the angle directly opposite it?`,
        answer: deg(x),
        wrong: textsFrom(positive([180 - x, 90 - x, 360 - x, 90 + x, 2 * x]), deg, x),
        explanation: `Angles directly opposite each other where two lines cross are vertical angles, and vertical angles are equal. The opposite angle is ${deg(x)}.`,
      };
    }
    const x = linear[(i - 1) / 2];
    const answer = 180 - x;
    return {
      question: `Two straight lines cross. One of the angles measures ${x}°. What is the measure of an angle right next to it?`,
      answer: deg(answer),
      wrong: textsFrom(positive([x, 90 - x, 360 - x, 180 + x]), deg, answer),
      explanation: `Two neighbouring angles at a crossing form a linear pair, which adds up to 180°: 180° − ${x}° = ${deg(answer)}.`,
    };
  });

  const convex = buildSkill(W2_SKILLS.convex, 'w2-convex', 12, (i) => {
    const { angles, convex: isConvex } = CONVEX_CASES[i];
    const biggest = Math.max(...angles);
    const answer = isConvex ? 'Convex polygon' : 'Non-convex polygon';
    const rest = ['Convex polygon', 'Non-convex polygon', 'Regular polygon', 'Not a polygon'].filter((option) => option !== answer);
    return {
      question: `A polygon has interior angles of ${listAngles(angles)}. Is it convex or non-convex?`,
      answer,
      wrong: rest,
      explanation: isConvex
        ? `A polygon is convex when every interior angle is less than 180°. The largest angle here is ${biggest}°, so it is a Convex polygon.`
        : `A polygon is non-convex when at least one interior angle is more than 180°. Here one angle is ${biggest}°, so it is a Non-convex polygon.`,
    };
  });

  return interleave([compSupp, vertLinear, convex]);
}

// =================================================== Week 3: exterior angles

export const W3_SKILLS = {
  extAdj: { code: 'G7-W3-EXTADJ', name: 'Exterior and adjacent interior angle', description: 'Use the fact that an exterior angle and its adjacent interior angle add up to 180°.' },
  missing: { code: 'G7-W3-MISSING', name: 'Missing interior angle', description: 'Find the last interior angle when the others and the number of sides are known.' },
  regular: { code: 'G7-W3-REGANGLE', name: 'Angles and sides of regular polygons', description: 'Find exterior angles of a regular polygon, or the number of sides from an interior angle.' },
} satisfies Record<string, SkillDef>;

export function buildW3Bank(): BankQuestion[] {
  const interiors = [60, 75, 100, 112, 135, 150];
  const exteriors = [20, 40, 55, 72, 85, 110];
  const extAdj = buildSkill(W3_SKILLS.extAdj, 'w3-extadj', 12, (i) => {
    if (i % 2 === 0) {
      const x = interiors[i / 2];
      const answer = 180 - x;
      return {
        question: `An interior angle of a polygon measures ${x}°. What is the measure of the adjacent exterior angle?`,
        answer: deg(answer),
        wrong: textsFrom(positive([x, 90 - x, 360 - x, 180 + x]), deg, answer),
        explanation: `An interior angle and its adjacent exterior angle lie on a straight line, so they add up to 180°: 180° − ${x}° = ${deg(answer)}.`,
      };
    }
    const x = exteriors[(i - 1) / 2];
    const answer = 180 - x;
    return {
      question: `An exterior angle of a polygon measures ${x}°. What is the measure of the adjacent interior angle?`,
      answer: deg(answer),
      wrong: textsFrom(positive([x, 90 - x, 360 - x, 180 + x]), deg, answer),
      explanation: `The exterior angle and the adjacent interior angle add up to 180°: 180° − ${x}° = ${deg(answer)}.`,
    };
  });

  const cases: Array<[number, number]> = [
    [4, 70], [4, 110], [5, 80], [5, 120], [6, 100], [6, 140], [5, 95], [8, 135], [7, 150], [8, 130], [9, 85], [10, 105],
  ];
  const missing = buildSkill(W3_SKILLS.missing, 'w3-missing', 12, (i) => {
    const [n, m] = cases[i];
    const total = (n - 2) * 180;
    const others = total - m;
    return {
      question: `A polygon has ${n} sides. Its other ${n - 1} interior angles add up to ${others}°. What is the missing interior angle?`,
      answer: deg(m),
      wrong: textsFrom(positive([m + 180, m + 360, 360 - m, 180 - m]), deg, m),
      explanation: `The interior angles of a ${n}-sided polygon add up to (${n} − 2) × 180° = ${total}°. The missing angle is ${total}° − ${others}° = ${deg(m)}.`,
    };
  });

  const exteriorSides = [4, 5, 6, 8, 10, 12];
  const interiorAngles = [108, 120, 135, 140, 150, 156];
  const regular = buildSkill(W3_SKILLS.regular, 'w3-regular', 12, (i) => {
    if (i % 2 === 0) {
      const n = exteriorSides[i / 2];
      const e = 360 / n;
      return {
        question: `A regular polygon has ${n} sides. What is the measure of each exterior angle?`,
        answer: deg(e),
        wrong: textsFrom(positive([180 - e, 180 / n, n, 2 * e]), deg, e),
        explanation: `The exterior angles of any polygon add up to 360°, and a regular polygon has equal ones: 360° ÷ ${n} = ${deg(e)}.`,
      };
    }
    const x = interiorAngles[(i - 1) / 2];
    const e = 180 - x;
    const n = 360 / e;
    return {
      question: `Each interior angle of a regular polygon measures ${x}°. How many sides does the polygon have?`,
      answer: num(n),
      wrong: textsFrom(positive([e, n + 2, n - 2, 2 * n]), num, n),
      explanation: `Each exterior angle is 180° − ${x}° = ${deg(e)}. The number of sides is 360° ÷ ${deg(e)} = ${num(n)}.`,
    };
  });

  return interleave([extAdj, missing, regular]);
}

// ============================================ Week 4: percentage change

export const W4_SKILLS = {
  increase: { code: 'G7-W4-PCTINC', name: 'Percentage increase', description: 'Find the percentage increase from an original value and a new value.' },
  decrease: { code: 'G7-W4-PCTDEC', name: 'Percentage decrease', description: 'Find the percentage decrease from an original value and a new value.' },
  original: { code: 'G7-W4-ORIGINAL', name: 'Original value before a change', description: 'Find the value before a percentage increase or decrease.' },
} satisfies Record<string, SkillDef>;

export function buildW4Bank(): BankQuestion[] {
  const up: Array<[number, number]> = [[100, 30], [350, 50], [80, 25], [200, 40], [60, 15], [500, 10], [150, 20], [250, 60], [400, 45], [120, 35], [90, 10], [300, 5]];
  const increase = buildSkill(W4_SKILLS.increase, 'w4-inc', 12, (i) => {
    const [a, p] = up[i];
    const b = a + (a * p) / 100;
    return {
      question: `A value rises from ${a} to ${b}. What is the percentage increase?`,
      answer: pct(p),
      wrong: textsFrom(positive([b - a, 100 + p, Math.round(((b - a) / b) * 10000) / 100, p + 10]), pct, p),
      explanation: `The increase is ${b} − ${a} = ${b - a}. Divide by the ORIGINAL value: ${b - a} ÷ ${a} × 100% = ${pct(p)}.`,
    };
  });

  const down: Array<[number, number]> = [[200, 35], [500, 18], [250, 40], [80, 25], [1500, 18], [5000, 80], [360, 30], [400, 15], [900, 10], [640, 25], [120, 45], [75, 12]];
  const decrease = buildSkill(W4_SKILLS.decrease, 'w4-dec', 12, (i) => {
    const [a, p] = down[i];
    const b = a - (a * p) / 100;
    return {
      question: `A price drops from ${peso(a)} to ${peso(b)}. What is the percentage decrease?`,
      answer: pct(p),
      wrong: textsFrom(positive([a - b, 100 - p, Math.round(((a - b) / b) * 10000) / 100, p + 5]), pct, p),
      explanation: `The decrease is ${a} − ${b} = ${a - b}. Divide by the ORIGINAL price: ${a - b} ÷ ${a} × 100% = ${pct(p)}.`,
    };
  });

  const raises: Array<[number, number]> = [[200, 25], [60, 50], [400, 10], [150, 20], [80, 35], [500, 12]];
  const drops: Array<[number, number]> = [[1800, 16], [250, 20], [600, 15], [90, 40], [1200, 35], [320, 25]];
  const original = buildSkill(W4_SKILLS.original, 'w4-orig', 12, (i) => {
    if (i % 2 === 0) {
      const [a, p] = raises[i / 2];
      const b = a + (a * p) / 100;
      return {
        question: `After a ${p}% increase, the price of a toy is ${peso(b)}. What was the price before the increase?`,
        answer: peso(a),
        wrong: [b - (b * p) / 100, b - p, b + (b * p) / 100, b / (1 - p / 100)].filter((v) => v > 0).map((v) => `₱${d2(v)}`),
        explanation: `After a ${p}% increase the price is ${100 + p}% of the original. Divide: ${b} ÷ ${(100 + p) / 100} = ${peso(a)}.`,
      };
    }
    const [a, p] = drops[(i - 1) / 2];
    const b = a - (a * p) / 100;
    return {
      question: `After a ${p}% decrease, the price of a shirt is ${peso(b)}. What was the price before the decrease?`,
      answer: peso(a),
      wrong: [b + (b * p) / 100, b + p, b - (b * p) / 100, b / (1 + p / 100)].filter((v) => v > 0).map((v) => `₱${d2(v)}`),
      explanation: `After a ${p}% decrease the price is ${100 - p}% of the original. Divide: ${b} ÷ ${(100 - p) / 100} = ${peso(a)}.`,
    };
  });

  return interleave([increase, decrease, original]);
}

// ===================================== Week 5: money problems and a budget

export const W5_SKILLS = {
  original: { code: 'G7-W5-ORIGPRICE', name: 'Original price from a sale price', description: 'Find the original price from the sale price and the discount rate.' },
  interest: { code: 'G7-W5-INTEREST', name: 'Simple interest and its unknowns', description: 'Use I = Prt to find the interest, principal, rate or time.' },
  budget: { code: 'G7-W5-BUDGET', name: 'Budgeting with percentages', description: 'Use a percentage of an allowance to plan savings and spending.' },
} satisfies Record<string, SkillDef>;

export function buildW5Bank(): BankQuestion[] {
  const discounts: Array<[number, number]> = [[250, 20], [1200, 25], [400, 10], [600, 30], [900, 40], [1500, 12], [350, 20], [2000, 35], [720, 15], [480, 25], [3000, 18], [160, 45]];
  const original = buildSkill(W5_SKILLS.original, 'w5-orig', 12, (i) => {
    const [a, r] = discounts[i];
    const s = a - (a * r) / 100;
    return {
      question: `A bag is sold for ${peso(s)} after a ${r}% discount. What was its original price?`,
      answer: peso(a),
      wrong: [s + (s * r) / 100, s - (s * r) / 100, s + r, (s * r) / 100].filter((v) => v > 0).map((v) => `₱${d2(v)}`),
      explanation: `The sale price is ${100 - r}% of the original price. Divide: ${s} ÷ ${(100 - r) / 100} = ${peso(a)}.`,
    };
  });

  // Four kinds of simple-interest question, three of each. I = P × r × t.
  type Interest =
    | { kind: 'interest'; p: number; r: number; t: number }
    | { kind: 'principal'; p: number; r: number; t: number }
    | { kind: 'rate'; p: number; r: number; t: number }
    | { kind: 'time'; p: number; r: number; t: number };
  const interestCases: Interest[] = [
    { kind: 'interest', p: 12000, r: 5, t: 2 },
    { kind: 'principal', p: 6000, r: 5, t: 2 },
    { kind: 'rate', p: 5000, r: 5, t: 3 },
    { kind: 'time', p: 10000, r: 4, t: 4 },
    { kind: 'interest', p: 40000, r: 3, t: 4 },
    { kind: 'principal', p: 15000, r: 4, t: 5 },
    { kind: 'rate', p: 20000, r: 8, t: 2 },
    { kind: 'time', p: 25000, r: 6, t: 3 },
    { kind: 'interest', p: 7500, r: 4, t: 3 },
    { kind: 'principal', p: 8000, r: 6, t: 3 },
    { kind: 'rate', p: 12000, r: 6, t: 2 },
    { kind: 'time', p: 8000, r: 5, t: 5 },
  ];
  const interest = buildSkill(W5_SKILLS.interest, 'w5-interest', 12, (i) => {
    const c = interestCases[i];
    const income = (c.p * c.r * c.t) / 100; // I = P × r × t with r as a percent
    if (c.kind === 'interest') {
      return {
        question: `What is the simple interest on ${peso(c.p)} at ${c.r}% per year for ${c.t} years?`,
        answer: peso(income),
        wrong: textsFrom(positive([(c.p * c.r) / 100, c.p * c.r * c.t, c.p + income, 2 * income]), peso, income),
        explanation: `I = P × r × t = ${c.p} × ${c.r / 100} × ${c.t} = ${peso(income)}.`,
      };
    }
    if (c.kind === 'principal') {
      return {
        question: `How much must be invested at ${c.r}% simple interest per year to earn ${peso(income)} in ${c.t} years?`,
        answer: peso(c.p),
        wrong: textsFrom(positive([income / (c.r * c.t), (income * 100) / c.r, income / c.t, income * c.r * c.t]), peso, c.p),
        explanation: `P = I ÷ (r × t) = ${income} ÷ (${c.r / 100} × ${c.t}) = ${peso(c.p)}.`,
      };
    }
    if (c.kind === 'rate') {
      const base = (income / c.p) * 100;
      return {
        question: `${peso(c.p)} earns ${peso(income)} in simple interest in ${c.t} years. What is the yearly interest rate?`,
        answer: pct(c.r),
        wrong: textsFrom(positive([base, base * c.t, c.r + 2, c.r - 2]), pct, c.r),
        explanation: `r = I ÷ (P × t) = ${income} ÷ (${c.p} × ${c.t}) = ${c.r / 100}, which is ${pct(c.r)} per year.`,
      };
    }
    return {
      question: `A loan of ${peso(c.p)} at ${c.r}% simple interest per year costs ${peso(income)} in interest. For how many years was the loan?`,
      answer: `${c.t} years`,
      wrong: textsFrom(positive([c.t + 1, c.t - 1, 2 * c.t, c.t + 2]), (v) => `${num(v)} years`, c.t),
      explanation: `t = I ÷ (P × r) = ${income} ÷ (${c.p} × ${c.r / 100}) = ${c.t} years.`,
    };
  });

  const left: Array<[number, number]> = [[500, 20], [800, 25], [350, 10], [1000, 15], [600, 30], [450, 20]];
  const saved: Array<[number, number]> = [[2000, 10], [1500, 20], [3000, 15], [2400, 25], [1800, 5], [900, 30]];
  const budget = buildSkill(W5_SKILLS.budget, 'w5-budget', 12, (i) => {
    if (i % 2 === 0) {
      const [a, s] = left[i / 2];
      const set = (a * s) / 100;
      const answer = a - set;
      return {
        question: `A student's weekly allowance is ${peso(a)}. The student saves ${s}% first. How much is left to spend?`,
        answer: peso(answer),
        wrong: textsFrom(positive([set, a - s, a + set, a - 2 * set]), peso, answer),
        explanation: `${s}% of ${peso(a)} is ${peso(set)}, which goes to savings first. What is left is ${a} − ${set} = ${peso(answer)}.`,
      };
    }
    const [a, s] = saved[(i - 1) / 2];
    const answer = (a * s) / 100;
    return {
      question: `A student's monthly allowance is ${peso(a)}. The student saves ${s}% of it. How much is saved each month?`,
      answer: peso(answer),
      wrong: textsFrom(positive([a - answer, s, a * s, a + answer]), peso, answer),
      explanation: `${s}% of ${peso(a)} is ${a} × ${s / 100} = ${peso(answer)}.`,
    };
  });

  return interleave([original, interest, budget]);
}

// ========================================================== Week 6: rates

export const W6_SKILLS = {
  unit: { code: 'G7-W6-UNITRATE', name: 'Writing a unit rate', description: 'Turn a rate into a unit rate by dividing by the second quantity.' },
  total: { code: 'G7-W6-TOTAL', name: 'Using a unit rate', description: 'Find a total by multiplying the unit rate by the amount wanted.' },
  compare: { code: 'G7-W6-COMPARE', name: 'Comparing rates', description: 'Find the better buy by comparing the price per unit.' },
} satisfies Record<string, SkillDef>;

export function buildW6Bank(): BankQuestion[] {
  type UnitCase = { text: (a: number, b: number) => string; unitText: string; a: number; b: number };
  const unitCases: UnitCase[] = [
    { text: (a, b) => `A tailor sews ${a} blouses in ${b} days.`, unitText: 'blouses per day', a: 60, b: 5 },
    { text: (a, b) => `A typist types ${a} words in ${b} minutes.`, unitText: 'words per minute', a: 621, b: 9 },
    { text: (a, b) => `${a} pesos pays for ${b} kilograms of rice.`, unitText: 'pesos per kilogram', a: 174, b: 2 },
    { text: (a, b) => `A bus travels ${a} km in ${b} hours.`, unitText: 'km per hour', a: 180, b: 3 },
    { text: (a, b) => `A bakery makes ${a} loaves in ${b} hours.`, unitText: 'loaves per hour', a: 84, b: 6 },
    { text: (a, b) => `A student reads ${a} pages in ${b} hours.`, unitText: 'pages per hour', a: 150, b: 6 },
    { text: (a, b) => `A copier prints ${a} sheets in ${b} minutes.`, unitText: 'sheets per minute', a: 400, b: 8 },
    { text: (a, b) => `A plane flies ${a} km in ${b} hours.`, unitText: 'km per hour', a: 2220, b: 3 },
    { text: (a, b) => `${a} pesos buys ${b} notebooks.`, unitText: 'pesos per notebook', a: 975, b: 15 },
    { text: (a, b) => `A cyclist rides ${a} km in ${b} hours.`, unitText: 'km per hour', a: 270, b: 3 },
    { text: (a, b) => `A baker makes ${a} cakes in ${b} days.`, unitText: 'cakes per day', a: 49, b: 7 },
    { text: (a, b) => `A farmer packs ${a} kilograms of mangoes in ${b} boxes.`, unitText: 'kilograms per box', a: 360, b: 4 },
  ];
  const unit = buildSkill(W6_SKILLS.unit, 'w6-unit', 12, (i) => {
    const c = unitCases[i];
    const rate = c.a / c.b;
    const withUnit = (v: number) => `${d2(v)} ${c.unitText}`;
    return {
      question: `${c.text(c.a, c.b)} What is the unit rate?`,
      answer: withUnit(rate),
      wrong: positive([c.a * c.b, c.a + c.b, c.a - c.b, 2 * rate]).filter((v) => d2(v) !== d2(rate)).map(withUnit),
      explanation: `A unit rate is for ONE unit. Divide: ${c.a} ÷ ${c.b} = ${d2(rate)}, so the unit rate is ${withUnit(rate)}.`,
    };
  });

  type TotalCase = { who: string; verb: string; noun: string; unit: string; a: number; b: number; c: number };
  const totalCases: TotalCase[] = [
    { who: 'A machine', verb: 'fills', noun: 'bottles', unit: 'minutes', a: 45, b: 3, c: 8 },
    { who: 'A writer', verb: 'writes', noun: 'pages', unit: 'hours', a: 12, b: 4, c: 18 },
    { who: 'A worker', verb: 'earns', noun: 'pesos', unit: 'days', a: 120, b: 5, c: 9 },
    { who: 'A baker', verb: 'bakes', noun: 'loaves', unit: 'hours', a: 84, b: 7, c: 10 },
    { who: 'A printer', verb: 'prints', noun: 'sheets', unit: 'minutes', a: 200, b: 8, c: 12 },
    { who: 'A farmer', verb: 'picks', noun: 'mangoes', unit: 'hours', a: 63, b: 9, c: 13 },
    { who: 'A runner', verb: 'covers', noun: 'meters', unit: 'minutes', a: 150, b: 6, c: 15 },
    { who: 'A tailor', verb: 'sews', noun: 'shirts', unit: 'days', a: 36, b: 4, c: 11 },
    { who: 'A clerk', verb: 'sorts', noun: 'letters', unit: 'hours', a: 95, b: 5, c: 12 },
    { who: 'A cook', verb: 'makes', noun: 'dumplings', unit: 'minutes', a: 72, b: 8, c: 15 },
    { who: 'A pump', verb: 'moves', noun: 'liters', unit: 'minutes', a: 56, b: 7, c: 9 },
    { who: 'A farm', verb: 'ships', noun: 'eggs', unit: 'days', a: 510, b: 6, c: 10 },
  ];
  const total = buildSkill(W6_SKILLS.total, 'w6-total', 12, (i) => {
    const t = totalCases[i];
    const rate = t.a / t.b;
    const answer = rate * t.c;
    const withNoun = (v: number) => `${d2(v)} ${t.noun}`;
    return {
      question: `${t.who} ${t.verb} ${t.a} ${t.noun} in ${t.b} ${t.unit}. At this rate, how many ${t.noun} in ${t.c} ${t.unit}?`,
      answer: withNoun(answer),
      wrong: positive([rate, t.a * t.c, t.a + t.c, t.b * t.c]).filter((v) => d2(v) !== d2(answer)).map(withNoun),
      explanation: `The unit rate is ${t.a} ÷ ${t.b} = ${d2(rate)} ${t.noun} per ${t.unit.replace(/s$/, '')}. Multiply by ${t.c}: ${d2(rate)} × ${t.c} = ${withNoun(answer)}.`,
    };
  });

  type Deal = { item: string; unit: string; xa: number; pa: number; xb: number; pb: number };
  const deals: Deal[] = [
    { item: 'milk tea', unit: 'ounces', xa: 16, pa: 80, xb: 10, pb: 70 },
    { item: 'rice', unit: 'kilograms', xa: 3, pa: 240, xb: 5, pb: 350 },
    { item: 'eggs', unit: 'pieces', xa: 6, pa: 90, xb: 4, pb: 72 },
    { item: 'juice', unit: 'milliliters', xa: 500, pa: 60, xb: 750, pb: 75 },
    { item: 'candy', unit: 'pieces', xa: 12, pa: 96, xb: 8, pb: 56 },
    { item: 'cooking oil', unit: 'liters', xa: 2, pa: 150, xb: 3, pb: 210 },
    { item: 'sugar', unit: 'kilograms', xa: 4, pa: 300, xb: 6, pb: 480 },
    { item: 'pencils', unit: 'pieces', xa: 20, pa: 100, xb: 15, pb: 90 },
    { item: 'coffee', unit: 'grams', xa: 250, pa: 45, xb: 400, pb: 64 },
    { item: 'notebooks', unit: 'pieces', xa: 10, pa: 85, xb: 6, pb: 48 },
    { item: 'ballpens', unit: 'pieces', xa: 8, pa: 56, xb: 5, pb: 40 },
    { item: 'flour', unit: 'grams', xa: 900, pa: 81, xb: 600, pb: 60 },
  ];
  const compare = buildSkill(W6_SKILLS.compare, 'w6-compare', 12, (i) => {
    const d = deals[i];
    // Compare pa/xa with pb/xb exactly, by cross-multiplication.
    const aCheaper = d.pa * d.xb < d.pb * d.xa;
    const answer = aCheaper ? 'Store A is cheaper per unit' : 'Store B is cheaper per unit';
    const options = ['Store A is cheaper per unit', 'Store B is cheaper per unit', 'Both cost the same per unit', 'It cannot be decided'];
    return {
      question: `Store A sells ${d.xa} ${d.unit} of ${d.item} for ${peso(d.pa)}. Store B sells ${d.xb} ${d.unit} of ${d.item} for ${peso(d.pb)}. Which store is the better buy?`,
      answer,
      wrong: options.filter((option) => option !== answer),
      explanation: `Store A: ${d.pa} ÷ ${d.xa} = ${peso(d.pa / d.xa)} per unit. Store B: ${d.pb} ÷ ${d.xb} = ${peso(d.pb / d.xb)} per unit. The lower price per unit is the better buy: ${answer}.`,
    };
  });

  return interleave([unit, total, compare]);
}

// ============================================================== the lessons

export function buildTerm1WeeklyLessons(): WeeklyLesson[] {
  return [
    {
      id: 'lesson-math-7-w1-draw-polygons',
      unit: 'weekly',
      position: 0,
      title: 'Week 1: Naming, Describing and Drawing Polygons',
      description: 'Name polygons by their sides, tell regular from irregular polygons, and plan how to draw a regular polygon with a ruler, protractor and compass.',
      estimatedMinutes: 45,
      competency: {
        code: 'G7-T1-WK1-MG',
        title: 'Draw and describe regular and irregular polygons with 5, 6, 8, or 10 sides, based on measurements of sides and angles, using a ruler and protractor; draw triangles, quadrilaterals, and regular polygons with given angle measures.',
      },
      objectives: [
        { description: 'Name polygons by their number of sides and describe regular and irregular polygons.', skillCodes: [W1_SKILLS.name.code, W1_SKILLS.perimeter.code] },
        { description: 'Find the angle at the centre of a circle that is needed to draw a regular polygon.', skillCodes: [W1_SKILLS.central.code] },
      ],
      sections: [
        {
          heading: '1. What is a polygon?',
          sourceExplanation:
            'A polygon is a closed, flat figure made only of straight sides. The sides meet only at their endpoints, which are called vertices (one corner is a vertex). A figure with a curved side, a gap, or sides that cross each other is not a polygon. A polygon is named by its number of sides: triangle (3), quadrilateral (4), pentagon (5), hexagon (6), heptagon (7), octagon (8), nonagon (9) and decagon (10). It can also be named by its vertices in order, such as triangle ABC.',
          aiExplanation: 'The prefix tells the count: tri- is three, quad- is four, penta- is five, hexa- is six, octa- is eight and deca- is ten. A stop sign is an octagon.',
        },
        {
          heading: '2. Regular and irregular polygons',
          sourceExplanation:
            'A polygon is equilateral when all its sides are equal, and equiangular when all its angles are equal. A regular polygon is both. A polygon that is not regular is irregular. We write "regular" before the name, as in regular pentagon, except that a regular triangle is called an equilateral triangle and a regular quadrilateral is a square. Each interior angle of a regular pentagon is 108°, of a regular hexagon 120°, of a regular octagon 135° and of a regular decagon 144°. The perimeter of a regular polygon with n sides of length s is P = n × s.',
          aiExplanation: 'Equal sides alone are not enough. A rhombus has four equal sides, but its angles are not all equal, so it is not a regular polygon.',
        },
        {
          heading: '3. Drawing a regular polygon',
          sourceExplanation:
            'To draw a regular polygon with n sides: (1) draw a circle with a compass and mark its centre; (2) the angle at the centre between two neighbouring corners is 360° ÷ n, so a pentagon needs 72°, a hexagon 60°, an octagon 45° and a decagon 36°; (3) from one starting point on the circle, use a protractor to mark each central angle around the circle, and make a dot each time; (4) join the dots in order with a ruler. A regular hexagon is special: its side is exactly as long as the radius of the circle. For the other regular polygons the side is NOT equal to the radius, so after drawing, measure a side with a ruler and change the radius of the circle until the side is the length you want.',
          aiExplanation: 'Check your drawing: every side should measure the same, and each corner should match the interior angle for that polygon.',
        },
      ],
      vocabulary: [
        { term: 'Polygon', definition: 'A closed, flat figure made only of straight sides that meet at their endpoints.' },
        { term: 'Vertex', definition: 'A corner of a polygon, where two sides meet.' },
        { term: 'Regular polygon', definition: 'A polygon whose sides are all equal and whose angles are all equal.' },
        { term: 'Irregular polygon', definition: 'A polygon that is not regular.' },
        { term: 'Perimeter', definition: 'The total length of all the sides of a polygon.' },
        { term: 'Central angle', definition: 'The angle at the centre of a circle between the lines to two neighbouring corners of a regular polygon.' },
      ],
      checks: [
        check(2, 'You are drawing a regular decagon inside a circle. At what angle from the centre should the corners be marked?', '36°', ['10°', '72°', '144°'], 'A decagon has 10 corners. A full turn is 360°, so 360° ÷ 10 = 36°.', 'INITIAL'),
        check(1, 'Which regular polygon has sides exactly as long as the radius of the circle it is drawn in?', 'Hexagon', ['Pentagon', 'Octagon', 'Decagon'], 'Only the regular hexagon has this property: Hexagon sides equal the radius.', 'REINFORCEMENT'),
      ],
      skills: [W1_SKILLS.name, W1_SKILLS.perimeter, W1_SKILLS.central],
      bank: buildW1Bank(),
    },
    {
      id: 'lesson-math-7-w2-angle-pairs',
      unit: 'weekly',
      position: 1,
      title: 'Week 2: Convex Polygons and Angle Pairs',
      description: 'Tell convex from non-convex polygons, and use complementary, supplementary, vertical and linear-pair angles to find missing angles.',
      estimatedMinutes: 45,
      competency: {
        code: 'G7-T1-WK2-MG',
        title: 'Describe and explain the relationships between angle pairs based on their measures; classify polygons according to the number of sides, whether they are regular or irregular, and whether they are convex or non-convex.',
      },
      objectives: [
        { description: 'Tell whether a polygon is convex or non-convex from its interior angles.', skillCodes: [W2_SKILLS.convex.code] },
        { description: 'Find the missing angle in complementary, supplementary, vertical and linear-pair relationships.', skillCodes: [W2_SKILLS.compSupp.code, W2_SKILLS.vertLinear.code] },
      ],
      sections: [
        {
          heading: '1. Convex and non-convex polygons',
          sourceExplanation:
            'A polygon is convex when every interior angle is less than 180°. Then a straight line segment drawn between any two points of the polygon stays inside it. A polygon is non-convex (also called concave) when at least one interior angle is more than 180°. That corner points inward, like the inner corner of an L-shaped floor or the notch of an arrowhead. Regular polygons are always convex.',
          aiExplanation: 'A quick test is to look for a dent. If a corner dents inward, the polygon is non-convex.',
        },
        {
          heading: '2. Complementary and supplementary angles',
          sourceExplanation:
            'Two angles are complementary when their measures add up to 90°, and supplementary when they add up to 180°. If one angle is 30°, its complement is 60° and its supplement is 150°. Adjacent angles share a vertex and one common side, and they do not overlap.',
          aiExplanation: 'Complementary and supplementary angles do not have to sit next to each other. Only their sum matters.',
        },
        {
          heading: '3. Linear pairs and vertical angles',
          sourceExplanation:
            'When two straight lines cross, four angles are formed. Two neighbouring angles form a linear pair, and a linear pair is supplementary: together they make 180°. The two angles directly opposite each other are vertical angles, and vertical angles are always equal. If one angle at the crossing is 70°, the angle opposite it is also 70°, and each neighbouring angle is 110°.',
          aiExplanation: 'When you measure with a protractor, your answers may differ by a degree or two. Agree on a rounded value as a class.',
        },
      ],
      vocabulary: [
        { term: 'Convex polygon', definition: 'A polygon in which every interior angle is less than 180°.' },
        { term: 'Non-convex polygon', definition: 'A polygon with at least one interior angle greater than 180°. Also called a concave polygon.' },
        { term: 'Complementary angles', definition: 'Two angles whose measures add up to 90°.' },
        { term: 'Supplementary angles', definition: 'Two angles whose measures add up to 180°.' },
        { term: 'Adjacent angles', definition: 'Two angles that share a vertex and a side and do not overlap.' },
        { term: 'Linear pair', definition: 'Two adjacent angles on a straight line; they add up to 180°.' },
        { term: 'Vertical angles', definition: 'The equal angles directly opposite each other where two lines cross.' },
      ],
      checks: [
        check(0, 'Two angles add up to 90°. What are they called?', 'Complementary angles', ['Supplementary angles', 'Vertical angles', 'Adjacent angles'], 'Angles that add up to 90° are Complementary angles. Supplementary angles add up to 180°.', 'INITIAL'),
        check(3, 'Two straight lines cross and one of the four angles is 130°. What is the angle directly opposite it?', '130°', ['50°', '230°', '90°'], 'Opposite (vertical) angles are equal, so the opposite angle is also 130°.', 'REINFORCEMENT'),
      ],
      skills: [W2_SKILLS.compSupp, W2_SKILLS.vertLinear, W2_SKILLS.convex],
      bank: buildW2Bank(),
    },
    {
      id: 'lesson-math-7-w3-exterior-angles',
      unit: 'weekly',
      position: 2,
      title: 'Week 3: Exterior Angles and Missing Angles of Polygons',
      description: 'Use the exterior angle and its adjacent interior angle, find a missing interior angle, and work with regular polygons.',
      estimatedMinutes: 50,
      competency: {
        code: 'G7-T1-WK3-MG',
        title: 'Deduce the relationship between the exterior angle and adjacent interior angle of a polygon; determine the measures of angles and the number of sides of polygons.',
      },
      objectives: [
        { description: 'Use the fact that an exterior angle and its adjacent interior angle add up to 180°.', skillCodes: [W3_SKILLS.extAdj.code] },
        { description: 'Find a missing interior angle, and the exterior angle or number of sides of a regular polygon.', skillCodes: [W3_SKILLS.missing.code, W3_SKILLS.regular.code] },
      ],
      sections: [
        {
          heading: '1. Interior and exterior angles',
          sourceExplanation:
            'An interior angle is inside the polygon, between two neighbouring sides. If you extend one side past a corner, the angle between that extension and the next side is an exterior angle. At each corner the interior angle and its adjacent exterior angle lie on a straight line, so they add up to 180°: exterior = 180° − interior. Example: an interior angle of 100° has an exterior angle of 80°.',
          aiExplanation: 'Picture a straight road with a side road joining it. The two angles on one side of the side road always add up to 180°.',
        },
        {
          heading: '2. The sum of the interior angles',
          sourceExplanation:
            'The interior angles of a polygon with n sides add up to (n − 2) × 180°. This works because drawing diagonals from one corner cuts the polygon into n − 2 triangles, and each triangle has 180°. If every interior angle but one is known, subtract their total from (n − 2) × 180° to find the missing one. Example: a pentagon has a total of 540°. If four of its angles are 100°, 110°, 120° and 130°, they add up to 460°, so the missing angle is 540° − 460° = 80°.',
          aiExplanation: 'Always find the total for that polygon first, then subtract. Do not use 180° × n, which is too large.',
        },
        {
          heading: '3. Regular polygons',
          sourceExplanation:
            'In a regular polygon all interior angles are equal, so one interior angle is (n − 2) × 180° ÷ n. The exterior angles of any polygon add up to 360°, so one exterior angle of a regular polygon is 360° ÷ n. To find the number of sides, divide 360° by the exterior angle. Example: if each interior angle is 144°, each exterior angle is 180° − 144° = 36°, and the polygon has 360 ÷ 36 = 10 sides, a decagon.',
          aiExplanation: 'Check by adding: the exterior angle 36° and the interior angle 144° make 180°.',
        },
      ],
      vocabulary: [
        { term: 'Interior angle', definition: 'An angle inside a polygon, between two neighbouring sides.' },
        { term: 'Exterior angle', definition: 'The angle between one side and the extension of the neighbouring side.' },
        { term: 'Adjacent angles', definition: 'Angles that share a vertex and a side. An exterior angle and the interior angle next to it add up to 180°.' },
        { term: 'Diagonal', definition: 'A line segment joining two corners of a polygon that are not neighbours.' },
        { term: 'Sum of interior angles', definition: 'The total of all interior angles of a polygon, (n − 2) × 180°.' },
      ],
      checks: [
        check(1, 'An interior angle of a polygon is 112°. What is the adjacent exterior angle?', '68°', ['112°', '78°', '248°'], 'The two angles lie on a straight line, so they add up to 180°: 180° − 112° = 68°.', 'INITIAL'),
        check(2, 'Five angles of a hexagon measure 100°, 110°, 120°, 130° and 140°. What is the sixth angle?', '120°', ['240°', '180°', '60°'], 'A hexagon\'s angles add up to (6 − 2) × 180° = 720°. The five known angles add up to 600°, so the sixth is 720° − 600° = 120°.', 'REINFORCEMENT'),
      ],
      skills: [W3_SKILLS.extAdj, W3_SKILLS.missing, W3_SKILLS.regular],
      bank: buildW3Bank(),
    },
    {
      id: 'lesson-math-7-w4-percentage-change',
      unit: 'weekly',
      position: 3,
      title: 'Week 4: Percentage Increase and Decrease',
      description: 'Find the percentage increase or decrease between two values, and work backwards to the original value.',
      estimatedMinutes: 50,
      competency: {
        code: 'G7-T1-WK4-NA',
        title: 'Solve problems involving percentage increase and percentage decrease.',
      },
      objectives: [
        { description: 'Find the percentage increase or decrease from an original value and a new value.', skillCodes: [W4_SKILLS.increase.code, W4_SKILLS.decrease.code] },
        { description: 'Find the original value before a percentage increase or decrease.', skillCodes: [W4_SKILLS.original.code] },
      ],
      sections: [
        {
          heading: '1. Percentage increase',
          sourceExplanation:
            'Percentage increase tells how much a value grew compared with where it started: percentage increase = (new value − original value) ÷ original value × 100%. Always divide by the ORIGINAL value. Example: a product that costs ₱200 rises to ₱280. The increase is ₱80, and 80 ÷ 200 = 0.40, so the percentage increase is 40%.',
          aiExplanation: 'Do not divide by the new value. Dividing 80 by 280 would give about 29%, which is not the percentage increase.',
        },
        {
          heading: '2. Percentage decrease',
          sourceExplanation:
            'Percentage decrease works the same way for a drop: percentage decrease = (original value − new value) ÷ original value × 100%. Example: a pair of pants goes from ₱850 to ₱500. The decrease is ₱350, and 350 ÷ 850 is about 0.41, so the percentage decrease is about 41%.',
          aiExplanation: 'Both formulas use the original value in the denominator. Only the top changes: new − original for an increase, original − new for a decrease.',
        },
        {
          heading: '3. Working backwards',
          sourceExplanation:
            'Sometimes the new value and the percent are known, and you need the original. After a 25% increase the new value is 125% of the original. After a 16% decrease the new value is 84% of the original. Divide the new value by that percent written as a decimal. Example: after a 16% decrease there are 1,512 left. 1,512 ÷ 0.84 = 1,800, so the original was 1,800. Check: 16% of 1,800 is 288, and 1,800 − 288 = 1,512.',
          aiExplanation: 'Taking 16% off 1,512 would be wrong, because the 16% was taken from the original amount, not from what was left.',
        },
      ],
      vocabulary: [
        { term: 'Original value', definition: 'The value before the change. Percentage change is always measured against it.' },
        { term: 'New value', definition: 'The value after the change.' },
        { term: 'Percentage increase', definition: 'How much a value grew, as a percent of the original value.' },
        { term: 'Percentage decrease', definition: 'How much a value fell, as a percent of the original value.' },
        { term: 'Percent', definition: 'A number out of 100, written with the % sign.' },
      ],
      checks: [
        check(0, 'A price rises from ₱250 to ₱300. What is the percentage increase?', '20%', ['50%', '16.67%', '120%'], 'The increase is 300 − 250 = 50. Divide by the original: 50 ÷ 250 = 0.20, which is 20%.', 'INITIAL'),
        check(3, 'A phone drops in value from ₱10000 to ₱7500. What is the percentage decrease?', '25%', ['33.33%', '75%', '10%'], 'The decrease is 10000 − 7500 = 2500. Divide by the original: 2500 ÷ 10000 = 0.25, which is 25%.', 'REINFORCEMENT'),
      ],
      skills: [W4_SKILLS.increase, W4_SKILLS.decrease, W4_SKILLS.original],
      bank: buildW4Bank(),
    },
    {
      id: 'lesson-math-7-w5-money-percent',
      unit: 'weekly',
      position: 4,
      title: 'Week 5: Money Problems with Percentages and a Simple Budget',
      description: 'Work out original prices, simple interest and commissions, and use percentages to plan your own budget.',
      estimatedMinutes: 55,
      competency: {
        code: 'G7-T1-WK5-NA',
        title: 'Solve money problems involving percentages (e.g., discount, commission, sales tax, simple interest); create a financial plan.',
      },
      objectives: [
        { description: 'Find the original price from a sale price and a discount rate.', skillCodes: [W5_SKILLS.original.code] },
        { description: 'Use I = Prt to find the interest, the principal, the rate or the time.', skillCodes: [W5_SKILLS.interest.code] },
        { description: 'Use percentages to plan savings and spending in a simple budget.', skillCodes: [W5_SKILLS.budget.code] },
      ],
      sections: [
        {
          heading: '1. Discount, sale price and sales tax',
          sourceExplanation:
            'Discount = original price × discount rate, and sale price = original price − discount. Sales tax = price × tax rate, and the total to pay = price + sales tax. Example: a ₱300 shirt with a 25% discount has a discount of ₱75 and a sale price of ₱225. If you know the sale price and the rate, the sale price is (100% − rate) of the original, so original price = sale price ÷ (1 − rate). Example: a book is sold for ₱440 after a 12% discount. 440 ÷ 0.88 = ₱500.',
          aiExplanation: 'Taking 12% off ₱440 again would be wrong. The 12% was taken off the original price, which is what we want to find.',
        },
        {
          heading: '2. Commission and simple interest',
          sourceExplanation:
            'Commission = total sales × commission rate, so commission rate = commission ÷ total sales × 100%. Simple interest is I = P × r × t, where P is the amount invested or borrowed (the principal), r is the yearly rate written as a decimal and t is the time in years. The formula can be turned around: P = I ÷ (r × t), r = I ÷ (P × t) and t = I ÷ (P × r). Example: ₱85,000 borrowed at 6% a year costs ₱20,400 in interest. t = 20,400 ÷ (85,000 × 0.06) = 20,400 ÷ 5,100 = 4 years.',
          aiExplanation: 'Change the percent to a decimal first: 6% is 0.06. Forgetting to do so is the most common slip with simple interest.',
        },
        {
          heading: '3. Making a simple budget',
          sourceExplanation:
            'A budget is a plan for your money. List your income, then decide how much goes to savings first, then to needs such as food and fare, and then to wants. Percentages make it easy to adjust: with a weekly allowance of ₱500, saving 20% means ₱100 is set aside first and ₱400 is left to spend. A budget is only useful if you compare it with what you really spent at the end of the week, and then adjust the percentages if you need to.',
          aiExplanation: 'Try it for your own allowance for one week: write the income, the savings goal, the needs and what is left for wants.',
        },
      ],
      vocabulary: [
        { term: 'Discount', definition: 'An amount taken off the original price.' },
        { term: 'Sale price', definition: 'The price after the discount has been taken off.' },
        { term: 'Commission', definition: 'A percentage of the sales paid to the person who made the sales.' },
        { term: 'Simple interest', definition: 'Interest computed only on the original amount: I = P × r × t.' },
        { term: 'Principal', definition: 'The amount of money that is invested or borrowed.' },
        { term: 'Budget', definition: 'A plan that shows how income will be saved and spent.' },
      ],
      checks: [
        check(2, 'A jacket is sold for ₱680 after a 15% discount. What was its original price?', '₱800', ['₱782', '₱578', '₱695'], 'The sale price is 85% of the original. 680 ÷ 0.85 = ₱800.', 'INITIAL'),
        check(1, 'How much simple interest does ₱20000 earn at 4% per year in 3 years?', '₱2400', ['₱800', '₱240', '₱22400'], 'I = P × r × t = 20000 × 0.04 × 3 = ₱2400.', 'REINFORCEMENT'),
      ],
      skills: [W5_SKILLS.original, W5_SKILLS.interest, W5_SKILLS.budget],
      bank: buildW5Bank(),
    },
    {
      id: 'lesson-math-7-w6-rates',
      unit: 'weekly',
      position: 5,
      title: 'Week 6: Rates and Unit Rates',
      description: 'Tell a rate from a ratio, write unit rates, and use them to find totals and to compare deals.',
      estimatedMinutes: 45,
      competency: {
        code: 'G7-T1-WK6-NA',
        title: 'Identify and explain the uses of rates; solve problems involving rates (e.g., speed).',
      },
      objectives: [
        { description: 'Tell a rate from a ratio and write a rate as a unit rate.', skillCodes: [W6_SKILLS.unit.code] },
        { description: 'Use a unit rate to find a total, and compare deals by their unit rates.', skillCodes: [W6_SKILLS.total.code, W6_SKILLS.compare.code] },
      ],
      sections: [
        {
          heading: '1. Ratios and rates',
          sourceExplanation:
            'A ratio compares two quantities that have the same unit, such as 3 boys to 5 girls, written 3 : 5. A rate compares two quantities that have different units, such as 60 kilometers in 2 hours or ₱150 for 3 kilograms. Rates describe speed (kilometers per hour), wages (pesos per day), work done (pages per hour) and prices (pesos per kilogram).',
          aiExplanation: 'If you can write the units on both numbers and they differ, it is a rate. If they are the same kind of thing, it is a ratio.',
        },
        {
          heading: '2. Unit rates',
          sourceExplanation:
            'A unit rate has 1 in the denominator: it tells how much for ONE of something. To change a rate to a unit rate, divide the first quantity by the second. Example: 200 words in 5 minutes is 200 ÷ 5 = 40 words per minute. Example: ₱375 for 1½ hours of work is 375 ÷ 1.5 = ₱250 per hour.',
          aiExplanation: 'The speed of a moving object is a unit rate too: distance divided by time.',
        },
        {
          heading: '3. Using unit rates',
          sourceExplanation:
            'Once you know the unit rate, multiply it by the amount you want. If a jogger covers 3 km each hour, in 5 hours the jogger covers 3 × 5 = 15 km. To compare two deals, find each unit rate and compare them. A 16-ounce drink for ₱80 costs ₱5 per ounce, and a 10-ounce drink for ₱70 costs ₱7 per ounce, so the 16-ounce drink is the better buy.',
          aiExplanation: 'A bigger pack is not always the cheaper one. Always compare the price for one unit.',
        },
      ],
      vocabulary: [
        { term: 'Ratio', definition: 'A comparison of two quantities that have the same unit.' },
        { term: 'Rate', definition: 'A comparison of two quantities that have different units.' },
        { term: 'Unit rate', definition: 'A rate with 1 in the denominator: the amount for one unit.' },
        { term: 'Speed', definition: 'A unit rate that tells how far something moves in one unit of time.' },
        { term: 'Better buy', definition: 'The deal with the lower price for one unit of the same item.' },
      ],
      checks: [
        check(3, 'A plane flies 2220 km in 3 hours. What is its speed?', '740 km/h', ['6660 km/h', '2217 km/h', '74 km/h'], 'Speed is distance ÷ time: 2220 ÷ 3 = 740 km/h.', 'INITIAL'),
        check(0, 'A tutor earns ₱1350 in 5 days at a steady rate. How much does the tutor earn in 8 days?', '₱2160', ['₱1620', '₱6750', '₱270'], 'The unit rate is 1350 ÷ 5 = ₱270 per day. In 8 days: 270 × 8 = ₱2160.', 'REINFORCEMENT'),
      ],
      skills: [W6_SKILLS.unit, W6_SKILLS.total, W6_SKILLS.compare],
      bank: buildW6Bank(),
    },
  ];
}
