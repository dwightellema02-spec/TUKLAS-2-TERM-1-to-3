/**
 * Tuklas 2.0 — Automatic (rule-based) hints for when no AI is available.
 *
 * These are NOT AI. They are shown with an explicit "Automatic hint" label (master plan
 * §30 Gap C: the fallback must never pass as the real AI). They follow the same hint ladder,
 * use the mistake diagnosis and the lesson's own text, and never state the final answer
 * to a question that is still open.
 */

import { parseIntegerQuestion } from '../mistake-classifier';
import { statesValue } from './guard';
import { RUNGS } from './ladder';
import type { TeachingPlan } from './policy';

/** The part of the teaching plan the rule-based fallback acts on. */
export type FallbackPlan = Pick<TeachingPlan, 'action' | 'strategy' | 'variant' | 'sameAttemptCount' | 'confusedCount' | 'claimed'>;

export type AutomaticHintInput = {
  /** When present, the reply follows the teaching policy (different strategy = different reply). */
  plan?: FallbackPlan;
  rung: number;
  question: string | null;
  /** The first words of the lesson's own explanation (published content only). */
  lessonExcerpt?: string | null;
  /** What was wrong with the student's attempt (safe text: never states the answer). */
  diagnosis?: { observation: string; tip: string } | null;
  changeStrategy?: boolean;
  useDifferentExample?: boolean;
  /** Present only once the student has answered: the explanation they were shown. */
  answeredExplanation?: string | null;
  /** Values that must not appear in an example (e.g. the student's own answer). */
  avoidValues?: string[];
};

type Op = '+' | '-' | '*' | '/';

const RULE: Record<Op, string> = {
  '+': 'Same signs: add the sizes and keep the sign. Different signs: subtract the smaller size from the larger size and keep the sign of the number with the larger size.',
  '-': 'Subtracting a number is the same as adding its opposite. Rewrite the subtraction as an addition, then use the adding rule.',
  '*': 'Multiply the sizes. Same signs give a positive result; different signs give a negative result.',
  '/': 'Divide the sizes. Same signs give a positive result; different signs give a negative result.',
};

const FIRST_HINT: Record<Op, string> = {
  '+': 'Look at the signs of both numbers first. Are they the same or different?',
  '-': 'Look at the operation again. What does subtracting a negative number do?',
  '*': 'Look at the signs of both numbers first. Will the result be positive or negative?',
  '/': 'Look at the signs of both numbers first. Will the result be positive or negative?',
};

const GUIDING: Record<Op, string> = {
  '+': 'If the signs are different, which of the two numbers is farther from zero? That one decides the sign.',
  '-': 'Can you rewrite this subtraction as an addition of the opposite number?',
  '*': 'How many of the numbers are negative? What does that mean for the sign of the product?',
  '/': 'How many of the numbers are negative? What does that mean for the sign of the quotient?',
};

// Different way of looking at the same idea, used when the first explanation did not work.
const ALTERNATE: Record<Op, string> = {
  '+': 'Try a number line. Start at the first number and move right for a positive number or left for a negative one. Where do you land?',
  '-': 'Try a number line. Subtracting a positive moves left; subtracting a negative moves right. Which way do you move?',
  '*': 'Think of it as repeated groups: a×b means "a groups of b". A negative number means the groups go in the opposite direction.',
  '/': 'Think of sharing equally: how many groups of the second number fit into the first? Then decide the sign.',
};

// ---------------------------------------------------------------- generated examples

const fmt = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
const wrap = (n: number) => (n < 0 ? `(${fmt(n)})` : `${n}`);
const signed = (n: number) => (n < 0 ? fmt(n) : `+${n}`);

type Example = { short: string; worked: string };

function addExample(a: number, b: number): Example {
  const result = a + b;
  const same = Math.sign(a) === Math.sign(b);
  const big = Math.abs(a) >= Math.abs(b) ? a : b;
  const reasoning = same
    ? `The signs are the same, so add the sizes: ${Math.abs(a)} + ${Math.abs(b)} = ${Math.abs(result)}, and keep the sign.`
    : `The signs are different. The sizes are ${Math.abs(a)} and ${Math.abs(b)}. The larger size is ${Math.abs(big)} and it is ${big < 0 ? 'negative' : 'positive'}, so the result is ${big < 0 ? 'negative' : 'positive'}: ${Math.max(Math.abs(a), Math.abs(b))} − ${Math.min(Math.abs(a), Math.abs(b))} = ${Math.abs(result)}.`;
  return {
    short: `${wrap(a)} + ${wrap(b)} = ${signed(result)}`,
    worked: `Take ${wrap(a)} + ${wrap(b)}. ${reasoning} So the result is ${signed(result)}.`,
  };
}

