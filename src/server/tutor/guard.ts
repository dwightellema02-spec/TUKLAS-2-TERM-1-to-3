/**
 * Tuklas 2.0 — Deterministic checks on every tutor reply (master plan §46 rules 6-9).
 *
 * The model is never the only safeguard. Before a reply reaches a student it must pass:
 *   1. it is plain, non-empty and concise
 *   2. it does not state the final answer while the question is still unanswered
 *   3. it does not claim to have watched, read or opened something it never received
 *   4. it does not echo the tutor's own instructions or delimiters
 * A reply that fails is NOT shown; the caller falls back to an automatic (non-AI) hint.
 */

export type GuardResult = { ok: true } | { ok: false; reason: GuardReason };

export type GuardReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'REVEALS_ANSWER'
  | 'CLAIMS_UNSEEN_CONTENT'
  | 'ECHOES_INSTRUCTIONS'
  | 'GIVES_VERDICT';

export const MAX_REPLY_CHARS = 1_400;

const MINUS = /[−–—]/g;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does `text` state `value` as a standalone number or word?
 *   - "7" matches "= 7" and "is 7." but not "17", "7.5", "−7" or "7th"
 *   - "-7" matches "−7" / "-7" / "- 7" but not "-70"
 *   - words match on word boundaries, case-insensitively
 */
export function statesValue(text: string, rawValue: string): boolean {
  const value = rawValue.replace(MINUS, '-').replace(/\s+/g, '').trim();
  if (!value) return false;
  const haystack = text.replace(MINUS, '-');

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    if (value.startsWith('-')) {
      const digits = escapeRegex(value.slice(1));
      return new RegExp(`(?<![\\d.\\w])-\\s?${digits}(?![\\d]|\\.\\d|[\\w])`).test(haystack);
    }
    const digits = escapeRegex(value);
    // A positive number is "stated" only if it is not part of a larger/negative number.
    return new RegExp(`(?<![\\d.\\-\\w])\\+?${digits}(?![\\d]|\\.\\d|[\\w])`).test(haystack);
  }

  if (value.length < 3) return false; // too short to match as a word without false alarms
  return new RegExp(`\\b${escapeRegex(value)}\\b`, 'i').test(haystack);
}

const UNSEEN_CONTENT = [
  /\bI\s+(have\s+|had\s+|just\s+)?(watched|seen|saw|read|opened|listened\s+to|looked\s+at)\b/i,
  /\b(the|this|that|your)\s+(video|pdf|document|file|attachment|worksheet|handout)\s+(shows|says|states|explains|mentions|covers|demonstrates)\b/i,
  /\b(in|from)\s+(the|this|your)\s+(video|pdf|document|file|attachment)\b/i,
  /\bnapanood\s+ko\b|\bnabasa\s+ko\s+(ang|yung)\b/i,
];

// Saying a proposed answer is right or wrong would turn the tutor into an answer oracle: a
// student could probe values without thinking. Until the answer is submitted, no verdicts.
const VERDICT = [
  /\b(that'?s|that\s+is|this\s+is|you'?re|you\s+are|it'?s|it\s+is|your\s+answer\s+is)\s+(absolutely\s+|totally\s+|completely\s+|not\s+(quite\s+)?)?(correct|right|wrong|incorrect)\b/i,
  /\b(correct|incorrect|wrong)[!.]?\s*$/i,
  /^\s*(yes|no|yep|nope)\b[,!.]/i,
  /\b(well\s+done|spot\s+on|exactly|not\s+quite|you\s+got\s+it|nailed\s+it|that\s+works|that\s+doesn'?t\s+work)\b/i,
];

const INSTRUCTION_ECHO = [/<\/?student_message>/i, /\bBEGIN\s+(LESSON|INSTRUCTIONS|CONTEXT)\b/i, /\bsystem\s+prompt\b/i, /\bhidden\s+instructions?\b/i];

export function checkTutorReply(input: {
  reply: string;
  /** The text of the correct answer (e.g. "7"). Only enforced while the question is unanswered. */
  secretAnswers: string[];
  mayRevealAnswer: boolean;
  /** Forbid right/wrong verdicts (a student proposed an answer to a still-open question). */
  noVerdict?: boolean;
}): GuardResult {
  const reply = input.reply.trim();
  if (reply.length === 0) return { ok: false, reason: 'EMPTY' };
  if (reply.length > MAX_REPLY_CHARS) return { ok: false, reason: 'TOO_LONG' };

  if (!input.mayRevealAnswer && input.secretAnswers.some((answer) => statesValue(reply, answer))) {
    return { ok: false, reason: 'REVEALS_ANSWER' };
  }
  if (input.noVerdict && VERDICT.some((pattern) => pattern.test(reply))) {
    return { ok: false, reason: 'GIVES_VERDICT' };
  }
  if (UNSEEN_CONTENT.some((pattern) => pattern.test(reply))) {
    return { ok: false, reason: 'CLAIMS_UNSEEN_CONTENT' };
  }
  if (INSTRUCTION_ECHO.some((pattern) => pattern.test(reply))) {
    return { ok: false, reason: 'ECHOES_INSTRUCTIONS' };
  }
  return { ok: true };
}
