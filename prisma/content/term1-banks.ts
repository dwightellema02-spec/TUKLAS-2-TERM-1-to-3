/**
 * Grade 7 Term 1 practice banks (MATATAG Budget of Work, First Term).
 *
 * Every answer is COMPUTED from the numbers in the question, never typed by hand. Every wrong
 * option models a common mistake (wrong formula, wrong operation, sign slip, missing step).
 * Tests re-derive each answer from the question text with an independent oracle.
 *
 * Skills are interleaved (round robin) so any prefix of a lesson's bank is a mixed set.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type SkillDef = { code: string; name: string; description: string };

export type BankQuestion = {
  id: string;
  position: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  skill: string;
  skillCode: string;
  difficulty: Difficulty;
};

const DIFFICULTY_CYCLE: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/** Rounded so float noise never reaches a student (answers here have at most 3 decimals). */
export const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** Text form of a number: true minus sign, no trailing zeros. */
export const num = (n: number) => {
  const value = clean(n);
  return value < 0 ? `−${Math.abs(value)}` : String(value);
};
export const show = (n: number) => (n < 0 ? `(${num(n)})` : num(n));
export const deg = (n: number) => `${num(n)}°`;
export const peso = (n: number) => `₱${num(n)}`;
export const pct = (n: number) => `${num(n)}%`;

export type Item = {
  question: string;
  answer: string;
  /** Candidate wrong options, most plausible first. */
  wrong: string[];
  explanation: string;
  difficulty?: Difficulty;
};

type Maker = (index: number) => Item;

export function textsFrom(values: number[], fmt: (n: number) => string, answer: number): string[] {
  return values.filter((v) => Number.isFinite(v) && clean(v) !== clean(answer)).map(fmt);
}

function finish(skill: SkillDef, index: number, item: Item, tag: string): Omit<BankQuestion, 'position'> {
  const wrong: string[] = [];
  for (const candidate of item.wrong) {
    if (candidate !== item.answer && !wrong.includes(candidate)) wrong.push(candidate);
    if (wrong.length === 3) break;
  }
  if (wrong.length !== 3) throw new Error(`${skill.code} item ${index} needs 3 distinct wrong options.`);
  // Rotate the slot of the right answer so it is not always in the same place.
  const correctIndex = index % 4;
  const options: string[] = [];
  let cursor = 0;
  for (let slot = 0; slot < 4; slot += 1) options.push(slot === correctIndex ? item.answer : wrong[cursor++]);
  return {
    id: `practice-${tag}-${String(index + 1).padStart(2, '0')}`,
    question: item.question,
    options,
    correctIndex,
    explanation: item.explanation,
    skill: skill.name,
    skillCode: skill.code,
    difficulty: item.difficulty ?? DIFFICULTY_CYCLE[index % 3],
  };
}

export function buildSkill(skill: SkillDef, tag: string, count: number, make: Maker) {
  return Array.from({ length: count }, (_, index) => finish(skill, index, make(index), tag));
}

/** Round-robin the skills so every prefix is a mixed set; positions start at 100. */
export function interleave(banks: Array<Array<Omit<BankQuestion, 'position'>>>): BankQuestion[] {
  const out: BankQuestion[] = [];
  const rounds = Math.max(...banks.map((bank) => bank.length));
  for (let round = 0; round < rounds; round += 1) {
    for (const bank of banks) if (bank[round]) out.push({ ...bank[round], position: 100 + out.length });
  }
  return out;
}

// ---------------------------------------------------------------- Polygons

export const POLYGON_SKILLS = {
  sum: { code: 'G7-POLY-SUM', name: 'Interior angle sum of a polygon', description: 'Find the sum of the interior angles using (n − 2) × 180°.' },
  regular: { code: 'G7-POLY-REG', name: 'Interior angle of a regular polygon', description: 'Find one interior angle of a regular polygon.' },
  exterior: { code: 'G7-POLY-EXT', name: 'Sides from the exterior angle', description: 'Use the 360° exterior angle sum to find the number of sides.' },
} satisfies Record<string, SkillDef>;

