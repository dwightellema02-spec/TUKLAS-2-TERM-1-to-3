/**
 * Grade 7 Mathematics, First Term lessons (master plan §8, §10).
 *
 * Aligned to the First Term learning competencies of the DepEd MATATAG Grade 7 Mathematics
 * Budget of Work (updated April 17, 2026). Competency codes below are TUKLAS identifiers
 * (not official DepEd codes). Lesson text is drafted for teacher review; practice answers
 * are computed (see term1-banks.ts).
 *
 * Competencies NOT yet covered by a lesson: W1 (drawing polygons with ruler and protractor,
 * a hands-on task), W5 (creating a financial plan; a short guide is included but there is no
 * graded practice), and operations on FRACTIONS in W8-9 (practice covers decimals).
 */

import {
  buildPercentBank,
  buildPolygonBank,
  buildRateBank,
  buildRationalBank,
  buildRootBank,
  PERCENT_SKILLS,
  POLYGON_SKILLS,
  RATE_SKILLS,
  RATIONAL_SKILLS,
  ROOT_SKILLS,
  num,
  type BankQuestion,
  type SkillDef,
} from './term1-banks';

export const TERM1_SOURCE = 'DepEd MATATAG Grade 7 Mathematics Budget of Work, First Term (updated April 17, 2026)';

export type Term1Unit = { id: string; position: number; title: string; description: string };

/** Position 0 and 2 are used by the demo unit and the integers unit. */
export const TERM1_UNITS: Record<'geometry' | 'percentRates' | 'rational', Term1Unit> = {
  geometry: {
    id: 'unit-math-7-term1-geometry',
    position: 1,
    title: 'Measurement and Geometry: Polygons',
    description: 'Regular and irregular polygons, and the interior and exterior angles of polygons.',
  },
  percentRates: {
    id: 'unit-math-7-term1-percent-rates',
    position: 3,
    title: 'Percentages and Rates',
    description: 'Percentage change, money problems with percentages, and rates such as speed.',
  },
  rational: {
    id: 'unit-math-7-term1-rational',
    position: 4,
    title: 'Rational and Irrational Numbers',
    description: 'Rational numbers as fractions, decimals and percents; square roots, cube roots and irrational numbers.',
  },
};

export type Term1Check = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  purpose: 'INITIAL' | 'REINFORCEMENT';
};

export type Term1Lesson = {
  id: string;
  unit: keyof typeof TERM1_UNITS;
  position: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  competency: { code: string; title: string };
  objectives: Array<{ description: string; skillCodes: string[] }>;
  sections: Array<{ heading: string; sourceExplanation: string; aiExplanation: string }>;
  vocabulary: Array<{ term: string; definition: string }>;
  checks: Term1Check[];
  skills: SkillDef[];
  bank: BankQuestion[];
};

/** Knowledge check with the right answer in a rotated slot. */
function check(
  slot: number,
  question: string,
  answer: string,
  wrong: [string, string, string],
  explanation: string,
  purpose: Term1Check['purpose'],
): Term1Check {
  const options: string[] = [];
  let cursor = 0;
  for (let i = 0; i < 4; i += 1) options.push(i === slot ? answer : wrong[cursor++]);
  return { question, options, correctIndex: slot, explanation, purpose };
}

