/**
 * Tuklas 2.0 — Adaptive decisions (master plan §13), pure and deterministic.
 *
 * Decides, from a student's evidence-based mastery of a lesson's skills:
 *  - which difficulty each skill's practice should aim at, and
 *  - what the student should do next (start, practice easier, remediate, retry, harder, advance).
 *
 * The decision uses recorded evidence only; it never depends on a button the student clicked.
 */

import type { Difficulty, MasteryFlags, MasteryLevel } from './mastery';

export type AdaptiveAction =
  | 'START'
  | 'PRACTICE_EASIER'
  | 'REMEDIATE'
  | 'PRACTICE_SAME'
  | 'PRACTICE_HARDER'
  | 'ADVANCE';

export type SkillState = {
  skillId: string;
  name: string;
  level: MasteryLevel;
  flags?: Partial<MasteryFlags>;
};

export type AdaptiveRecommendation = {
  action: AdaptiveAction;
  skillId: string | null;
  skillName: string | null;
  targetDifficulty: Difficulty;
  reason: string;
  message: string;
};

const LEVEL_RANK: Record<MasteryLevel, number> = {
  NOT_STARTED: 0,
  LEARNING: 1,
  DEVELOPING: 2,
  PROFICIENT: 3,
  MASTERED: 4,
};

export const DIFFICULTY_RANK: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

/** The difficulty a student at this level should be practicing. */
export function targetDifficultyFor(level: MasteryLevel): Difficulty {
  switch (level) {
    case 'NOT_STARTED':
    case 'LEARNING':
      return 'EASY';
    case 'DEVELOPING':
      return 'MEDIUM';
    case 'PROFICIENT':
    case 'MASTERED':
      return 'HARD';
  }
}

/** How far a question's difficulty is from what the student should be practicing (0 = ideal). */
export function difficultyDistance(question: Difficulty, level: MasteryLevel): number {
  return Math.abs(DIFFICULTY_RANK[question] - DIFFICULTY_RANK[targetDifficultyFor(level)]);
}

/**
 * The next step for the weakest skill of a lesson (the one that needs attention first).
 * `states` should list every skill of the lesson, including ones the student has not started.
 */
export function recommendNext(states: SkillState[]): AdaptiveRecommendation {
  if (states.length === 0) {
    return {
      action: 'START',
      skillId: null,
      skillName: null,
      targetDifficulty: 'EASY',
      reason: 'NO_SKILLS',
      message: 'Start practicing this lesson.',
    };
  }

  // Weakest skill first; ties by name so the answer is stable.
  const weakest = [...states].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.name.localeCompare(b.name),
  )[0];
  const base = { skillId: weakest.skillId, skillName: weakest.name, targetDifficulty: targetDifficultyFor(weakest.level) };
  const flags = weakest.flags ?? {};

  switch (weakest.level) {
    case 'NOT_STARTED':
      return {
        ...base,
        action: 'START',
        reason: 'SKILL_NOT_STARTED',
        message: `Start with ${weakest.name.toLowerCase()}: a short practice session will show where you are.`,
      };

    case 'LEARNING':
      if (flags.repeatedConceptualMistakes || flags.repeatedSignErrors) {
        return {
          ...base,
          action: 'REMEDIATE',
          reason: flags.repeatedSignErrors ? 'REPEATED_SIGN_ERRORS' : 'REPEATED_CONCEPTUAL_MISTAKES',
          message: flags.repeatedSignErrors
            ? `Review the sign rules in the lesson before practicing ${weakest.name.toLowerCase()} again. You keep mixing up signs.`
            : `Re-read the lesson examples for ${weakest.name.toLowerCase()} before practicing again.`,
        };
      }
      return {
        ...base,
        action: 'PRACTICE_EASIER',
        reason: 'LEARNING_STAGE',
        message: `Practice easier ${weakest.name.toLowerCase()} questions to build a solid start.`,
      };

    case 'DEVELOPING':
      return {
        ...base,
        action: flags.recentPerformanceDecline ? 'REMEDIATE' : 'PRACTICE_SAME',
        reason: flags.recentPerformanceDecline ? 'RECENT_DECLINE' : 'DEVELOPING_STAGE',
        message: flags.recentPerformanceDecline
          ? `Your recent ${weakest.name.toLowerCase()} answers slipped. Revisit the lesson example, then retry the questions you missed.`
          : `Keep practicing ${weakest.name.toLowerCase()} and retry the questions you missed.`,
      };

    case 'PROFICIENT':
      return {
        ...base,
        action: 'PRACTICE_HARDER',
        reason: 'PROFICIENT_STAGE',
        message: `You are proficient in every skill here. Try harder ${weakest.name.toLowerCase()} questions to reach mastery.`,
      };

    case 'MASTERED':
      return {
        ...base,
        action: 'ADVANCE',
        reason: 'ALL_SKILLS_MASTERED',
        message: 'You have mastered every skill in this lesson. Move on to the next lesson.',
      };
  }
}