export function buildPolygonBank(): BankQuestion[] {
  const sumSides = [3, 4, 5, 6, 8, 10, 7, 9, 12, 15, 20, 11];
  const regularSides = [3, 4, 5, 6, 8, 10, 9, 12, 15, 18, 20, 24];
  const exteriorAngles = [120, 90, 72, 60, 45, 40, 36, 30, 24, 20, 18, 15];

  const sum = buildSkill(POLYGON_SKILLS.sum, 'poly-sum', 12, (i) => {
    const n = sumSides[i];
    const total = (n - 2) * 180;
    return {
      question: `What is the sum of the interior angles of a polygon with ${n} sides?`,
      answer: deg(total),
      wrong: textsFrom([n * 180, (n - 1) * 180, (n - 2) * 90, 360], deg, total),
      explanation: `The interior angles of an n-sided polygon add up to (n − 2) × 180°. With n = ${n}: (${n} − 2) × 180° = ${deg(total)}.`,
    };
  });

  const regular = buildSkill(POLYGON_SKILLS.regular, 'poly-reg', 12, (i) => {
    const n = regularSides[i];
    const each = ((n - 2) * 180) / n;
    return {
      question: `How large is each interior angle of a regular polygon with ${n} sides?`,
      answer: deg(each),
      wrong: textsFrom([360 / n, (n - 2) * 180, each + 10, each - 10, 180], deg, each),
      explanation: `All ${n} angles of a regular polygon are equal, so divide the total (${n} − 2) × 180° by ${n}: ${(n - 2) * 180}° ÷ ${n} = ${deg(each)}.`,
    };
  });

  const exterior = buildSkill(POLYGON_SKILLS.exterior, 'poly-ext', 12, (i) => {
    const e = exteriorAngles[i];
    const n = 360 / e;
    return {
      question: `Each exterior angle of a regular polygon measures ${e}°. How many sides does the polygon have?`,
      answer: num(n),
      wrong: textsFrom([n + 1, n - 1, e, 2 * n, n + 2], num, n),
      explanation: `The exterior angles of any polygon add up to 360°, so the number of sides is 360° ÷ ${e}° = ${num(n)}.`,
    };
  });

  return interleave([sum, regular, exterior]);
}

// ------------------------------------------------------------- Percentages

export const PERCENT_SKILLS = {
  change: { code: 'G7-PCT-CHANGE', name: 'Percentage increase and decrease', description: 'Find a new value after a percentage increase or decrease.' },
  money: { code: 'G7-PCT-MONEY', name: 'Money problems with percentages', description: 'Solve discount, sales tax, commission and simple interest problems.' },
} satisfies Record<string, SkillDef>;

