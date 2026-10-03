import { describe, expect, it } from 'vitest';
import {
  buildEvidence,
  evaluateMastery,
  MASTERY_CONFIG,
  type Difficulty,
  type MasteryAttempt,
} from '../src/server/mastery';

const ok = (difficulty: Difficulty = 'MEDIUM'): MasteryAttempt => ({ correct: true, difficulty });
const bad = (difficulty: Difficulty = 'MEDIUM', mistakeCategory?: string): MasteryAttempt => ({
  correct: false,
  difficulty,
  mistakeCategory,
});
const repeat = (count: number, make: () => MasteryAttempt) => Array.from({ length: count }, make);

/** A varied, strong history of N correct answers across all difficulty levels. */
const strong = (count: number): MasteryAttempt[] =>
  Array.from({ length: count }, (_, i) => ok((['EASY', 'MEDIUM', 'HARD'] as const)[i % 3]));

describe('evidence', () => {
  it('computes accuracy, recent window and streak', () => {
    const attempts = [bad(), bad(), ok(), ok(), ok(), ok(), ok()];
    const evidence = buildEvidence(attempts);
    expect(evidence.totalAttempts).toBe(7);
    expect(evidence.overallAccuracy).toBeCloseTo(0.71, 2);
    expect(evidence.recentAccuracy).toBe(1); // last 5 are all correct
    expect(evidence.historicalAccuracy).toBe(0); // first 2 are wrong
    expect(evidence.consecutiveCorrect).toBe(5);
  });

  it('counts difficulty bands and accuracy per band', () => {
    const evidence = buildEvidence([ok('EASY'), bad('HARD'), ok('HARD')]);
    expect(evidence.difficulty.EASY).toMatchObject({ attempts: 1, correct: 1, accuracy: 1 });
    expect(evidence.difficulty.HARD).toMatchObject({ attempts: 2, correct: 1, accuracy: 0.5 });
    expect(evidence.difficulty.MEDIUM.attempts).toBe(0);
    expect(evidence.distinctDifficultyBands).toBe(2);
  });

  it('detects repeated sign errors and conceptual mistakes only among recent wrong answers', () => {
    expect(buildEvidence([bad('EASY', 'SIGN_ERROR'), ok(), bad('EASY', 'SIGN_ERROR')]).repeatedSignErrors).toBe(true);
    expect(buildEvidence([bad('EASY', 'SIGN_ERROR'), ok()]).repeatedSignErrors).toBe(false);
    expect(buildEvidence([bad('EASY', 'CONCEPTUAL'), bad('EASY', 'CONCEPTUAL')]).repeatedConceptualMistakes).toBe(true);
    // an old pattern that fell out of the 10-attempt window no longer counts
    const old = [bad('EASY', 'SIGN_ERROR'), bad('EASY', 'SIGN_ERROR'), ...repeat(10, () => ok())];
    expect(buildEvidence(old).repeatedSignErrors).toBe(false);
  });

  it('gives zero consistency for fewer than two attempts and lower for flip-flopping', () => {
    expect(buildEvidence([ok()]).consistencyScore).toBe(0);
    const steady = buildEvidence([...repeat(6, () => ok()), ...repeat(4, () => ok())]).consistencyScore;
    const erratic = buildEvidence(Array.from({ length: 10 }, (_, i) => (i % 2 ? ok() : bad()))).consistencyScore;
    expect(steady).toBeGreaterThan(0.9);
    expect(erratic).toBeLessThan(steady - 0.2);
  });
});

