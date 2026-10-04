/**
 * Tuklas 2.0 — The teaching policy: "what is the best next teaching action?" (master plan §5, §16; owner phase D).
 *
 * A pure, deterministic function. It reads the student's EDUCATIONAL state (attempts, how often they said they were
 * confused, what was already tried, whether they say they understand), picks one teaching action and one explanation
 * strategy, and returns the next state. It is used twice:
 *   - by the live prompt (prompt.ts): the model is told the action, the strategy to use now and what NOT to repeat
 *   - by the rule-based fallback (fallback.ts): a different strategy gives a genuinely different reply
 *
 * It never reveals an answer and never replaces the hint ladder (ladder.ts decides how much help is allowed); it
 * decides HOW to help within that limit. Only safe educational state is stored: no reasoning text, no free text
 * from the student beyond the normalized number they proposed.
 */

import { z } from 'zod';
import type { LadderDecision } from './ladder';
import type { TutorIntent } from './intent';

export const STRATEGIES = [
  'NUDGE',
  'GUIDING_QUESTION',
  'RULE',
  'NUMBER_LINE',
  'DIFFERENT_EXAMPLE',
  'WORKED_EXAMPLE',
  'STEP_BY_STEP',
  'PREREQUISITE',
  'CHECK',
  'PRACTICE',
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const ACTIONS = [
  'GIVE_HINT',
  'ASK_GUIDING_QUESTION',
  'GIVE_SMALL_STEP',
  'EXPLAIN_CONCEPT',
  'CHANGE_EXPLANATION',
  'USE_DIFFERENT_EXAMPLE',
  'REVIEW_MISTAKE',
  'REVIEW_PREREQUISITE',
  'ASK_STUDENT_TO_TRY',
  'CHECK_UNDERSTANDING',
  'RECOMMEND_PRACTICE',
  'INCREASE_DIFFICULTY',
  'EXPLAIN_AFTER_ANSWER',
] as const;
export type TeachingAction = (typeof ACTIONS)[number];

export const tutorStateSchema = z.object({
  v: z.literal(1),
  /** Student turns handled in this conversation. */
  turn: z.number().int().min(0),
  /** The numbers the student proposed as answers, normalized, most recent last (max 5). */
  attempts: z.array(z.string().max(20)).max(5),
  /** How many times in a row the student proposed the same answer, beyond the first time. */
  sameAttemptCount: z.number().int().min(0),
  /** Times the student said they did not understand since they last said they did. */
  confusedCount: z.number().int().min(0),
  understanding: z.enum(['UNKNOWN', 'CONFUSED', 'UNDERSTANDS']),
  /** Strategies already used with this student here, most recent last (max 6). */
  strategiesUsed: z.array(z.enum(STRATEGIES)).max(6),
  lastAction: z.enum(ACTIONS).nullable(),
});
export type TutorState = z.infer<typeof tutorStateSchema>;

export const INITIAL_STATE: TutorState = {
  v: 1,
  turn: 0,
  attempts: [],
  sameAttemptCount: 0,
  confusedCount: 0,
  understanding: 'UNKNOWN',
  strategiesUsed: [],
  lastAction: null,
};

/** A stored state that no longer parses is discarded, never trusted. */
export function parseState(raw: unknown): TutorState {
  const parsed = tutorStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : INITIAL_STATE;
}

export type TeachingPlan = {
  action: TeachingAction;
  strategy: Strategy;
  /** Strategies the reply must NOT use again (already tried with this student). */
  avoid: Strategy[];
  sameAttemptCount: number;
  confusedCount: number;
  understands: boolean;
  /** The answer the student proposed this turn, normalized, if any. */
  claimed: string | null;
  /** How many times this strategy has already been used, for choosing a fresh example. */
  variant: number;
};

export type PolicyInput = {
  state: TutorState;
  intent: TutorIntent;
  claimedAnswer: string | null;
  questionOpen: boolean;
  questionAnswered: boolean;
  answeredCorrectly: boolean | null;
  /** Mastery level of the skill being studied (NOT_STARTED, LEARNING, DEVELOPING, PROFICIENT, MASTERED), if known. */
  masteryLevel: string | null;
  repeatedMistake: boolean;
  ladder: LadderDecision;
};

const ALTERNATES: Strategy[] = ['NUMBER_LINE', 'DIFFERENT_EXAMPLE', 'WORKED_EXAMPLE', 'STEP_BY_STEP'];
const RUNG_ACTION: Record<number, [TeachingAction, Strategy]> = {
  1: ['GIVE_HINT', 'NUDGE'],
  2: ['ASK_GUIDING_QUESTION', 'GUIDING_QUESTION'],
  3: ['GIVE_HINT', 'RULE'],
  4: ['USE_DIFFERENT_EXAMPLE', 'DIFFERENT_EXAMPLE'],
  5: ['GIVE_SMALL_STEP', 'STEP_BY_STEP'],
  6: ['USE_DIFFERENT_EXAMPLE', 'WORKED_EXAMPLE'],
};
const STRONG = ['PROFICIENT', 'MASTERED'];

const normalizeAttempt = (value: string) => value.replace(/[−–—]/g, '-').replace(/\s+/g, '');

/** Word-overlap similarity (0-1): used to refuse a reply that repeats the previous one. */
export function wordSimilarity(a: string, b: string): number {
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9−-]+/g) ?? []);
  const A = words(a);
  const B = words(b);
  const shared = [...A].filter((word) => B.has(word)).length;
  const union = A.size + B.size - shared;
  return union === 0 ? 1 : shared / union;
}