function subtractExample(a: number, b: number): Example {
  const result = a - b;
  const asAddition = addExample(a, -b);
  return {
    short: `${wrap(a)} − ${wrap(b)} = ${wrap(a)} + ${wrap(-b)} = ${signed(result)}`,
    worked: `Take ${wrap(a)} − ${wrap(b)}. Subtracting a number is the same as adding its opposite, so rewrite it as ${wrap(a)} + ${wrap(-b)}. ${asAddition.worked.replace(/^Take [^.]*\.\s*/, '')}`,
  };
}

function productExample(op: '*' | '/', a: number, b: number): Example {
  const result = op === '*' ? a * b : a / b;
  const word = op === '*' ? 'product' : 'quotient';
  const symbol = op === '*' ? '×' : '÷';
  const same = Math.sign(a) === Math.sign(b);
  return {
    short: `${wrap(a)} ${symbol} ${wrap(b)} = ${signed(result)}`,
    worked: `Take ${wrap(a)} ${symbol} ${wrap(b)}. The signs are ${same ? 'the same, so the ' + word + ' is positive' : 'different, so the ' + word + ' is negative'}. The sizes: ${Math.abs(a)} ${symbol} ${Math.abs(b)} = ${Math.abs(result)}. So the result is ${signed(result)}.`,
  };
}

// Six examples per operation, built from numbers chosen so that no single value appears in
// many of them: for any value a student might have as an answer, at least one example avoids it.
const EXAMPLES: Record<Op, Example[]> = {
  '+': ([[-3, 5], [-4, 9], [-8, 3], [-6, 2], [-7, 10], [-9, 1]] as const).map(([a, b]) => addExample(a, b)),
  '-': ([[4, -2], [3, 5], [-6, 2], [9, -4], [-5, 3], [10, -7]] as const).map(([a, b]) => subtractExample(a, b)),
  '*': ([[-2, 6], [-3, -4], [5, -3], [-7, 2], [-8, -5], [11, -2]] as const).map(([a, b]) => productExample('*', a, b)),
  '/': ([[-12, 3], [-20, -5], [18, -2], [-30, 6], [42, -7], [-16, -8]] as const).map(([a, b]) => productExample('/', a, b)),
};

function pickExample(op: Op, avoid: string[], kind: 'short' | 'worked', variant = 0) {
  const all = EXAMPLES[op];
  // Start from a different example each time this strategy is used again, so the student is not shown the same one.
  const candidates = all.map((_, i) => all[(i + variant) % all.length]);
  const safe = candidates.find((example) => !avoid.some((value) => statesValue(example[kind], value)));
  return (safe ?? candidates[candidates.length - 1])[kind];
}

// The earlier idea each operation depends on. Deliberately number-free: it can never state a result.
const PREREQUISITE: Record<Op, string> = {
  '+': "Let's go back one step. Which way does a negative number move on the number line, and which way does a positive one move? How far from zero is a negative number? Answer those first, then come back.",
  '-': "Let's go back to adding. Subtracting a number is adding its opposite, so first make sure you are comfortable adding integers with different signs. What is the opposite of a number? Answer that first, then come back.",
  '*': 'Let\'s go back to repeated adding: "a × b" means a groups of b. If you keep adding a negative number again and again, does the total grow or shrink? Answer that first, then come back.',
  '/': "Let's go back to multiplication: division undoes it. Ask yourself, what number times the second number gives the first? Work that out with sizes only, then decide the sign.",
};

const GENERIC_STRATEGY: Partial<Record<TeachingPlan['strategy'], string>> = {
  NUMBER_LINE: 'Try drawing it: a picture, a number line or a small table can make the idea easier to see. What does your drawing show?',
  DIFFERENT_EXAMPLE: 'Try a smaller, easier example of the same kind first, with simple numbers, and do the same steps. What stays the same when the numbers get bigger?',
  WORKED_EXAMPLE: 'Find the worked example in your lesson that is closest to this question and follow its steps one by one, covering the final result.',
  STEP_BY_STEP: 'Write only the FIRST step of your working and tell me what you got. We will check it before going on.',
  PREREQUISITE: "Let's go back one step. Which earlier idea in this lesson does this question depend on? Open that part of the lesson and try one easy example of it first.",
};