export function buildPercentBank(): BankQuestion[] {
  const changes: Array<[number, number, 'up' | 'down']> = [
    [200, 10, 'up'], [500, 20, 'down'], [640, 25, 'up'], [100, 15, 'up'], [300, 10, 'down'], [820, 5, 'up'],
    [1200, 15, 'down'], [900, 40, 'up'], [260, 15, 'down'], [1500, 12, 'up'], [2400, 35, 'down'], [740, 20, 'up'],
  ];
  const change = buildSkill(PERCENT_SKILLS.change, 'pct-change', 12, (i) => {
    const [price, rate, dir] = changes[i];
    const amount = (price * rate) / 100;
    const result = dir === 'up' ? price + amount : price - amount;
    const wrongValues =
      dir === 'up'
        ? [price + rate, amount, price - amount, price + 2 * amount]
        : [price - rate, amount, price + amount, price - 2 * amount];
    return {
      question: `A jacket costs ${peso(price)}. Its price ${dir === 'up' ? 'increases' : 'decreases'} by ${rate}%. What is the new price?`,
      answer: peso(result),
      wrong: textsFrom(wrongValues.filter((v) => v > 0), peso, result),
      explanation: `${rate}% of ${peso(price)} is ${peso(amount)}. ${dir === 'up' ? 'Add' : 'Subtract'} it: ${price} ${dir === 'up' ? '+' : '−'} ${amount} = ${peso(result)}.`,
    };
  });

  type Money =
    | { kind: 'discount'; price: number; rate: number }
    | { kind: 'tax'; price: number; rate: number }
    | { kind: 'commission'; sales: number; rate: number }
    | { kind: 'interest'; principal: number; rate: number; years: number };
  const money: Money[] = [
    { kind: 'discount', price: 800, rate: 25 },
    { kind: 'tax', price: 500, rate: 12 },
    { kind: 'commission', sales: 40000, rate: 5 },
    { kind: 'interest', principal: 10000, rate: 6, years: 2 },
    { kind: 'discount', price: 1500, rate: 20 },
    { kind: 'tax', price: 2500, rate: 12 },
    { kind: 'commission', sales: 85000, rate: 3 },
    { kind: 'interest', principal: 25000, rate: 4, years: 3 },
    { kind: 'discount', price: 2400, rate: 15 },
    { kind: 'tax', price: 1200, rate: 12 },
    { kind: 'commission', sales: 120000, rate: 4 },
    { kind: 'interest', principal: 20000, rate: 3, years: 2 },
  ];
  const moneySkill = buildSkill(PERCENT_SKILLS.money, 'pct-money', 12, (i) => {
    const m = money[i];
    if (m.kind === 'discount') {
      const off = (m.price * m.rate) / 100;
      const sale = m.price - off;
      return {
        question: `A pair of shoes is marked ${peso(m.price)}. It is sold at a ${m.rate}% discount. What is the sale price?`,
        answer: peso(sale),
        wrong: textsFrom([off, m.price + off, m.price - m.rate, m.price - 2 * off], peso, sale),
        explanation: `The discount is ${m.rate}% of ${peso(m.price)} = ${peso(off)}. Subtract it from the marked price: ${m.price} − ${off} = ${peso(sale)}.`,
      };
    }
    if (m.kind === 'tax') {
      const tax = (m.price * m.rate) / 100;
      const total = m.price + tax;
      return {
        question: `A phone costs ${peso(m.price)} before a ${m.rate}% sales tax. What is the total price including the tax?`,
        answer: peso(total),
        wrong: textsFrom([tax, m.price - tax, m.price + m.rate, m.price + 2 * tax], peso, total),
        explanation: `The tax is ${m.rate}% of ${peso(m.price)} = ${peso(tax)}. Add it to the price: ${m.price} + ${tax} = ${peso(total)}.`,
      };
    }
    if (m.kind === 'commission') {
      const earned = (m.sales * m.rate) / 100;
      return {
        question: `An agent earns a ${m.rate}% commission on ${peso(m.sales)} of sales. How much commission does the agent earn?`,
        answer: peso(earned),
        wrong: textsFrom([m.sales * m.rate, m.sales - earned, earned * 10, earned / 10].filter(Number.isInteger), peso, earned),
        explanation: `Commission is a percentage of the sales: ${m.rate}% of ${peso(m.sales)} = ${peso(earned)}.`,
      };
    }
    const interest = (m.principal * m.rate * m.years) / 100;
    return {
      question: `${peso(m.principal)} is deposited at ${m.rate}% simple interest per year for ${m.years} years. How much interest is earned?`,
      answer: peso(interest),
      wrong: textsFrom([(m.principal * m.rate) / 100, m.principal + interest, m.principal * m.rate * m.years, interest * 10], peso, interest),
      explanation: `Simple interest = principal × rate × time = ${m.principal} × ${m.rate}% × ${m.years} = ${peso(interest)}.`,
    };
  });

  return interleave([change, moneySkill]);
}