export function decideTeaching(input: PolicyInput): { plan: TeachingPlan; state: TutorState } {
  const { state, intent, questionOpen, questionAnswered, answeredCorrectly, masteryLevel, repeatedMistake, ladder } = input;

  // ---- 1. update what we know about the student
  const next: TutorState = { ...state, turn: state.turn + 1, attempts: [...state.attempts], strategiesUsed: [...state.strategiesUsed] };
  const claimed = input.claimedAnswer === null ? null : normalizeAttempt(input.claimedAnswer);
  if (claimed !== null) {
    const repeated = state.attempts.length > 0 && state.attempts[state.attempts.length - 1] === claimed;
    next.sameAttemptCount = repeated ? state.sameAttemptCount + 1 : 0;
    next.attempts = [...state.attempts, claimed].slice(-5);
  }
  if (intent === 'STILL_CONFUSED' || intent === 'DONT_UNDERSTAND') {
    next.confusedCount = state.confusedCount + 1;
    next.understanding = 'CONFUSED';
  } else if (intent === 'UNDERSTOOD') {
    next.confusedCount = 0;
    next.understanding = 'UNDERSTANDS';
  }

  // ---- 2. choose the action
  const used = state.strategiesUsed;
  const last = used[used.length - 1] ?? null;
  const fresh = (pool: Strategy[]): Strategy => pool.find((s) => !used.includes(s)) ?? pool.find((s) => s !== last) ?? pool[0];
  const strong = masteryLevel !== null && STRONG.includes(masteryLevel);

  let action: TeachingAction;
  let strategy: Strategy;

  if (questionAnswered) {
    if (intent === 'UNDERSTOOD') {
      if (answeredCorrectly && strong) [action, strategy] = ['INCREASE_DIFFICULTY', 'PRACTICE'];
      else if (answeredCorrectly === false && repeatedMistake) [action, strategy] = ['RECOMMEND_PRACTICE', 'PRACTICE'];
      else [action, strategy] = ['CHECK_UNDERSTANDING', 'CHECK'];
    } else {
      [action, strategy] = ['EXPLAIN_AFTER_ANSWER', intent === 'STILL_CONFUSED' ? fresh(ALTERNATES) : 'RULE'];
    }
  } else if (intent === 'UNDERSTOOD') {
    if (strong) [action, strategy] = ['INCREASE_DIFFICULTY', 'PRACTICE'];
    else if (questionOpen) [action, strategy] = ['ASK_STUDENT_TO_TRY', 'CHECK'];
    else [action, strategy] = ['CHECK_UNDERSTANDING', 'CHECK'];
  } else if (next.confusedCount >= 3) {
    [action, strategy] = ['RECOMMEND_PRACTICE', 'PRACTICE'];
  } else if (next.confusedCount === 2 || (claimed !== null && next.sameAttemptCount >= 3)) {
    [action, strategy] = ['REVIEW_PREREQUISITE', 'PREREQUISITE'];
  } else if (claimed !== null && next.sameAttemptCount === 2) {
    [action, strategy] = ['CHANGE_EXPLANATION', fresh(ALTERNATES)];
  } else if (claimed !== null && next.sameAttemptCount === 1) {
    // Only when the student proposes the answer AGAIN this turn: an old repeat must not hijack an unrelated message.
    [action, strategy] = ['REVIEW_MISTAKE', 'STEP_BY_STEP'];
  } else if (intent === 'STILL_CONFUSED' || ladder.changeStrategy) {
    [action, strategy] = ['CHANGE_EXPLANATION', fresh(ALTERNATES)];
  } else if (!questionOpen) {
    // A general lesson chat has no ladder: explain from the lesson, with a new example when asked.
    [action, strategy] = ladder.useDifferentExample ? ['USE_DIFFERENT_EXAMPLE', 'DIFFERENT_EXAMPLE'] : ['EXPLAIN_CONCEPT', 'RULE'];
  } else if (ladder.useDifferentExample) {
    [action, strategy] = ['USE_DIFFERENT_EXAMPLE', last === 'DIFFERENT_EXAMPLE' ? fresh(ALTERNATES) : 'DIFFERENT_EXAMPLE'];
  } else {
    [action, strategy] = RUNG_ACTION[Math.min(Math.max(ladder.rung, 1), 6)];
    // The ladder is capped, so a student who keeps asking would get the same help forever: rotate instead.
    if (strategy === last) strategy = fresh(ALTERNATES.filter((s) => s !== last));
  }

  next.strategiesUsed = [...used, strategy].slice(-6);
  next.lastAction = action;

  const plan: TeachingPlan = {
    action,
    strategy,
    avoid: [...new Set(used)],
    sameAttemptCount: next.sameAttemptCount,
    confusedCount: next.confusedCount,
    understands: intent === 'UNDERSTOOD',
    claimed,
    variant: used.filter((s) => s === strategy).length,
  };
  return { plan, state: next };
}

