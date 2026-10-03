/**
 * Tuklas 2.0 — Mastery engine (master plan §14), pure and deterministic.
 *
 * Ported from tuklas-ai's rule engine and adapted to what Tuklas 2.0 can measure today:
 *  - Evidence is the student's LATEST attempt at each distinct question of a skill, so
 *    retrying one question cannot inflate the score, and fixing an old mistake raises it.
 *  - Question-type diversity is replaced by difficulty diversity (all questions are
 *    multiple choice for now); §14 lists "difficulty diversity" as mastery evidence.
 *  - Mastery is never awarded for finishing a lesson or for one lucky streak.
 *
 * All thresholds live in MASTERY_CONFIG so they can be calibrated and audited in one place.
 */

export type MasteryLevel = 'NOT_STARTED' | 'LEARNING' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export const MASTERY_CONFIG = {
  version: 'MASTERY_V1',
  /** Distinct questions needed before a level above LEARNING can be given. */
  minimumAttemptsForDeveloping: 4,
  minimumAttemptsForProficient: 8,
  /** Kept at 10 so a 12-question skill bank can actually reach MASTERED. */
  minimumAttemptsForMastered: 10,
  /** The most recent N attempts form the "recent" window. */
  recentWindow: 5,
  /** How many most recent attempts are scanned for repeated mistake patterns. */
  mistakePatternWindow: 10,
  /** Number of the same mistake type in that window that counts as "repeated". */
  repeatedMistakeCount: 2,
  developingAccuracy: 0.6,
  proficientAccuracy: 0.8,
  proficientRecentAccuracy: 0.7,
  masteredAccuracy: 0.85,
  masteredRecentAccuracy: 0.85,
  /** Recent accuracy below this, after good history, is a decline. */
  declineRecentAccuracy: 0.55,
  declineHistoricalAccuracy: 0.7,
  lowRecentAccuracy: 0.5,
  proficientConsistency: 0.55,
  masteredConsistency: 0.75,
  minimumHardAccuracy: 0.6,
  minimumDifficultyBandsForMastered: 2,
} as const;

export type MasteryAttempt = {
  correct: boolean;
  difficulty: Difficulty;
  /** Mistake category recorded for this attempt when it was wrong (e.g. SIGN_ERROR). */
  mistakeCategory?: string | null;
};

type BandStats = { attempts: number; correct: number; accuracy: number };

export type MasteryEvidence = {
  totalAttempts: number;
  correctAttempts: number;
  overallAccuracy: number;
  recentAccuracy: number;
  historicalAccuracy: number;
  consistencyScore: number;
  consecutiveCorrect: number;
  difficulty: Record<Difficulty, BandStats>;
  distinctDifficultyBands: number;
  repeatedSignErrors: boolean;
  repeatedConceptualMistakes: boolean;
};

export type MasteryFlags = {
  recentPerformanceDecline: boolean;
  limitedDifficultyEvidence: boolean;
  repeatedSignErrors: boolean;
  repeatedConceptualMistakes: boolean;
};

export type MasteryExplanation = {
  summary: string;
  why: string;
  nextStep: string;
  encouragement: string;
};