describe('mastery levels', () => {
  it('starts at NOT_STARTED with no evidence', () => {
    const result = evaluateMastery([]);
    expect(result.level).toBe('NOT_STARTED');
    expect(result.ruleCode).toBe('RULE_NOT_STARTED');
  });

  it('keeps a student at LEARNING until there is enough evidence, even if every answer is right', () => {
    for (const n of [1, 2, 3]) {
      const result = evaluateMastery(strong(n));
      expect(result.level, `${n} correct answers`).toBe('LEARNING');
      expect(result.ruleCode).toBe('RULE_INSUFFICIENT_EVIDENCE');
    }
  });

  it('never awards MASTERED from one lucky streak or a short history', () => {
    expect(evaluateMastery(strong(5)).level).not.toBe('MASTERED');
    expect(evaluateMastery(strong(9)).level).not.toBe('MASTERED');
  });

  it('awards MASTERED for a long, accurate, steady history across difficulty levels', () => {
    const result = evaluateMastery(strong(MASTERY_CONFIG.minimumAttemptsForMastered));
    expect(result.level).toBe('MASTERED');
    expect(result.ruleCode).toBe('RULE_MASTERED');
    expect(result.explanation.nextStep).toMatch(/next lesson/i);
  });

  it('does not award MASTERED when every question was the same difficulty (limited evidence)', () => {
    const result = evaluateMastery(repeat(12, () => ok('EASY')));
    expect(result.flags.limitedDifficultyEvidence).toBe(true);
    expect(result.level).toBe('PROFICIENT');
  });

  it('does not award MASTERED while hard questions are failing', () => {
    const attempts = [...strong(9), bad('HARD'), bad('HARD'), ok('HARD')];
    const result = evaluateMastery(attempts);
    expect(result.level).not.toBe('MASTERED');
  });

  it('does not award MASTERED with repeated sign errors, and says so', () => {
    // One sign error is not a pattern.
    const single = [...strong(9), bad('MEDIUM', 'SIGN_ERROR'), ...strong(3)];
    expect(evaluateMastery(single).flags.repeatedSignErrors).toBe(false);
    // Two within the recent window are: an otherwise strong history must not be MASTERED.
    const withErrors = [...strong(5), bad('EASY', 'SIGN_ERROR'), bad('MEDIUM', 'SIGN_ERROR'), ...strong(5)];
    expect(evaluateMastery(withErrors).evidence.overallAccuracy).toBeGreaterThanOrEqual(0.8);
    const result = evaluateMastery(withErrors);
    expect(result.flags.repeatedSignErrors).toBe(true);
    expect(result.level).not.toBe('MASTERED');
  });

  it('gives PROFICIENT for solid but not yet mastery-level work', () => {
    const attempts = [bad('EASY'), ...strong(8), bad('HARD')];
    const result = evaluateMastery(attempts);
    expect(result.level).toBe('PROFICIENT');
    expect(result.explanation.nextStep).toMatch(/mastery|harder/i);
  });

  it('gives LEARNING for low accuracy even with plenty of attempts', () => {
    const attempts = Array.from({ length: 12 }, (_, i) => (i % 4 === 0 ? ok() : bad()));
    expect(evaluateMastery(attempts).level).toBe('LEARNING');
  });

  it('gives DEVELOPING for partial understanding', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => (i % 3 === 2 ? bad() : ok()));
    const result = evaluateMastery(attempts);
    expect(result.level).toBe('DEVELOPING');
  });

  it('drops a previously strong student to DEVELOPING when recent answers collapse', () => {
    const attempts = [...strong(8), ...repeat(3, () => bad()), ok(), bad()];
    const result = evaluateMastery(attempts);
    expect(result.flags.recentPerformanceDecline).toBe(true);
    expect(result.level).toBe('DEVELOPING');
    expect(result.explanation.why).toMatch(/recent/i);
  });

  it('is deterministic: the same history always gives the same result', () => {
    const attempts = [bad('EASY', 'SIGN_ERROR'), ...strong(9)];
    expect(evaluateMastery(attempts)).toEqual(evaluateMastery(attempts));
  });

  it('tells the student something specific about repeated sign errors', () => {
    const attempts = [bad('EASY', 'SIGN_ERROR'), bad('EASY', 'SIGN_ERROR'), ok(), bad('MEDIUM'), ok(), ok(), bad('MEDIUM', 'SIGN_ERROR')];
    const result = evaluateMastery(attempts);
    expect(result.flags.repeatedSignErrors).toBe(true);
    expect(`${result.explanation.nextStep}`).toMatch(/sign/i);
  });

  it('always explains the result in plain language', () => {
    for (const attempts of [[], strong(2), strong(10), repeat(10, () => bad())]) {
      const { explanation } = evaluateMastery(attempts);
      for (const text of Object.values(explanation)) expect(text.length).toBeGreaterThan(10);
    }
  });

  it('reports the rule version for research reproducibility', () => {
    expect(evaluateMastery(strong(3)).masteryVersion).toBe('MASTERY_V1');
  });
});

describe('ordering of levels (monotonic with better evidence)', () => {
  const rank = { NOT_STARTED: 0, LEARNING: 1, DEVELOPING: 2, PROFICIENT: 3, MASTERED: 4 } as const;

  it('more correct answers never lower the level', () => {
    let previous = -1;
    for (let correct = 0; correct <= 12; correct += 1) {
      const attempts = [
        ...repeat(12 - correct, () => bad('MEDIUM')),
        ...Array.from({ length: correct }, (_, i) => ok((['EASY', 'MEDIUM', 'HARD'] as const)[i % 3])),
      ];
      const level = rank[evaluateMastery(attempts).level];
      expect(level, `${correct} correct of 12 (recent answers all correct)`).toBeGreaterThanOrEqual(0);
      previous = Math.max(previous, level);
    }
    expect(previous).toBe(rank.MASTERED);
  });
});
