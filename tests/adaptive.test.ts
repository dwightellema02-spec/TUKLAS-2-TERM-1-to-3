import { describe, expect, it } from 'vitest';
import {
  difficultyDistance,
  recommendNext,
  targetDifficultyFor,
  type SkillState,
} from '../src/server/adaptive';
import type { MasteryLevel } from '../src/server/mastery';

const skill = (name: string, level: MasteryLevel, flags: SkillState['flags'] = {}): SkillState => ({
  skillId: name.toLowerCase(),
  name,
  level,
  flags,
});

describe('target difficulty follows mastery', () => {
  it('aims easy for beginners, medium while developing, hard once proficient', () => {
    expect(targetDifficultyFor('NOT_STARTED')).toBe('EASY');
    expect(targetDifficultyFor('LEARNING')).toBe('EASY');
    expect(targetDifficultyFor('DEVELOPING')).toBe('MEDIUM');
    expect(targetDifficultyFor('PROFICIENT')).toBe('HARD');
    expect(targetDifficultyFor('MASTERED')).toBe('HARD');
  });

  it('measures how far a question is from the ideal difficulty', () => {
    expect(difficultyDistance('EASY', 'LEARNING')).toBe(0);
    expect(difficultyDistance('HARD', 'LEARNING')).toBe(2);
    expect(difficultyDistance('MEDIUM', 'DEVELOPING')).toBe(0);
    expect(difficultyDistance('EASY', 'PROFICIENT')).toBe(2);
  });
});

describe('recommendNext', () => {
  it('starts a lesson with no skills yet', () => {
    expect(recommendNext([])).toMatchObject({ action: 'START', skillId: null });
  });

  it('starts an untouched skill', () => {
    const result = recommendNext([skill('Adding integers', 'NOT_STARTED')]);
    expect(result).toMatchObject({ action: 'START', targetDifficulty: 'EASY' });
  });

  it('focuses on the weakest skill, not the strongest', () => {
    const result = recommendNext([
      skill('Adding integers', 'MASTERED'),
      skill('Dividing integers', 'LEARNING'),
      skill('Multiplying integers', 'PROFICIENT'),
    ]);
    expect(result.skillName).toBe('Dividing integers');
    expect(result.action).toBe('PRACTICE_EASIER');
  });

  it('remediates repeated sign errors with a message about signs', () => {
    const result = recommendNext([skill('Subtracting integers', 'LEARNING', { repeatedSignErrors: true })]);
    expect(result).toMatchObject({ action: 'REMEDIATE', reason: 'REPEATED_SIGN_ERRORS' });
    expect(result.message).toMatch(/sign/i);
  });

  it('remediates repeated conceptual mistakes', () => {
    const result = recommendNext([skill('Subtracting integers', 'LEARNING', { repeatedConceptualMistakes: true })]);
    expect(result).toMatchObject({ action: 'REMEDIATE', reason: 'REPEATED_CONCEPTUAL_MISTAKES' });
  });

  it('keeps practicing at the same level while developing, and remediates after a decline', () => {
    expect(recommendNext([skill('Adding integers', 'DEVELOPING')])).toMatchObject({
      action: 'PRACTICE_SAME',
      targetDifficulty: 'MEDIUM',
    });
    expect(
      recommendNext([skill('Adding integers', 'DEVELOPING', { recentPerformanceDecline: true })]),
    ).toMatchObject({ action: 'REMEDIATE', reason: 'RECENT_DECLINE' });
  });

  it('pushes proficient students to harder questions', () => {
    expect(recommendNext([skill('Adding integers', 'PROFICIENT'), skill('Dividing integers', 'MASTERED')])).toMatchObject({
      action: 'PRACTICE_HARDER',
      targetDifficulty: 'HARD',
    });
  });

  it('advances only when EVERY skill is mastered', () => {
    expect(recommendNext([skill('A', 'MASTERED'), skill('B', 'MASTERED')]).action).toBe('ADVANCE');
    expect(recommendNext([skill('A', 'MASTERED'), skill('B', 'PROFICIENT')]).action).not.toBe('ADVANCE');
  });

  it('is deterministic and independent of input order', () => {
    const states = [skill('B', 'DEVELOPING'), skill('A', 'DEVELOPING'), skill('C', 'LEARNING')];
    const first = recommendNext(states);
    expect(recommendNext([...states].reverse())).toEqual(first);
    expect(first.skillName).toBe('C');
  });

  it('breaks ties by skill name so the answer is stable', () => {
    expect(recommendNext([skill('Zeta', 'LEARNING'), skill('Alpha', 'LEARNING')]).skillName).toBe('Alpha');
  });

  it('always gives a reason code and a readable message', () => {
    const levels: MasteryLevel[] = ['NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'];
    for (const level of levels) {
      const result = recommendNext([skill('Adding integers', level)]);
      expect(result.reason).toMatch(/^[A-Z_]+$/);
      expect(result.message.length).toBeGreaterThan(15);
    }
  });
});