export function buildTerm1Lessons(): Term1Lesson[] {
  const sixSum = (6 - 2) * 180; // 720
  const octEach = ((8 - 2) * 180) / 8; // 135
  const bagSale = 600 - (600 * 30) / 100; // 420
  const raised = 250 + (250 * 20) / 100; // 300
  const speed = 210 / 3; // 70
  const pen = 126 / 6; // 21
  const root14 = Math.sqrt(196); // 14
  const cubeRoot = -6;

  return [
    {
      id: 'lesson-math-7-polygons',
      unit: 'geometry',
      position: 0,
      title: 'Polygons and Their Angles',
      description: 'Classify polygons, then find interior and exterior angles using what every polygon has in common.',
      estimatedMinutes: 50,
      competency: {
        code: 'G7-T1-W3-MG',
        title: 'Deduce the relationship between the exterior angle and adjacent interior angle of a polygon; determine the measures of angles and the number of sides of polygons.',
      },
      objectives: [
        { description: 'Find the sum of the interior angles of a polygon and one interior angle of a regular polygon.', skillCodes: [POLYGON_SKILLS.sum.code, POLYGON_SKILLS.regular.code] },
        { description: 'Use the exterior angle of a regular polygon to find its number of sides.', skillCodes: [POLYGON_SKILLS.exterior.code] },
      ],
      sections: [
        {
          heading: '1. Regular and irregular polygons',
          sourceExplanation:
            'A polygon is a closed figure made of straight sides. A regular polygon has all sides equal and all angles equal, such as a regular pentagon (5 sides), hexagon (6), octagon (8) and decagon (10). A polygon that is not regular is irregular. A polygon is convex if every interior angle is less than 180°, and non-convex if at least one interior angle is greater than 180°.',
          aiExplanation: 'A stop sign is a regular octagon: 8 equal sides and 8 equal angles. A kite is irregular, because its sides and angles are not all equal.',
        },
        {
          heading: '2. Interior angles',
          sourceExplanation:
            'The interior angles of a polygon with n sides add up to (n − 2) × 180°. A triangle gives 180°, a quadrilateral 360°, a pentagon 540°, a hexagon 720°, an octagon 1080° and a decagon 1440°. In a regular polygon all n angles are equal, so one interior angle is (n − 2) × 180° ÷ n. For example, a regular pentagon has 540° ÷ 5 = 108° at each corner.',
          aiExplanation: 'Why n − 2? Pick one corner and draw lines to the other corners: you cut the polygon into n − 2 triangles, and each triangle has 180°.',
        },
        {
          heading: '3. Exterior angles',
          sourceExplanation:
            'At each corner, an interior angle and its adjacent exterior angle together make 180°. The exterior angles of any polygon (one at each corner) add up to 360°. A regular polygon has equal exterior angles, so each one is 360° ÷ n. Reversing it, the number of sides is 360° ÷ the exterior angle: an exterior angle of 45° means 360 ÷ 45 = 8 sides.',
          aiExplanation: 'Imagine walking around the polygon and turning at each corner. After one full trip you have turned a full circle, 360°, in total.',
        },
      ],
      vocabulary: [
        { term: 'Polygon', definition: 'A closed figure made of straight line segments (sides).' },
        { term: 'Regular polygon', definition: 'A polygon whose sides are all equal and whose angles are all equal.' },
        { term: 'Convex polygon', definition: 'A polygon in which every interior angle is less than 180°.' },
        { term: 'Interior angle', definition: 'An angle inside a polygon, formed by two neighboring sides.' },
        { term: 'Exterior angle', definition: 'The angle formed by one side and the extension of the neighboring side; it adds to 180° with the interior angle at that corner.' },
      ],
      checks: [
        check(1, 'What is the sum of the interior angles of a hexagon?', `${sixSum}°`, ['540°', '900°', '1080°'], `A hexagon has 6 sides: (6 − 2) × 180° = ${sixSum}°.`, 'INITIAL'),
        check(2, 'How large is each interior angle of a regular octagon?', `${octEach}°`, ['45°', '1080°', '145°'], `(8 − 2) × 180° ÷ 8 = ${octEach}°.`, 'REINFORCEMENT'),
      ],
      skills: [POLYGON_SKILLS.sum, POLYGON_SKILLS.regular, POLYGON_SKILLS.exterior],
      bank: buildPolygonBank(),
    },
    {
      id: 'lesson-math-7-percentages',
      unit: 'percentRates',
      position: 0,
      title: 'Percentage Change and Money Problems',
      description: 'Find new prices after a percentage increase or decrease, and solve discount, tax, commission and interest problems.',
      estimatedMinutes: 50,
      competency: {
        code: 'G7-T1-W4-NA',
        title: 'Solve problems involving percentage increase and decrease; solve money problems involving percentages (e.g., discount, commission, sales tax, simple interest).',
      },
      objectives: [
        { description: 'Compute the new value after a percentage increase or decrease.', skillCodes: [PERCENT_SKILLS.change.code] },
        { description: 'Solve discount, sales tax, commission and simple interest problems.', skillCodes: [PERCENT_SKILLS.money.code] },
      ],
      sections: [
        {
          heading: '1. Percentage increase and decrease',
          sourceExplanation:
            'A percent means "per hundred". To find r% of an amount, multiply the amount by r ÷ 100. For an increase, add that part to the original: new = original + (r% of original). For a decrease, subtract it. Example: a ₱200 item increased by 10% rises by ₱20, so the new price is ₱220.',
          aiExplanation: 'Always take the percent of the ORIGINAL amount. A 20% decrease then a 20% increase does not bring you back to the start, because the second percent is taken of a different amount.',
        },
        {
          heading: '2. Discount, sales tax, commission and simple interest',
          sourceExplanation:
            'Discount: a part of the marked price is taken off, sale price = marked price − discount. Sales tax: a part of the price is added, total = price + tax (for example, a 12% tax on ₱500 is ₱60, so the total is ₱560). Commission is a percentage of the sales an agent makes. Simple interest on a deposit is I = P × r × t, where P is the principal, r is the yearly rate and t is the time in years.',
          aiExplanation: 'Ask first: is the percent being taken off, added on, or is it the answer itself? Discount takes off, tax adds on, commission and interest are the answer.',
        },
        {
          heading: '3. Planning your money',
          sourceExplanation:
            'A simple financial plan lists income, then needs (food, fare, school), savings and wants. A common guide is to set a savings amount first instead of saving whatever is left. Example: with an allowance of ₱2,000 a month, saving 10% means setting aside ₱200 before spending. A plan is only useful when you can check it against what you actually spent.',
          aiExplanation: 'Try it for one week of your own allowance: write down the income, the needs, the savings goal, and what is left for wants.',
        },
      ],
      vocabulary: [
        { term: 'Percent', definition: 'A number out of 100, written with the % sign.' },
        { term: 'Discount', definition: 'An amount taken off the marked price.' },
        { term: 'Sales tax', definition: 'A percentage of the price that is added when the item is bought.' },
        { term: 'Commission', definition: 'A percentage of the sales paid to the person who made the sales.' },
        { term: 'Simple interest', definition: 'Interest computed only on the original amount: I = P × r × t.' },
      ],
      checks: [
        check(2, 'A bag costs ₱600 and is sold at a 30% discount. What is the sale price?', `₱${bagSale}`, ['₱180', '₱570', '₱780'], `The discount is 30% of 600 = 180. Then 600 − 180 = ₱${bagSale}.`, 'INITIAL'),
        check(0, 'A price of ₱250 increases by 20%. What is the new price?', `₱${raised}`, ['₱50', '₱270', '₱200'], `20% of 250 = 50, so 250 + 50 = ₱${raised}.`, 'REINFORCEMENT'),
      ],
      skills: [PERCENT_SKILLS.change, PERCENT_SKILLS.money],
      bank: buildPercentBank(),
    },
    {
      id: 'lesson-math-7-rates',
      unit: 'percentRates',
      position: 1,
      title: 'Rates and Speed',
      description: 'Use unit rates and the speed, distance and time relationship to solve everyday problems.',
      estimatedMinutes: 40,
      competency: {
        code: 'G7-T1-W6-NA',
        title: 'Identify and explain the uses of rates; solve problems involving rates (e.g., speed).',
      },
      objectives: [
        { description: 'Find a unit rate and use it to find a total.', skillCodes: [RATE_SKILLS.unit.code] },
        { description: 'Solve problems about speed, distance and time.', skillCodes: [RATE_SKILLS.speed.code] },
      ],
      sections: [
        {
          heading: '1. What is a rate?',
          sourceExplanation:
            'A rate compares two quantities with different units, such as pesos per kilogram or kilometers per hour. A unit rate tells the amount for ONE unit. If 6 notebooks cost ₱90, the unit rate is 90 ÷ 6 = ₱15 per notebook. Once you know the unit rate, the total for any amount is unit rate × amount.',
          aiExplanation: 'Unit rates make fair comparisons possible: a 12-pack costing ₱180 and a 20-pack costing ₱280 are compared by the price of one item (₱15 and ₱14).',
        },
        {
          heading: '2. Speed, distance and time',
          sourceExplanation:
            'Speed is a rate: distance per unit of time. The three forms are speed = distance ÷ time, distance = speed × time, and time = distance ÷ speed. A bus that travels 180 km in 4 hours has a speed of 180 ÷ 4 = 45 km/h, and at that speed it covers 90 km in 2 hours.',
          aiExplanation: 'Cover the quantity you want in the triangle (distance on top, speed and time below): what remains tells you whether to multiply or divide.',
        },
        {
          heading: '3. Solving a rate problem',
          sourceExplanation:
            'Step 1: write down what is given and what is asked, with units. Step 2: choose the form that has the unknown alone. Step 3: compute. Step 4: check that the answer has the right unit and makes sense (a bus doing 900 km/h is a warning sign). Units must match: if the speed is in km/h, the time must be in hours.',
          aiExplanation: 'The unit of the answer is a clue: km/h means distance ÷ time, pesos per kilogram means pesos ÷ kilograms.',
        },
      ],
      vocabulary: [
        { term: 'Rate', definition: 'A comparison of two quantities that have different units.' },
        { term: 'Unit rate', definition: 'A rate in which the second quantity is one unit, such as ₱15 per notebook.' },
        { term: 'Speed', definition: 'The distance traveled per unit of time.' },
      ],
      checks: [
        check(3, 'A van travels 210 km in 3 hours. What is its average speed?', `${speed} km/h`, ['630 km/h', '213 km/h', '207 km/h'], `Speed = 210 ÷ 3 = ${speed} km/h.`, 'INITIAL'),
        check(1, '6 pens cost ₱126. What is the price of one pen?', `₱${pen}`, ['₱120', '₱756', '₱132'], `126 ÷ 6 = ₱${pen} per pen.`, 'REINFORCEMENT'),
      ],
      skills: [RATE_SKILLS.speed, RATE_SKILLS.unit],
      bank: buildRateBank(),
    },
    {
      id: 'lesson-math-7-rational-numbers',
      unit: 'rational',
      position: 0,
      title: 'Rational Numbers: Fractions, Decimals and Percents',
      description: 'Rewrite rational numbers in different forms, order them, and compute with decimals.',
      estimatedMinutes: 50,
      competency: {
        code: 'G7-T1-W7-NA',
        title: 'Describe given rational numbers as fractions, decimals, or percentages; order rational numbers on a number line; perform operations on rational numbers.',
      },
      objectives: [
        { description: 'Write a fraction, decimal or percent in the other two forms.', skillCodes: [RATIONAL_SKILLS.convert.code] },
        { description: 'Add, subtract, multiply and divide positive and negative decimals.', skillCodes: [RATIONAL_SKILLS.ops.code] },
      ],
      sections: [
        {
          heading: '1. One number, three forms',
          sourceExplanation:
            'A rational number is a number that can be written as a fraction a/b where a and b are integers and b is not 0. Every rational number can be written as a decimal (which either ends or repeats) and as a percent. To change a fraction to a decimal, divide the top by the bottom: 3/4 = 0.75. To change a decimal to a percent, multiply by 100: 0.75 = 75%.',
          aiExplanation: 'Think of 3/4, 0.75 and 75% as three names for the same point on the number line.',
        },
        {
          heading: '2. Ordering on the number line',
          sourceExplanation:
            'On a number line, numbers to the right are greater. To order rational numbers given in different forms, write them all in the same form, usually decimals, and then compare. Example: 3/5 = 0.6, 55% = 0.55 and 0.58 are ordered 0.55 < 0.58 < 0.6, that is, 55% < 0.58 < 3/5. Negative numbers are ordered the opposite way: −0.6 < −0.55.',
          aiExplanation: 'Be careful with negatives: the number with the bigger absolute value is further left, so it is smaller.',
        },
        {
          heading: '3. Operations with decimals',
          sourceExplanation:
            'To add or subtract decimals, line up the decimal points. To multiply, multiply as whole numbers and then place the decimal point so the answer has as many decimal places as both factors together: 0.5 × 0.8 = 0.40 = 0.4. To divide by a decimal, shift the decimal point in both numbers until the divisor is a whole number. The sign rules are the same as for integers: same signs give a positive product or quotient, different signs a negative one.',
          aiExplanation: 'Estimate first. 4.8 ÷ 2 should be a little more than 2, so 24 or 0.24 cannot be right.',
        },
      ],
      vocabulary: [
        { term: 'Rational number', definition: 'A number that can be written as a fraction of two integers, with the bottom not 0.' },
        { term: 'Terminating decimal', definition: 'A decimal that ends, such as 0.75.' },
        { term: 'Repeating decimal', definition: 'A decimal whose digits repeat forever, such as 0.333…' },
        { term: 'Percent', definition: 'A rational number written as a part of 100.' },
      ],
      checks: [
        check(0, 'Write 9/20 as a decimal.', '0.45', ['0.92', '4.5', '0.045'], '9 ÷ 20 = 0.45.', 'INITIAL'),
        check(3, 'What is (−2.5) + 4.75?', `${num(-2.5 + 4.75)}`, ['−2.25', '7.25', '−7.25'], 'Different signs: subtract the smaller absolute value from the larger, 4.75 − 2.5 = 2.25, and keep the sign of 4.75 (positive).', 'REINFORCEMENT'),
      ],
      skills: [RATIONAL_SKILLS.convert, RATIONAL_SKILLS.ops],
      bank: buildRationalBank(),
    },
    {
      id: 'lesson-math-7-roots',
      unit: 'rational',
      position: 1,
      title: 'Square Roots, Cube Roots and Irrational Numbers',
      description: 'Find square roots of perfect squares and cube roots of perfect cubes, and place other square roots on the number line.',
      estimatedMinutes: 45,
      competency: {
        code: 'G7-T1-W10-NA',
        title: 'Determine the square roots of perfect squares and the cube roots of perfect cubes; identify irrational numbers involving square roots and cube roots, and their locations on the number line.',
      },
      objectives: [
        { description: 'Find square roots of perfect squares and cube roots of perfect cubes.', skillCodes: [ROOT_SKILLS.square.code, ROOT_SKILLS.cube.code] },
        { description: 'Locate the square root of a non-perfect square between two consecutive integers.', skillCodes: [ROOT_SKILLS.locate.code] },
      ],
      sections: [
        {
          heading: '1. Square roots',
          sourceExplanation:
            'A perfect square is the square of an integer: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144… The square root of a perfect square is the number that, multiplied by itself, gives it: √81 = 9 because 9 × 9 = 81. The symbol √ means the non-negative root.',
          aiExplanation: 'Square roots undo squaring, the way subtraction undoes addition.',
        },
        {
          heading: '2. Cube roots',
          sourceExplanation:
            'A perfect cube is the cube of an integer: 1, 8, 27, 64, 125, 216, 343, 512, 729, 1000… The cube root of a perfect cube is the number that, used three times in a product, gives it: ∛64 = 4 because 4 × 4 × 4 = 64. Unlike square roots, a cube root can be negative: ∛(−27) = −3 because (−3) × (−3) × (−3) = −27.',
          aiExplanation: 'A negative times a negative is positive, so a third negative factor makes the product negative again.',
        },
        {
          heading: '3. Irrational numbers on the number line',
          sourceExplanation:
            'The square root of a number that is not a perfect square, such as √2 or √10, is an irrational number: its decimal never ends and never repeats. We can still place it on the number line by finding the two consecutive perfect squares around it. For √10, 3² = 9 and 4² = 16, so √10 is between 3 and 4 (it is about 3.16).',
          aiExplanation: 'Sandwich method: find the perfect square just below and just above the number, then take their square roots.',
        },
      ],
      vocabulary: [
        { term: 'Perfect square', definition: 'The square of an integer, such as 49 = 7 × 7.' },
        { term: 'Perfect cube', definition: 'The cube of an integer, such as 125 = 5 × 5 × 5.' },
        { term: 'Square root', definition: 'A number that, multiplied by itself, gives the original number.' },
        { term: 'Cube root', definition: 'A number that, used as a factor three times, gives the original number.' },
        { term: 'Irrational number', definition: 'A number whose decimal never ends and never repeats; it cannot be written as a fraction of integers.' },
      ],
      checks: [
        check(2, 'What is the square root of 196?', `${root14}`, ['13', '98', '16'], `${root14} × ${root14} = 196, so √196 = ${root14}.`, 'INITIAL'),
        check(1, 'What is the cube root of −216?', num(cubeRoot), ['6', '−36', '−72'], '(−6) × (−6) × (−6) = −216, so ∛(−216) = −6.', 'REINFORCEMENT'),
      ],
      skills: [ROOT_SKILLS.square, ROOT_SKILLS.cube, ROOT_SKILLS.locate],
      bank: buildRootBank(),
    },
  ];
}
