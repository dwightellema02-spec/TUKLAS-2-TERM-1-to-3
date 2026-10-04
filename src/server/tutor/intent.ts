/**
 * Tuklas 2.0 — What is the student trying to do? (master plan §33 "interpret intent")
 *
 * A deterministic, auditable first step before any AI is involved. The result drives the
 * hint ladder (see ladder.ts) and is also passed to the model so it answers the student's
 * actual message and not a generic one.
 *
 * Understands English and common Filipino/Taglish phrasing.
 */

export type TutorIntent =
  | 'GIVE_ANSWER' // "just give me the answer"
  | 'CHECK_ANSWER' // "I think it's -10"
  | 'STILL_CONFUSED' // "I still don't get it"
  | 'DONT_UNDERSTAND' // "I don't understand"
  | 'UNDERSTOOD' // "ah, I get it now"
  | 'ANOTHER_EXAMPLE' // "can you give me another example?"
  | 'WHY' // "why did we move left?"
  | 'HINT' // "hint please"
  | 'OTHER';

export type IntentResult = {
  intent: TutorIntent;
  /** A numeric answer the student proposed, normalized ("-10"), when they proposed one. */
  claimedAnswer: string | null;
};

const MINUS = /[−–—]/g;

const GIVE_ANSWER =
  /\b(give|tell|show|reveal|say)\s+(me\s+)?(the\s+)?(final\s+)?(answer|solution)\b|\b(what'?s|what\s+is)\s+the\s+(answer|solution)\b|\bjust\s+(the\s+)?answer\b|\banswer\s+(please|pls|na)\b|\b(ano\s+(ang\s+)?sagot|sagot\s+po|pakisagot|ibigay\s+(mo\s+)?(na\s+)?ang\s+sagot)\b/i;

const STILL_CONFUSED =
  /\b(still|pa\s*rin|pa\s*din)\b[^.?!]{0,30}\b(don'?t|do\s+not|dont|can'?t|cannot|not|hindi|di)\b[^.?!]{0,20}\b(get|understand|know|gets|maintindihan|gets)\b|\b(i\s+)?(still\s+)?(don'?t|dont)\s+(get|understand)\s+(it\s+)?(still|pa\s*rin)\b|\bhindi\s+ko\s+pa\s*rin\b|\bdi\s+ko\s+pa\s*rin\b|\b(still|pa\s*rin)\s+(confused|lost|stuck)\b|\bstill\s+(don'?t|dont)\b/i;

const DONT_UNDERSTAND =
  /\b(i\s+)?(don'?t|dont|do\s+not)\s+(understand|get|know)\b|\bnot\s+(sure|getting)\b|\b(confused|lost|stuck)\b|\bhindi\s+ko\s+(maintindihan|gets|alam)\b|\bdi\s+ko\s+(maintindihan|gets|alam)\b|\bwala\s+akong\s+maintindihan\b/i;

// Checked AFTER the "don't understand" patterns, so "I don't get it" is never read as understanding.
const UNDERSTOOD =
  /\b(now\s+)?i\s+(get|got|understand)\s+(it|this|that)\b|\bnow\s+i\s+(understand|see|get)\b|\bi\s+(finally\s+)?(understand|get)\s+now\b|\bi\s+see\s+(now|how|why)\b|\bmakes?\s+sense\s+now\b|\bah+\s*,?\s*(ok|okay|i\s+see|i\s+get)\b|\b(naintindihan|nagets|gets)\s+ko\s+na\b|\bnaintindihan\s+ko\s+na\b/i;

const ANOTHER_EXAMPLE =
  /\b(another|more|different|one\s+more|other)\s+(example|problem|one)\b|\bexample\s+(please|pls)\b|\b(ibang|iba\s+pang)\s+halimbawa\b|\bhalimbawa\s+(pa|naman)\b|\bgive\s+(me\s+)?an?\s+example\b/i;

const WHY = /^\s*(why|how\s+come|bakit|paano\s+(kaya|naging))\b|\bwhy\s+(did|do|does|is|are|can'?t|would)\b|\bbakit\b/i;

const HINT = /\b(hint|clue|help|tulong|pahelp|pa\s*help|tulungan)\b/i;

// "I think it's -10", "is it 7?", "my answer is −7", "sagot ko 5", or just "-10?"
const CLAIM_PHRASE =
  /(?:i\s+think|is\s+it|my\s+answer(?:\s+is)?|answer\s+is|sagot\s+ko|it'?s|its|is)\s*(?:the\s+answer\s*(?:is)?\s*)?[:=]?\s*(?:equal\s+to\s+)?([-−–]?\s?\d+(?:\.\d+)?)\b/i;
const BARE_NUMBER = /^\s*(?:=\s*)?([-−–]?\s?\d+(?:\.\d+)?)\s*[?!.]*\s*$/;

export function extractClaimedAnswer(message: string): string | null {
  const text = message.replace(MINUS, '-');
  const match = CLAIM_PHRASE.exec(text) ?? BARE_NUMBER.exec(text);
  if (!match) return null;
  const value = match[1].replace(/\s+/g, '');
  return /^-?\d+(\.\d+)?$/.test(value) ? value : null;
}

export function classifyIntent(rawMessage: string): IntentResult {
  const message = rawMessage.replace(MINUS, '-').trim();
  const claimedAnswer = extractClaimedAnswer(message);

  if (claimedAnswer !== null) return { intent: 'CHECK_ANSWER', claimedAnswer };
  if (GIVE_ANSWER.test(message)) return { intent: 'GIVE_ANSWER', claimedAnswer: null };
  if (STILL_CONFUSED.test(message)) return { intent: 'STILL_CONFUSED', claimedAnswer: null };
  if (DONT_UNDERSTAND.test(message)) return { intent: 'DONT_UNDERSTAND', claimedAnswer: null };
  if (UNDERSTOOD.test(message)) return { intent: 'UNDERSTOOD', claimedAnswer: null };
  if (ANOTHER_EXAMPLE.test(message)) return { intent: 'ANOTHER_EXAMPLE', claimedAnswer: null };
  if (WHY.test(message)) return { intent: 'WHY', claimedAnswer: null };
  if (HINT.test(message)) return { intent: 'HINT', claimedAnswer: null };
  return { intent: 'OTHER', claimedAnswer: null };
}
