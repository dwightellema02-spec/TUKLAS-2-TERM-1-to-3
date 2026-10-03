import { describe, expect, it } from 'vitest';
import { decideRung, MAX_UNANSWERED_RUNG, RUNGS, RUNG_LABELS } from '../src/server/tutor/ladder';
import type { TutorIntent } from '../src/server/tutor/intent';

const ALL_INTENTS: TutorIntent[] = [
  'GIVE_ANSWER',
  'CHECK_ANSWER',
  'STILL_CONFUSED',
  'DONT_UNDERSTAND',
  'ANOTHER_EXAMPLE',
  'WHY',
  'HINT',
  'OTHER',
];

const decide = (currentLevel: number, intent: TutorIntent, questionAnswered = false) =>
  decideRung({ currentLevel, intent, questionAnswered });

describe('the ladder escalates one rung at a time', () => {
  it('a first request for help gets the gentlest hint', () => {
    for (const intent of ['HINT', 'DONT_UNDERSTAND', 'OTHER', 'GIVE_ANSWER', 'STILL_CONFUSED'] as const) {
      expect(decide(0, intent).rung, intent).toBe(RUNGS.HINT);
    }
  });

  it('each further request for help moves up exactly one rung, never more', () => {
    for (let level = 1; level < MAX_UNANSWERED_RUNG; level += 1) {
      expect(decide(level, 'DONT_UNDERSTAND').rung).toBe(level + 1);
      expect(decide(level, 'HINT').rung).toBe(level + 1);
    }
  });

  it('stops at the worked example while the question is unanswered', () => {
    expect(decide(MAX_UNANSWERED_RUNG, 'HINT').rung).toBe(MAX_UNANSWERED_RUNG);
    expect(decide(MAX_UNANSWERED_RUNG, 'GIVE_ANSWER').rung).toBe(MAX_UNANSWERED_RUNG);
    expect(MAX_UNANSWERED_RUNG).toBeLessThan(RUNGS.FULL_EXPLANATION);
  });

  it('cannot be pushed to the full explanation by asking, whatever the stored level says', () => {
    for (const intent of ALL_INTENTS) {
      for (const level of [0, 1, 3, 6, 7, 99]) {
        const decision = decide(level, intent, false);
        expect(decision.rung, `${intent} from ${level}`).toBeLessThanOrEqual(MAX_UNANSWERED_RUNG);
        expect(decision.mayRevealAnswer, `${intent} from ${level}`).toBe(false);
      }
    }
  });
});

describe('what each intent does', () => {
  it('refuses an answer request but still adds scaffolding', () => {
    const decision = decide(2, 'GIVE_ANSWER');
    expect(decision).toMatchObject({ rung: 3, declineAnswerRequest: true, mayRevealAnswer: false });
  });

  it('changes strategy when the student is still confused, and climbs', () => {
    expect(decide(2, 'STILL_CONFUSED')).toMatchObject({ rung: 3, changeStrategy: true });
    expect(decide(2, 'DONT_UNDERSTAND').changeStrategy).toBe(false);
  });

  it('asking why or checking an answer does not climb', () => {
    expect(decide(3, 'WHY').rung).toBe(3);
    expect(decide(3, 'CHECK_ANSWER').rung).toBe(3);
    expect(decide(0, 'WHY').rung).toBe(RUNGS.HINT); // never below the first rung
    expect(decide(0, 'CHECK_ANSWER').rung).toBe(RUNGS.HINT);
  });

  it('another example uses a different problem and is at least a concept explanation', () => {
    expect(decide(1, 'ANOTHER_EXAMPLE')).toMatchObject({ rung: RUNGS.CONCEPT_EXPLANATION, useDifferentExample: true });
    expect(decide(5, 'ANOTHER_EXAMPLE')).toMatchObject({ rung: 5, useDifferentExample: true });
    expect(decide(5, 'ANOTHER_EXAMPLE').mayRevealAnswer).toBe(false);
  });
});

describe('after the student has answered', () => {
  it('allows the full explanation, including the answer', () => {
    for (const intent of ALL_INTENTS) {
      const decision = decide(2, intent, true);
      expect(decision.rung).toBe(RUNGS.FULL_EXPLANATION);
      expect(decision.mayRevealAnswer).toBe(true);
      expect(decision.declineAnswerRequest).toBe(false);
    }
  });

  it('still changes strategy or uses another example when asked', () => {
    expect(decide(0, 'STILL_CONFUSED', true).changeStrategy).toBe(true);
    expect(decide(0, 'ANOTHER_EXAMPLE', true).useDifferentExample).toBe(true);
  });
});

describe('labels', () => {
  it('has a student-friendly label for every rung', () => {
    for (let rung = 1; rung <= 7; rung += 1) expect(RUNG_LABELS[rung].length).toBeGreaterThan(3);
  });
});
