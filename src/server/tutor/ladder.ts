/**
 * Tuklas 2.0 — The Socratic hint ladder (master plan §5), decided by the server.
 *
 *   1 HINT → 2 GUIDING_QUESTION → 3 STRONGER_HINT → 4 CONCEPT_EXPLANATION
 *     → 5 PARTIAL_SOLUTION → 6 WORKED_EXAMPLE → 7 FULL_EXPLANATION
 *
 * Rules (§46 rules 7-9, §5):
 *  - The rung is stored per conversation and only ever moved by this code. A student cannot
 *    skip ahead by asking, and the AI cannot decide to reveal more than the rung allows.
 *  - Rung 7 (full explanation, including the answer) exists only AFTER the student has
 *    answered the question; until then no rung may reveal the final answer.
 *  - Asking for the answer never produces it: it adds scaffolding (one rung up).
 *  - "I still don't get it" moves up AND forces a different explanation strategy, so the
 *    tutor does not repeat what already failed.
 *  - Checking an answer, asking "why?" and asking for another example do not push the
 *    student up the ladder on their own.
 */

import type { TutorIntent } from './intent';

export const RUNGS = {
  NONE: 0,
  HINT: 1,
  GUIDING_QUESTION: 2,
  STRONGER_HINT: 3,
  CONCEPT_EXPLANATION: 4,
  PARTIAL_SOLUTION: 5,
  WORKED_EXAMPLE: 6,
  FULL_EXPLANATION: 7,
} as const;

/** The highest rung available while the question is still unanswered. */
export const MAX_UNANSWERED_RUNG = RUNGS.WORKED_EXAMPLE;

export const RUNG_LABELS: Record<number, string> = {
  0: 'No hint needed',
  1: 'Hint',
  2: 'Guiding question',
  3: 'Stronger hint',
  4: 'Concept explanation',
  5: 'First steps',
  6: 'Worked example',
  7: 'Full explanation',
};

export type LadderDecision = {
  /** The rung this reply must be written for. */
  rung: number;
  /** True when the student reported that the last explanation did not work. */
  changeStrategy: boolean;
  /** True when the student asked for the answer and must be (kindly) refused. */
  declineAnswerRequest: boolean;
  /** True when the reply should use a *different* example (not the student's problem). */
  useDifferentExample: boolean;
  /** Whether the final answer to the student's own question may be stated. */
  mayRevealAnswer: boolean;
};

export function decideRung(input: {
  currentLevel: number;
  intent: TutorIntent;
  /** Has the student already submitted an answer to this question? */
  questionAnswered: boolean;
}): LadderDecision {
  const { currentLevel, intent, questionAnswered } = input;

  if (questionAnswered) {
    return {
      rung: RUNGS.FULL_EXPLANATION,
      changeStrategy: intent === 'STILL_CONFUSED',
      declineAnswerRequest: false,
      useDifferentExample: intent === 'ANOTHER_EXAMPLE',
      mayRevealAnswer: true,
    };
  }

  const clamp = (value: number) => Math.min(MAX_UNANSWERED_RUNG, Math.max(RUNGS.HINT, value));
  const up = clamp(currentLevel + 1);
  const stay = clamp(currentLevel);

  const base = { mayRevealAnswer: false, changeStrategy: false, declineAnswerRequest: false, useDifferentExample: false };

  switch (intent) {
    case 'GIVE_ANSWER':
      return { ...base, rung: up, declineAnswerRequest: true };
    case 'STILL_CONFUSED':
      return { ...base, rung: up, changeStrategy: true };
    case 'DONT_UNDERSTAND':
    case 'HINT':
    case 'OTHER':
      return { ...base, rung: up };
    case 'ANOTHER_EXAMPLE':
      // A different example is a concept-level aid; never below the concept rung.
      return { ...base, rung: clamp(Math.max(currentLevel, RUNGS.CONCEPT_EXPLANATION)), useDifferentExample: true };
    case 'UNDERSTOOD':
      // A student who says they understand spends no hint and is not given more scaffolding.
      return { ...base, rung: currentLevel };
    case 'WHY':
    case 'CHECK_ANSWER':
      // Reasoning about what was just said (or about their own answer) keeps the current rung.
      return { ...base, rung: stay };
  }
}