// ------------------------------------------------------------------- Rates

export const RATE_SKILLS = {
  speed: { code: 'G7-RATE-SPEED', name: 'Speed, distance and time', description: 'Solve problems with speed = distance ÷ time.' },
  unit: { code: 'G7-RATE-UNIT', name: 'Unit rates', description: 'Find a unit rate and use it to find a total.' },
} satisfies Record<string, SkillDef>;

export function buildRateBank(): BankQuestion[] {
  const kmh = (n: number) => `${num(n)} km/h`;
  const km = (n: number) => `${num(n)} km`;
  const hours = (n: number) => `${num(n)} ${n === 1 ? 'hour' : 'hours'}`;

  // Cycle: speed, distance, time. Numbers are chosen so every answer is a whole number.
  const speedCases = [
    { d: 120, t: 2 }, { v: 40, t: 3 }, { d: 150, v: 50 },
    { d: 180, t: 4 }, { v: 75, t: 2 }, { d: 240, v: 60 },
    { d: 240, t: 3 }, { v: 90, t: 4 }, { d: 360, v: 90 },
    { d: 250, t: 5 }, { v: 55, t: 6 }, { d: 420, v: 70 },
  ];
  const speed = buildSkill(RATE_SKILLS.speed, 'rate-speed', 12, (i) => {
    const c = speedCases[i] as { d?: number; v?: number; t?: number };
    if (c.d !== undefined && c.t !== undefined) {
      const v = c.d / c.t;
      return {
        question: `A bus travels ${c.d} km in ${c.t} hours at a constant speed. What is its speed in kilometers per hour?`,
        answer: kmh(v),
        wrong: textsFrom([c.d * c.t, c.d + c.t, c.d - c.t, v + 10, v - 10], kmh, v),
        explanation: `Speed = distance ÷ time = ${c.d} km ÷ ${c.t} h = ${kmh(v)}.`,
      };
    }
    if (c.v !== undefined && c.t !== undefined) {
      const d = c.v * c.t;
      return {
        question: `A car moves at ${c.v} km/h for ${c.t} hours. How far does it travel?`,
        answer: km(d),
        wrong: textsFrom([c.v + c.t, c.v * (c.t - 1), c.v * (c.t + 1), d + 10], km, d),
        explanation: `Distance = speed × time = ${c.v} km/h × ${c.t} h = ${km(d)}.`,
      };
    }
    const d = c.d as number;
    const v = c.v as number;
    const t = d / v;
    return {
      question: `A train covers ${d} km at ${v} km/h. How long does the trip take?`,
      answer: hours(t),
      wrong: textsFrom([d * v, d - v, t + 1, t - 1, t * 2], hours, t),
      explanation: `Time = distance ÷ speed = ${d} km ÷ ${v} km/h = ${hours(t)}.`,
    };
  });

  const unitCases = [
    { n: 6, u: 15 }, { u: 48, m: 5 }, { n: 10, u: 24 }, { u: 52, m: 12 },
    { n: 8, u: 35 }, { u: 65, m: 8 }, { n: 12, u: 18 }, { u: 38, m: 15 },
    { n: 20, u: 9 }, { u: 75, m: 20 }, { n: 15, u: 22 }, { u: 55, m: 9 },
  ];
  const unit = buildSkill(RATE_SKILLS.unit, 'rate-unit', 12, (i) => {
    const c = unitCases[i] as { n?: number; u: number; m?: number };
    if (c.n !== undefined) {
      const cost = c.n * c.u;
      return {
        question: `${c.n} notebooks cost ${peso(cost)}. What is the price of one notebook?`,
        answer: peso(c.u),
        wrong: textsFrom([c.n, cost - c.n, c.u + 5, c.u - 3, c.u * 2], peso, c.u),
        explanation: `A unit rate is the amount for one: ${cost} ÷ ${c.n} = ${peso(c.u)} per notebook.`,
      };
    }
    const m = c.m as number;
    const total = c.u * m;
    return {
      question: `Rice costs ${peso(c.u)} per kilogram. How much do ${m} kilograms cost?`,
      answer: peso(total),
      wrong: textsFrom([c.u + m, c.u * (m - 1), c.u * (m + 1), total - 10], peso, total),
      explanation: `Multiply the unit rate by the amount: ${c.u} × ${m} = ${peso(total)}.`,
    };
  });

  return interleave([speed, unit]);
}