/** The reply for a teaching action that is not about explaining: it points the student to DO something. */
function forwardMoving(plan: FallbackPlan): string | null {
  switch (plan.action) {
    case 'ASK_STUDENT_TO_TRY':
      return 'That sounds like you have the idea, so no more hints are needed. Choose your answer and press Submit. The check will tell you whether it is right.';
    case 'CHECK_UNDERSTANDING':
      return 'Nice. To make sure it sticks, say the rule in your own words, or try the practice questions for this lesson.';
    case 'INCREASE_DIFFICULTY':
      return 'You seem ready for more. Try the harder practice questions in this lesson.';
    case 'RECOMMEND_PRACTICE':
      return 'We have tried a few ways to look at this. The best next step is practice on this skill with new questions: press "Practice this lesson", and come back to ask when a question is hard.';
    default:
      return null;
  }
}

const sizeOf = (n: number) => Math.abs(n);

/** First steps for the student's OWN problem (rung 5): sizes and sign, but not the final result. */
function partialSteps(op: Op, a: number, b: number): string {
  switch (op) {
    case '+':
      if (a === 0 || b === 0) return 'Adding zero changes nothing. Which number is left?';
      return Math.sign(a) === Math.sign(b)
        ? `Both numbers have the same sign, so the result keeps that sign. The sizes are ${sizeOf(a)} and ${sizeOf(b)}. Add the sizes, then put the sign on it.`
        : `The signs are different. The sizes are ${sizeOf(a)} and ${sizeOf(b)}. Subtract the smaller size from the larger one. The result takes the sign of the number with the larger size (${sizeOf(a) > sizeOf(b) ? 'the first number' : 'the second number'}).`;
    case '-':
      return `Rewrite it as an addition: ${wrap(a)} − ${wrap(b)} becomes ${wrap(a)} + ${wrap(-b)}. Now use the adding rule: first decide whether the signs are the same or different.`;
    case '*':
      return `The sizes are ${sizeOf(a)} and ${sizeOf(b)}: multiply them. The signs are ${Math.sign(a) === Math.sign(b) ? 'the same, so the result is positive' : 'different, so the result is negative'}.`;
    case '/':
      return `The sizes are ${sizeOf(a)} and ${sizeOf(b)}: divide the larger by the smaller where it fits. The signs are ${Math.sign(a) === Math.sign(b) ? 'the same, so the result is positive' : 'different, so the result is negative'}.`;
  }
}

function genericHint(rung: number, excerpt: string | null | undefined): string {
  switch (rung) {
    case RUNGS.HINT:
      return 'Read the question again slowly. What exactly is it asking you to find?';
    case RUNGS.GUIDING_QUESTION:
      return 'What do you already know about this topic from your lesson? Which idea might help here?';
    case RUNGS.STRONGER_HINT:
      return 'Pick the idea from your lesson that fits this question, and try to write just the first step.';
    default:
      return excerpt
        ? `Your lesson explains: "${excerpt}" Try the first step of the question using that idea.`
        : 'Open the lesson and find the example closest to this question, then try the first step yourself.';
  }
}

/** Help text chosen by the teaching policy: a different strategy gives a genuinely different reply. */
function plannedHint(input: AutomaticHintInput, plan: FallbackPlan, parsed: { a: number; op: Op; b: number } | null): string {
  const avoid = input.avoidValues ?? [];
  let lead = '';
  if (plan.claimed && plan.sameAttemptCount >= 1) {
    lead = `You have suggested ${plan.claimed.replace('-', '−')} ${plan.sameAttemptCount + 1} times, so let's try another way to check it. `;
  } else if (plan.action === 'CHANGE_EXPLANATION' || plan.action === 'REVIEW_MISTAKE') {
    lead = "Let's look at it a different way. ";
  } else if (input.diagnosis && input.rung <= RUNGS.STRONGER_HINT) {
    lead = `${input.diagnosis.observation} ${input.diagnosis.tip} `;
  }

  if (!parsed) {
    const generic = GENERIC_STRATEGY[plan.strategy];
    return `${lead}${generic ?? genericHint(input.rung, input.lessonExcerpt)}`;
  }

  const { a, op, b } = parsed;
  switch (plan.strategy) {
    case 'NUDGE':
      return `${lead}${FIRST_HINT[op]}`;
    case 'GUIDING_QUESTION':
      return `${lead}${GUIDING[op]}`;
    case 'RULE':
      return `${lead}The rule to use: ${RULE[op]}`;
    case 'NUMBER_LINE':
      return `${lead}${ALTERNATE[op]}`;
    case 'DIFFERENT_EXAMPLE':
      return `${lead}Here is a different example: ${pickExample(op, avoid, 'short', plan.variant)}. Can you do the same steps with your numbers?`;
    case 'WORKED_EXAMPLE':
      return `${lead}Here is a worked example with different numbers. ${pickExample(op, avoid, 'worked', plan.variant)} Now try the same steps on your question.`;
    case 'STEP_BY_STEP':
      return plan.action === 'REVIEW_MISTAKE'
        ? `${lead}Write only the first step of your working, one line: are the signs the same or different? Tell me what you notice and we will build it from there.`
        : `${lead}${partialSteps(op, a, b)}`;
    case 'PREREQUISITE':
      return `${lead}${PREREQUISITE[op]}`;
    default:
      return `${lead}${genericHint(input.rung, input.lessonExcerpt)}`;
  }
}

