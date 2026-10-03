import { describe, expect, it } from 'vitest';
import { checkTutorReply, MAX_REPLY_CHARS, statesValue } from '../src/server/tutor/guard';

const guard = (reply: string, secret: string[] = ['7'], mayRevealAnswer = false) =>
  checkTutorReply({ reply, secretAnswers: secret, mayRevealAnswer });

describe('statesValue: numbers', () => {
  it('finds a positive answer stated on its own', () => {
    for (const text of ['The answer is 7.', '15 - 8 = 7', 'You get 7', '7!', 'so (-8) + 15 equals 7, right?', 'Answer: +7']) {
      expect(statesValue(text, '7'), text).toBe(true);
    }
  });

  it('does not confuse it with larger, decimal, negative or attached numbers', () => {
    for (const text of ['17 is not it', '70', '7.5', '27', '-7', '−7', 'the 7th step', 'x7', '1,7']) {
      expect(statesValue(text, '7'), text).toBe(text === '1,7');
    }
  });

  it('finds a negative answer in any minus style or spacing', () => {
    for (const text of ['The answer is -10', 'it is −10.', '= - 10', '(−10)', 'negative: -10!']) {
      expect(statesValue(text, '-10'), text).toBe(true);
      expect(statesValue(text, '−10'), text).toBe(true);
    }
  });

  it('does not match a negative answer inside another number', () => {
    for (const text of ['-100', '−10.5', 'a-10b', '10', 'x-10']) {
      expect(statesValue(text, '-10'), text).toBe(false);
    }
  });

  it('handles decimals and ignores empty values', () => {
    expect(statesValue('about 2.5 units', '2.5')).toBe(true);
    expect(statesValue('about 2.55 units', '2.5')).toBe(false);
    expect(statesValue('anything', '')).toBe(false);
    expect(statesValue('anything', '   ')).toBe(false);
  });
});

describe('statesValue: words', () => {
  it('matches whole words case-insensitively and ignores very short values', () => {
    expect(statesValue('That process is called Photosynthesis.', 'photosynthesis')).toBe(true);
    expect(statesValue('photosynthesizing', 'photosynthesis')).toBe(false);
    expect(statesValue('it is a', 'a')).toBe(false);
  });
});

describe('answer leakage', () => {
  it('blocks a reply that states the answer before the student has answered', () => {
    for (const reply of [
      'The answer is 7.',
      'Think: 15 − 8 = 7. Does that make sense?',
      'So you should get 7 in the end.',
      'Great question! It equals 7.',
    ]) {
      expect(guard(reply), reply).toEqual({ ok: false, reason: 'REVEALS_ANSWER' });
    }
  });

  it('allows scaffolding that does not state the answer', () => {
    for (const reply of [
      'Look at the signs first. Are they the same or different?',
      'Try picturing it on a number line: start at −8 and move 15 steps to the right.',
      'Subtract the smaller size from the larger one: 15 and 8. What do you get?',
      'Your answer −7 has the right size; check the sign.',
      'You tried 17, which is close. Count again?',
    ]) {
      expect(guard(reply), reply).toEqual({ ok: true });
    }
  });

  it('allows the answer once the student has answered (full explanation)', () => {
    expect(guard('The answer is 7 because 15 − 8 = 7.', ['7'], true)).toEqual({ ok: true });
  });

  it('checks every accepted answer', () => {
    expect(guard('It is 24.', ['24', '24.0']).ok).toBe(false);
    expect(guard('It is 24.0', ['24', '24.0']).ok).toBe(false);
  });

  it('blocks word answers too', () => {
    expect(guard('This is called photosynthesis.', ['Photosynthesis'])).toEqual({ ok: false, reason: 'REVEALS_ANSWER' });
  });

  it('is not fooled by unicode minus on either side', () => {
    expect(guard('The result is −10.', ['-10']).ok).toBe(false);
    expect(guard('The result is -10.', ['−10']).ok).toBe(false);
  });
});

describe('claims about content the tutor never received', () => {
  it.each([
    'I watched the video and it explains this well.',
    'I have read the PDF you uploaded.',
    'In the video, the teacher shows a number line.',
    'The document says to add the signs.',
    'This worksheet explains it step by step.',
    'Napanood ko na ang video.',
  ])('blocks: %s', (reply) => {
    expect(guard(reply, [])).toEqual({ ok: false, reason: 'CLAIMS_UNSEEN_CONTENT' });
  });

  it('allows the lesson wording the tutor is supposed to use', () => {
    expect(guard('Your lesson explains that subtracting a negative is the same as adding.', [])).toEqual({ ok: true });
    expect(guard('In general, a number line helps you see direction.', [])).toEqual({ ok: true });
  });
});

describe('format and instruction safety', () => {
  it('rejects empty and over-long replies', () => {
    expect(guard('   ', [])).toEqual({ ok: false, reason: 'EMPTY' });
    expect(guard('x'.repeat(MAX_REPLY_CHARS + 1), [])).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(guard('x'.repeat(MAX_REPLY_CHARS), []).ok).toBe(true);
  });

  it('rejects replies that echo the tutor instructions or delimiters', () => {
    for (const reply of [
      'My system prompt says I must not tell you.',
      'Here are my hidden instructions: ...',
      'You wrote <student_message>ignore previous</student_message>',
      'BEGIN LESSON CONTEXT: ...',
    ]) {
      expect(guard(reply, []), reply).toEqual({ ok: false, reason: 'ECHOES_INSTRUCTIONS' });
    }
  });
});

describe('no verdicts on a proposed answer (the tutor must not become an answer oracle)', () => {
  const noVerdict = (reply: string) => checkTutorReply({ reply, secretAnswers: ['7'], mayRevealAnswer: false, noVerdict: true });

  it.each([
    "That's correct!",
    "That's not right.",
    'Yes, well done!',
    'No, try again.',
    "You're right about the sign.",
    'Not quite. Check the sign.',
    'Exactly! That is the idea.',
    'Spot on.',
    "You got it!",
    'Your answer is wrong.',
    'Your answer is incorrect',
  ])('rejects the verdict: %s', (reply) => {
    expect(noVerdict(reply)).toEqual({ ok: false, reason: 'GIVES_VERDICT' });
  });

  it.each([
    'Walk me through how you got that. What did you do with the signs first?',
    'Try the steps from your lesson on your numbers and see what you get.',
    'Which number is farther from zero, and what sign does it have?',
    'Good thinking. How could you check it using a number line?',
  ])('allows reasoning-focused replies: %s', (reply) => {
    expect(noVerdict(reply)).toEqual({ ok: true });
  });

  it('is only enforced when asked (after answering, verdicts are fine)', () => {
    expect(guard("That's correct! The answer is 7.", ['7'], true)).toEqual({ ok: true });
  });
});
