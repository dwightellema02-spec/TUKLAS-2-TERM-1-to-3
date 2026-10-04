import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../src/server/tutor/intent';
import { decideRung } from '../src/server/tutor/ladder';
import { decideTeaching, INITIAL_STATE, nextStepFor, parseState, wordSimilarity, type PolicyInput, type TutorState } from '../src/server/tutor/policy';

/** One policy step on a still-open question, deriving the ladder decision the way the service does. */
function step(state: TutorState, message: string, extra: Partial<PolicyInput> = {}, level = 0) {
  const { intent, claimedAnswer } = classifyIntent(message);
  const ladder = decideRung({ currentLevel: level, intent, questionAnswered: false });
  const result = decideTeaching({
    state,
    intent,
    claimedAnswer,
    questionOpen: true,
    questionAnswered: false,
    answeredCorrectly: null,
    masteryLevel: null,
    repeatedMistake: false,
    ladder,
    ...extra,
  });
  return { ...result, intent };
}

describe('intent: understanding is recognised, and never confused with confusion', () => {
  it.each([
    ['I get it now', 'UNDERSTOOD'],
    ['Oh I get it now, the signs decide the result', 'UNDERSTOOD'],
    ['now I understand', 'UNDERSTOOD'],
    ['ah okay I see', 'UNDERSTOOD'],
    ['makes sense now', 'UNDERSTOOD'],
    ['Naintindihan ko na', 'UNDERSTOOD'],
    ['nagets ko na po', 'UNDERSTOOD'],
    ["I don't get it", 'DONT_UNDERSTAND'],
    ["I still don't get it", 'STILL_CONFUSED'],
    ["I don't understand", 'DONT_UNDERSTAND'],
    ['hindi ko pa rin gets', 'STILL_CONFUSED'],
    ["I think it's -10", 'CHECK_ANSWER'],
    ['Should I move left or right?', 'OTHER'],
  ])('%s -> %s', (message, expected) => {
    expect(classifyIntent(message).intent).toBe(expected);
  });

  it('a student who says they understand is not climbed up the hint ladder', () => {
    expect(decideRung({ currentLevel: 3, intent: 'UNDERSTOOD', questionAnswered: false })).toMatchObject({ rung: 3, mayRevealAnswer: false });
  });
});