// ------------------------------------------------------- Rational numbers

export const RATIONAL_SKILLS = {
  convert: { code: 'G7-RAT-CONVERT', name: 'Fractions, decimals and percents', description: 'Rewrite a rational number as a fraction, decimal or percent.' },
  ops: { code: 'G7-RAT-OPS', name: 'Operations on decimals', description: 'Add, subtract, multiply and divide positive and negative decimals.' },
} satisfies Record<string, SkillDef>;

export function buildRationalBank(): BankQuestion[] {
  const fractions: Array<[number, number]> = [
    [1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 8], [3, 8], [5, 8], [7, 8], [3, 20],
  ];
  const convert = buildSkill(RATIONAL_SKILLS.convert, 'rat-convert', 12, (i) => {
    const [a, b] = fractions[i];
    const dec = clean(a / b);
    const percent = clean((a / b) * 100);
    const kind = Math.floor(i / 4);
    if (kind === 0) {
      return {
        question: `Write ${a}/${b} as a decimal.`,
        answer: num(dec),
        wrong: textsFrom([Number(`0.${a}${b}`), 1 - dec, dec * 10, dec / 10, b / a], num, dec),
        explanation: `A fraction is a division: ${a} ÷ ${b} = ${num(dec)}.`,
      };
    }
    if (kind === 1) {
      return {
        question: `Write ${a}/${b} as a percent.`,
        answer: pct(percent),
        wrong: textsFrom([percent / 10, percent * 10, dec, 100 - percent, percent + 5], pct, percent),
        explanation: `Divide, then multiply by 100: ${a} ÷ ${b} = ${num(dec)}, and ${num(dec)} × 100 = ${pct(percent)}.`,
      };
    }
    return {
      question: `Write ${num(dec)} as a percent.`,
      answer: pct(percent),
      wrong: textsFrom([dec, percent * 10, percent / 10, 100 - percent], pct, percent),
      explanation: `To change a decimal to a percent, multiply by 100: ${num(dec)} × 100 = ${pct(percent)}.`,
    };
  });

  const cases: Array<[number, number, '+' | '−' | '×' | '÷']> = [
    [1.5, 2.25, '+'], [-3.4, 1.2, '+'], [-0.75, -2.5, '+'],
    [5.6, 2.9, '−'], [-1.8, 3.2, '−'], [4.25, -1.5, '−'],
    [0.5, 0.8, '×'], [-1.2, 3, '×'], [-2.5, -0.4, '×'],
    [4.8, 2, '÷'], [-7.5, 2.5, '÷'], [0.36, -0.9, '÷'],
  ];
  const ops = buildSkill(RATIONAL_SKILLS.ops, 'rat-ops', 12, (i) => {
    const [a, b, op] = cases[i];
    const result = clean(op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b);
    if (Math.abs(result * 100 - Math.round(result * 100)) > 1e-9) throw new Error(`Decimal item ${i} is not terminating.`);
    const wrongValues =
      op === '+'
        ? [-result, Math.abs(a) + Math.abs(b), a - b, result + 1]
        : op === '−'
          ? [a + b, b - a, -result, result * 10]
          : op === '×'
            ? [result * 10, result / 10, -result, a + b]
            : [result * 10, result / 10, -result, a - b];
    const hurdles =
      [a, b].filter((n) => n < 0).length +
      ([a, b].some((n) => Math.round(Math.abs(n) * 100) % 10 !== 0) ? 1 : 0) +
      (op === '−' || op === '÷' ? 1 : 0);
    const explanations: Record<typeof op, string> = {
      '+': 'Add decimals by lining up the decimal points, and use the integer sign rules.',
      '−': 'Subtracting a number is adding its opposite; line up the decimal points.',
      '×': 'Multiply as whole numbers, then place the decimal point; same signs give a positive product, different signs a negative one.',
      '÷': 'Same signs give a positive quotient, different signs a negative one; move the decimal point so you divide by a whole number.',
    };
    return {
      question: `What is ${show(a)} ${op} ${show(b)}?`,
      answer: num(result),
      wrong: textsFrom(wrongValues, num, result),
      explanation: `${explanations[op]} ${show(a)} ${op} ${show(b)} = ${num(result)}.`,
      difficulty: hurdles <= 1 ? 'EASY' : hurdles === 2 ? 'MEDIUM' : 'HARD',
    };
  });

  return interleave([convert, ops]);
}