export type MasteryEvaluation = {
  level: MasteryLevel;
  ruleCode: string;
  ruleDescription: string;
  evidence: MasteryEvidence;
  flags: MasteryFlags;
  explanation: MasteryExplanation;
  masteryVersion: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const accuracyOf = (correct: number, total: number) => (total <= 0 ? 0 : round2(correct / total));

const emptyBands = (): Record<Difficulty, BandStats> => ({
  EASY: { attempts: 0, correct: 0, accuracy: 0 },
  MEDIUM: { attempts: 0, correct: 0, accuracy: 0 },
  HARD: { attempts: 0, correct: 0, accuracy: 0 },
});

/** Builds the evidence summary from attempts in chronological order (oldest first). */
export function buildEvidence(attempts: MasteryAttempt[]): MasteryEvidence {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;

  const window = attempts.slice(-MASTERY_CONFIG.recentWindow);
  const earlier = attempts.slice(0, Math.max(0, total - MASTERY_CONFIG.recentWindow));
  const overallAccuracy = accuracyOf(correct, total);
  const recentAccuracy = accuracyOf(window.filter((a) => a.correct).length, window.length);
  const historicalAccuracy =
    earlier.length > 0 ? accuracyOf(earlier.filter((a) => a.correct).length, earlier.length) : overallAccuracy;

  const difficulty = emptyBands();
  for (const attempt of attempts) {
    const band = difficulty[attempt.difficulty] ?? difficulty.MEDIUM;
    band.attempts += 1;
    if (attempt.correct) band.correct += 1;
  }
  for (const band of Object.values(difficulty)) band.accuracy = accuracyOf(band.correct, band.attempts);

  let consecutiveCorrect = 0;
  for (let i = total - 1; i >= 0 && attempts[i].correct; i -= 1) consecutiveCorrect += 1;

  const recentMistakes = attempts
    .slice(-MASTERY_CONFIG.mistakePatternWindow)
    .filter((a) => !a.correct)
    .map((a) => a.mistakeCategory ?? '');
  const count = (category: string) => recentMistakes.filter((m) => m === category).length;

  return {
    totalAttempts: total,
    correctAttempts: correct,
    overallAccuracy,
    recentAccuracy,
    historicalAccuracy,
    consistencyScore: calculateConsistency(attempts, difficulty, recentAccuracy, overallAccuracy),
    consecutiveCorrect,
    difficulty,
    distinctDifficultyBands: Object.values(difficulty).filter((band) => band.attempts > 0).length,
    repeatedSignErrors: count('SIGN_ERROR') >= MASTERY_CONFIG.repeatedMistakeCount,
    repeatedConceptualMistakes: count('CONCEPTUAL') >= MASTERY_CONFIG.repeatedMistakeCount,
  };
}

/**
 * Consistency (0..1): steadiness of results (few flip-flops), agreement between recent and
 * overall performance, and parity between easy and medium questions.
 */
function calculateConsistency(
  attempts: MasteryAttempt[],
  difficulty: Record<Difficulty, BandStats>,
  recentAccuracy: number,
  overallAccuracy: number,
): number {
  const total = attempts.length;
  if (total < 2) return 0;

  let flips = 0;
  for (let i = 1; i < total; i += 1) if (attempts[i].correct !== attempts[i - 1].correct) flips += 1;
  const stability = Math.max(0, 1 - (flips / (total - 1)) * 0.7);

  const alignment = Math.max(0, 1 - Math.abs(recentAccuracy - overallAccuracy) * 1.2);

  let difficultyParity = 1;
  if (difficulty.EASY.attempts > 0 && difficulty.MEDIUM.attempts > 0) {
    difficultyParity = Math.max(0.4, 1 - Math.max(0, difficulty.EASY.accuracy - difficulty.MEDIUM.accuracy) * 0.6);
  }

  return round2(Math.min(1, Math.max(0, stability * 0.45 + alignment * 0.3 + difficultyParity * 0.25)));
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function evaluateMastery(attempts: MasteryAttempt[]): MasteryEvaluation {
  const evidence = buildEvidence(attempts);
  const c = MASTERY_CONFIG;
  const e = evidence;

  const flags: MasteryFlags = {
    recentPerformanceDecline:
      e.totalAttempts >= c.minimumAttemptsForDeveloping &&
      e.recentAccuracy < c.declineRecentAccuracy &&
      e.historicalAccuracy >= c.declineHistoricalAccuracy,
    limitedDifficultyEvidence: e.distinctDifficultyBands < c.minimumDifficultyBandsForMastered,
    repeatedSignErrors: e.repeatedSignErrors,
    repeatedConceptualMistakes: e.repeatedConceptualMistakes,
  };

  const decide = (level: MasteryLevel, ruleCode: string, ruleDescription: string): MasteryEvaluation => ({
    level,
    ruleCode,
    ruleDescription,
    evidence,
    flags,
    explanation: explainMastery(level, evidence, flags),
    masteryVersion: c.version,
  });

  if (e.totalAttempts === 0) {
    return decide('NOT_STARTED', 'RULE_NOT_STARTED', 'No practice answers recorded for this skill yet.');
  }

  if (e.totalAttempts < c.minimumAttemptsForDeveloping) {
    return decide(
      'LEARNING',
      'RULE_INSUFFICIENT_EVIDENCE',
      `Only ${e.totalAttempts} question(s) answered; at least ${c.minimumAttemptsForDeveloping} are needed to judge progress.`,
    );
  }

  if (flags.recentPerformanceDecline) {
    return decide(
      'DEVELOPING',
      'RULE_RECENT_DECLINE',
      `Recent accuracy fell to ${pct(e.recentAccuracy)} after ${pct(e.historicalAccuracy)} earlier.`,
    );
  }

  if (e.overallAccuracy < c.developingAccuracy || e.recentAccuracy < c.lowRecentAccuracy) {
    return decide(
      'LEARNING',
      'RULE_LOW_ACCURACY',
      `Accuracy of ${pct(e.overallAccuracy)} (recent ${pct(e.recentAccuracy)}) shows the idea is still forming.`,
    );
  }

  const hard = e.difficulty.HARD;
  const hardOk = hard.attempts === 0 || hard.accuracy >= c.minimumHardAccuracy;
  const masteredEligible =
    e.totalAttempts >= c.minimumAttemptsForMastered &&
    e.overallAccuracy >= c.masteredAccuracy &&
    e.recentAccuracy >= c.masteredRecentAccuracy &&
    e.consistencyScore >= c.masteredConsistency &&
    !flags.limitedDifficultyEvidence &&
    hardOk &&
    !e.repeatedConceptualMistakes &&
    !e.repeatedSignErrors;
  if (masteredEligible) {
    return decide(
      'MASTERED',
      'RULE_MASTERED',
      `${e.totalAttempts} questions, ${pct(e.overallAccuracy)} accurate (recent ${pct(e.recentAccuracy)}), steady, across ${e.distinctDifficultyBands} difficulty levels, no repeated mistakes.`,
    );
  }

  if (
    e.totalAttempts >= c.minimumAttemptsForProficient &&
    e.overallAccuracy >= c.proficientAccuracy &&
    e.recentAccuracy >= c.proficientRecentAccuracy &&
    e.consistencyScore >= c.proficientConsistency &&
    !e.repeatedConceptualMistakes
  ) {
    return decide(
      'PROFICIENT',
      'RULE_PROFICIENT',
      `${e.totalAttempts} questions at ${pct(e.overallAccuracy)} accuracy with steady results.`,
    );
  }

  return decide(
    'DEVELOPING',
    'RULE_DEVELOPING',
    `${pct(e.overallAccuracy)} accuracy shows partial understanding; it is not yet steady enough for the next level.`,
  );
}

/** Student-friendly explanation of a result: what it means, why, what to do next. */
export function explainMastery(
  level: MasteryLevel,
  evidence: MasteryEvidence,
  flags: MasteryFlags,
): MasteryExplanation {
  const c = MASTERY_CONFIG;
  const needMore = Math.max(0, c.minimumAttemptsForMastered - evidence.totalAttempts);

  switch (level) {
    case 'NOT_STARTED':
      return {
        summary: 'You have not practiced this skill yet.',
        why: 'There are no answers recorded for it.',
        nextStep: 'Start a practice session for this lesson.',
        encouragement: 'Every expert started with a first question.',
      };
    case 'LEARNING':
      return {
        summary: 'You are learning this skill.',
        why:
          evidence.totalAttempts < c.minimumAttemptsForDeveloping
            ? `Only ${evidence.totalAttempts} question(s) answered so far, which is too few to judge. A couple of lucky answers can't show understanding.`
            : `Your accuracy is ${pct(evidence.overallAccuracy)}; the idea is still forming.`,
        nextStep: flags.repeatedSignErrors
          ? 'Review the sign rules in the lesson, then try some easier questions.'
          : 'Re-read the lesson example, then practice a few more questions.',
        encouragement: 'Mistakes are how this skill gets built. Keep going.',
      };
    case 'DEVELOPING':
      return {
        summary: 'You are developing this skill.',
        why: flags.recentPerformanceDecline
          ? `Your recent answers (${pct(evidence.recentAccuracy)}) are weaker than before (${pct(evidence.historicalAccuracy)}). That happens; it needs a quick refresher.`
          : `You are getting ${pct(evidence.overallAccuracy)} right, which shows partial understanding.`,
        nextStep: flags.repeatedSignErrors
          ? 'You keep making sign errors. Slow down and decide the sign first, then the size.'
          : flags.repeatedConceptualMistakes
            ? 'Some ideas need another look. Open the lesson and try the examples again.'
            : 'Practice more questions, especially the ones you missed.',
        encouragement: 'You are making real progress.',
      };
    case 'PROFICIENT':
      return {
        summary: 'You are proficient in this skill.',
        why: `${pct(evidence.overallAccuracy)} accuracy over ${evidence.totalAttempts} questions with steady results.`,
        nextStep: needMore > 0
          ? `Answer ${needMore} more question(s), including harder ones, to reach mastery.`
          : 'Try harder questions to show you can use the skill in new situations.',
        encouragement: 'Strong work. Mastery is within reach.',
      };
    case 'MASTERED':
      return {
        summary: 'You have mastered this skill.',
        why: `You answered ${evidence.totalAttempts} questions at ${pct(evidence.overallAccuracy)} accuracy, steadily, at different difficulty levels, without repeating the same mistake.`,
        nextStep: 'Move on to the next lesson. Revisit this skill now and then to keep it fresh.',
        encouragement: 'Excellent. This took consistent effort.',
      };
  }
}
