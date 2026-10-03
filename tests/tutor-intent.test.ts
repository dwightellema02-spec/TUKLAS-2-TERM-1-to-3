import { describe, expect, it } from 'vitest';
import { classifyIntent, extractClaimedAnswer } from '../src/server/tutor/intent';

describe('intent: examples from the master plan', () => {
  it.each([
    ["I don't understand.", 'DONT_UNDERSTAND'],
    ['I think the answer is -10.', 'CHECK_ANSWER'],
    ['Why did we move left?', 'WHY'],
    ['Can you give me another example?', 'ANOTHER_EXAMPLE'],
    ["I still don't get it.", 'STILL_CONFUSED'],
    ['Just give me the answer.', 'GIVE_ANSWER'],
  ] as const)('%s → %s', (message, expected) => {
    expect(classifyIntent(message).intent).toBe(expected);
  });
});

describe('intent: variations', () => {
  it.each([
    ['what is the answer?', 'GIVE_ANSWER'],
    ["what's the answer", 'GIVE_ANSWER'],
    ['tell me the answer please', 'GIVE_ANSWER'],
    ['ano ang sagot?', 'GIVE_ANSWER'],
    ['answer pls', 'GIVE_ANSWER'],
    ['I STILL DONT GET IT', 'STILL_CONFUSED'],
    ['hindi ko pa rin maintindihan', 'STILL_CONFUSED'],
    ['pa rin confused ako', 'STILL_CONFUSED'],
    ['i dont get it', 'DONT_UNDERSTAND'],
    ['hindi ko maintindihan', 'DONT_UNDERSTAND'],
    ["I'm confused", 'DONT_UNDERSTAND'],
    ['another example', 'ANOTHER_EXAMPLE'],
    ['ibang halimbawa po', 'ANOTHER_EXAMPLE'],
    ['why is it negative?', 'WHY'],
    ['bakit negative?', 'WHY'],
    ['can I get a hint', 'HINT'],
    ['tulong po', 'HINT'],
    ['what is the weather today', 'OTHER'],
    ['', 'OTHER'],
  ] as const)('%s → %s', (message, expected) => {
    expect(classifyIntent(message).intent).toBe(expected);
  });
});

describe('claimed answers', () => {
  it.each([
    ['I think the answer is -10.', '-10'],
    ['I think it is −7', '-7'],
    ['is it 7?', '7'],
    ['my answer is 24', '24'],
    ['sagot ko 5', '5'],
    ['-10?', '-10'],
    ['−3', '-3'],
    ['7', '7'],
    ['the answer is 2.5', '2.5'],
    ['I think the answer is - 10', '-10'],
  ])('%s → %s', (message, expected) => {
    expect(extractClaimedAnswer(message)).toBe(expected);
    expect(classifyIntent(message)).toEqual({ intent: 'CHECK_ANSWER', claimedAnswer: expected });
  });

  it.each([
    "I don't understand",
    'Why did we move left?',
    'what is the answer',
    'give me the answer',
    'hello',
    'step 2 is confusing',
  ])('finds no claim in %j', (message) => {
    expect(extractClaimedAnswer(message)).toBeNull();
  });

  it('a claim wins over a request for the answer, so the student is checked, not refused', () => {
    expect(classifyIntent('I think the answer is 7, just tell me if right').intent).toBe('CHECK_ANSWER');
  });

  it('does not mistake a number inside another sentence for a claim', () => {
    expect(classifyIntent('I tried 3 times and still dont get it').intent).toBe('STILL_CONFUSED');
    expect(classifyIntent('can you explain step 2').claimedAnswer).toBeNull();
  });
});