/** Returns the rule-based help text for a rung. Never states the answer to an open question. */
export function automaticHint(input: AutomaticHintInput): string {
  // A student who says they understand is moved forward, even after answering: not given the explanation again.
  const forwardFirst = input.plan ? forwardMoving(input.plan) : null;
  if (forwardFirst) return forwardFirst;
  if (input.answeredExplanation) {
    return `Here is the full explanation: ${input.answeredExplanation}`;
  }

  const avoid = input.avoidValues ?? [];
  const parsed = input.question ? parseIntegerQuestion(input.question) : null;

  if (input.plan) {
    const forward = forwardMoving(input.plan);
    if (forward) return forward;
    return plannedHint(input, input.plan, parsed);
  }
  const parts: string[] = [];

  if (input.diagnosis && input.rung <= RUNGS.STRONGER_HINT) {
    parts.push(input.diagnosis.observation, input.diagnosis.tip);
  }

  if (input.changeStrategy) parts.push("Let's look at it a different way.");

  if (!parsed) {
    parts.push(genericHint(input.rung, input.lessonExcerpt));
    return parts.join(' ');
  }

  const { a, op, b } = parsed;
  switch (Math.min(Math.max(input.rung, 1), 6)) {
    case 1:
      parts.push(FIRST_HINT[op]);
      break;
    case 2:
      parts.push(input.changeStrategy ? ALTERNATE[op] : GUIDING[op]);
      break;
    case 3:
      parts.push(input.changeStrategy ? ALTERNATE[op] : `The rule to use: ${RULE[op]}`);
      break;
    case 4:
      parts.push(
        input.useDifferentExample
          ? `Here is a different example: ${pickExample(op, avoid, 'short')}. Can you do the same steps with your numbers?`
          : `${RULE[op]} For example: ${pickExample(op, avoid, 'short')}.`,
      );
      break;
    case 5:
      parts.push(partialSteps(op, a, b));
      break;
    default:
      parts.push(`Here is a worked example with different numbers. ${pickExample(op, avoid, 'worked')} Now try the same steps on your question.`);
  }
  return parts.join(' ');
}

/**
 * Reply to "I think it's -10" while the question is still open. It never says whether the
 * answer is right (that would make the tutor an answer oracle); it sends the student back to
 * their own steps. The real check is submitting the answer.
 */
export function automaticCheckResponse(input: {
  question: string | null;
  claimed: string;
  plan?: FallbackPlan;
  lessonExcerpt?: string | null;
  avoidValues?: string[];
}): string {
  // The student proposed the same answer again: repeating the first reply would teach nothing. Follow the plan instead
  // (still no verdict on whether the answer is right).
  if (input.plan && input.plan.sameAttemptCount >= 1) {
    return automaticHint({
      rung: 1,
      question: input.question,
      lessonExcerpt: input.lessonExcerpt,
      avoidValues: input.avoidValues,
      plan: input.plan,
    });
  }
  const parsed = input.question ? parseIntegerQuestion(input.question) : null;
  const rule = parsed ? ` Compare your steps with this rule: ${RULE[parsed.op]}` : '';
  return `You suggested ${input.claimed}. Hints do not check answers; submitting your answer does. First write out the steps you used to get it, one line each.${rule}`;
}