// ------------------------------------------------------------------- Roots

export const ROOT_SKILLS = {
  square: { code: 'G7-ROOT-SQ', name: 'Square roots of perfect squares', description: 'Find the square root of a perfect square.' },
  cube: { code: 'G7-ROOT-CUBE', name: 'Cube roots of perfect cubes', description: 'Find the cube root of a perfect cube, including negative cubes.' },
  locate: { code: 'G7-ROOT-LOC', name: 'Locating square roots between integers', description: 'Place the square root of a non-perfect square between two consecutive integers.' },
} satisfies Record<string, SkillDef>;

export function buildRootBank(): BankQuestion[] {
  const squareRoots = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15];
  const square = buildSkill(ROOT_SKILLS.square, 'root-sq', 12, (i) => {
    const r = squareRoots[i];
    const n = r * r;
    return {
      question: `What is the square root of ${n}?`,
      answer: num(r),
      wrong: textsFrom([r + 1, r - 1, 2 * r, n % 2 === 0 ? n / 2 : r + 2, r + 2], num, r),
      explanation: `A square root undoes squaring. Since ${r} × ${r} = ${n}, √${n} = ${num(r)}.`,
    };
  });

  const cubeRoots = [2, 3, 4, 5, 6, 7, 8, 9, 10, -3, -4, -5];
  const cube = buildSkill(ROOT_SKILLS.cube, 'root-cube', 12, (i) => {
    const r = cubeRoots[i];
    const n = r * r * r;
    return {
      question: `What is the cube root of ${num(n)}?`,
      answer: num(r),
      wrong: textsFrom([-r, r + 1, r - 1, n / 3, 3 * r].filter(Number.isInteger), num, r),
      explanation: `A cube root undoes cubing. Since ${show(r)} × ${show(r)} × ${show(r)} = ${num(n)}, ∛${num(n)} = ${num(r)}.`,
    };
  });

  const locateNs = [2, 3, 5, 7, 8, 10, 12, 20, 30, 40, 50, 90];
  const locate = buildSkill(ROOT_SKILLS.locate, 'root-loc', 12, (i) => {
    const n = locateNs[i];
    const k = Math.floor(Math.sqrt(n));
    const pair = (low: number) => `${low} and ${low + 1}`;
    return {
      question: `Between which two consecutive integers does √${n} lie?`,
      answer: pair(k),
      wrong: [pair(k + 1), pair(k - 1), pair(k + 2), pair(Math.floor(n / 2))].filter((_, idx) => idx !== 1 || k - 1 >= 0),
      explanation: `${k}² = ${k * k} and ${k + 1}² = ${(k + 1) * (k + 1)}, and ${n} is between them, so √${n} is between ${pair(k)}.`,
    };
  });

  return interleave([square, cube, locate]);
}