describe('the teaching policy', () => {
  it('first attempt: a gentle nudge, nothing remembered yet', () => {
    const { plan, state } = step(INITIAL_STATE, "I think it's -10");
    expect(plan).toMatchObject({ action: 'GIVE_HINT', strategy: 'NUDGE', sameAttemptCount: 0, claimed: '-10', avoid: [] });
    expect(state).toMatchObject({ turn: 1, attempts: ['-10'], sameAttemptCount: 0 });
  });

  it('the same wrong answer again and again escalates: review the working, change explanation, review the prerequisite', () => {
    let state = INITIAL_STATE;
    const actions: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = step(state, "I think it's −10", {}, 1);
      actions.push(result.plan.action);
      state = result.state;
    }
    expect(actions).toEqual(['GIVE_HINT', 'REVIEW_MISTAKE', 'CHANGE_EXPLANATION', 'REVIEW_PREREQUISITE']);
    expect(state.attempts).toEqual(['-10', '-10', '-10', '-10']); // true minus and hyphen are the same answer
    expect(state.sameAttemptCount).toBe(3);
  });

  it('a different answer resets the repeat count', () => {
    const first = step(INITIAL_STATE, "I think it's -10");
    const repeat = step(first.state, "I think it's -10");
    const different = step(repeat.state, "I think it's 4");
    expect(repeat.state.sameAttemptCount).toBe(1);
    expect(different.state.sameAttemptCount).toBe(0);
    expect(different.plan.action).not.toBe('REVIEW_MISTAKE');
  });

  it('an old repeat does not hijack an unrelated message (no new answer this turn)', () => {
    let state = step(INITIAL_STATE, "I think it's -10").state;
    state = step(state, "I think it's -10").state; // sameAttemptCount is now 1
    const { plan } = step(state, 'hint please', {}, 1);
    expect(plan.action).not.toBe('REVIEW_MISTAKE');
    expect(plan.claimed).toBeNull();
  });

  it('repeated confusion escalates: change the explanation, review the prerequisite, then recommend practice', () => {
    let state = INITIAL_STATE;
    const seen: Array<[string, string]> = [];
    for (let i = 0; i < 3; i += 1) {
      const result = step(state, "I still don't get it", {}, i + 1);
      seen.push([result.plan.action, result.plan.strategy]);
      state = result.state;
    }
    expect(seen).toEqual([
      ['CHANGE_EXPLANATION', 'NUMBER_LINE'],
      ['REVIEW_PREREQUISITE', 'PREREQUISITE'],
      ['RECOMMEND_PRACTICE', 'PRACTICE'],
    ]);
    expect(state.confusedCount).toBe(3);
  });

  it('understanding resets confusion and moves forward instead of explaining again', () => {
    let state = step(INITIAL_STATE, "I still don't get it").state;
    state = step(state, "I still don't get it", {}, 2).state;
    const done = step(state, 'ah okay I get it now', {}, 3);
    expect(done.plan).toMatchObject({ action: 'ASK_STUDENT_TO_TRY', strategy: 'CHECK', understands: true });
    expect(done.state).toMatchObject({ confusedCount: 0, understanding: 'UNDERSTANDS' });
  });

  it('understanding in a general lesson chat asks the student to apply it', () => {
    const { plan } = step(INITIAL_STATE, 'I get it now', { questionOpen: false });
    expect(plan.action).toBe('CHECK_UNDERSTANDING');
  });

  it('mastery shapes the next step: a strong student who understands is challenged, not re-taught', () => {
    expect(step(INITIAL_STATE, 'I get it now', { masteryLevel: 'PROFICIENT' }).plan.action).toBe('INCREASE_DIFFICULTY');
    expect(step(INITIAL_STATE, 'I get it now', { masteryLevel: 'LEARNING' }).plan.action).toBe('ASK_STUDENT_TO_TRY');
  });

  it('after a wrong answer with repeated mistakes, "I get it" recommends targeted practice', () => {
    const { plan } = step(INITIAL_STATE, 'I get it now', { questionOpen: false, questionAnswered: true, answeredCorrectly: false, repeatedMistake: true });
    expect(plan.action).toBe('RECOMMEND_PRACTICE');
    expect(plan.strategy).toBe('PRACTICE');
  });

  it('after the answer is submitted, a question gets the full explanation (the ladder rule is unchanged)', () => {
    const { plan } = step(INITIAL_STATE, 'why?', { questionOpen: false, questionAnswered: true, answeredCorrectly: false });
    expect(plan.action).toBe('EXPLAIN_AFTER_ANSWER');
  });

  it('never uses the same strategy twice in a row, however long the student keeps asking, and keeps a bounded memory', () => {
    let state = INITIAL_STATE;
    let level = 0;
    let previous: string | null = null;
    for (let i = 0; i < 30; i += 1) {
      level = Math.min(6, level + 1);
      const result = step(state, 'hint please', {}, level);
      expect(result.plan.strategy, `turn ${i + 1}`).not.toBe(previous);
      previous = result.plan.strategy;
      state = result.state;
      expect(state.strategiesUsed.length).toBeLessThanOrEqual(6);
    }
  });

  it('never mutates the state it was given', () => {
    const before = JSON.stringify(INITIAL_STATE);
    step(INITIAL_STATE, "I think it's -10");
    expect(JSON.stringify(INITIAL_STATE)).toBe(before);
  });

  it('is deterministic: the same input gives the same decision', () => {
    expect(step(INITIAL_STATE, "I still don't get it")).toEqual(step(INITIAL_STATE, "I still don't get it"));
  });
});

describe('stored state is never trusted', () => {
  it.each([[null], [undefined], ['x'], [{}], [{ v: 2 }], [{ ...INITIAL_STATE, turn: -1 }], [{ ...INITIAL_STATE, strategiesUsed: ['HACK'] }], [{ ...INITIAL_STATE, attempts: ['x'.repeat(50)] }]])(
    'garbage %j falls back to a clean state',
    (raw) => {
      expect(parseState(raw)).toEqual(INITIAL_STATE);
    },
  );

  it('a valid state round-trips', () => {
    const state = step(INITIAL_STATE, "I think it's -10").state;
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe('helpers', () => {
  it('wordSimilarity: identical is 1, unrelated is low, punctuation and case do not matter', () => {
    expect(wordSimilarity('Look at the signs.', 'look at the SIGNS')).toBe(1);
    expect(wordSimilarity('Look at the signs first', 'Try a number line and move right')).toBeLessThan(0.2);
  });

  it('nextStepFor only suggests something to DO for the actions that mean it', () => {
    expect(nextStepFor('RECOMMEND_PRACTICE', 'Adding integers')).toContain('Adding integers');
    expect(nextStepFor('ASK_STUDENT_TO_TRY')).toMatch(/submit/i);
    expect(nextStepFor('GIVE_HINT')).toBeNull();
    expect(nextStepFor(null)).toBeNull();
  });
});