/** A short line shown to the student under the reply when the policy recommends something to DO. */
export function nextStepFor(action: TeachingAction | null | undefined, skillName?: string | null): string | null {
  switch (action) {
    case 'RECOMMEND_PRACTICE':
      return skillName ? `Next step: practise “${skillName}” with new questions.` : 'Next step: practise this skill with new questions.';
    case 'INCREASE_DIFFICULTY':
      return skillName ? `Next step: try harder questions in “${skillName}”.` : 'Next step: try a harder question.';
    case 'ASK_STUDENT_TO_TRY':
      return 'Next step: choose your answer and submit it.';
    case 'CHECK_UNDERSTANDING':
      return 'Next step: say it in your own words, or try a practice question.';
    case 'REVIEW_PREREQUISITE':
      return 'Next step: review the idea behind this first.';
    default:
      return null;
  }
}

export const STRATEGY_DESCRIPTION: Record<Strategy, string> = {
  NUDGE: 'one short nudge toward the relevant idea',
  GUIDING_QUESTION: 'one guiding question that helps the student notice what to do next',
  RULE: 'name the rule or idea from the lesson that applies (without applying it to the student\'s numbers)',
  NUMBER_LINE: 'a number line or a picture: let the student see it moving',
  DIFFERENT_EXAMPLE: 'a different, simpler example with different numbers, then ask the student to try theirs',
  WORKED_EXAMPLE: 'a fully worked example of a similar problem with different numbers',
  STEP_BY_STEP: 'break it into small steps and ask the student for ONE step (their own working, one line at a time)',
  PREREQUISITE: 'go back to the earlier idea this depends on (for example opposites, distance from zero, repeated groups) and check that first',
  CHECK: 'do not explain again: ask the student to apply it (submit their answer, try a similar problem, or say it in their own words)',
  PRACTICE: 'recommend targeted practice on this skill and say why, kindly',
};
