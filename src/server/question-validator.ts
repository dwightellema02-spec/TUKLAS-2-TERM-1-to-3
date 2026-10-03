/**
 * Tuklas 2.0 — Deterministic validation of AI-generated multiple-choice questions.
 *
 * The AI is never the sole authority for correctness (master plan §11, §46 Rule 9).
 * Every generated question must pass these checks before it is stored or shown:
 *   - four distinct, non-empty options and a valid correct index
 *   - not a duplicate of a prior question
 *   - the answer is not given away in the question text
 *   - when the question is a plain arithmetic expression, the marked answer must
 *     equal the computed value and exactly one option may equal it
 *
 * Questions that cannot be verified mechanically (e.g. word problems) are accepted
 * only if all structural checks pass, and are reported with `mathVerified: false`.
 */

export type GeneratedQuestionInput = {
  question: string;
  options: string[];
  correctIndex: number;
};

export type QuestionValidationResult = {
  ok: boolean;
  errors: string[];
  /** true only when the answer was recomputed deterministically */
  mathVerified: boolean;
};

const MAX_EXPRESSION_LENGTH = 120;
const MAX_DEPTH = 20;

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[^\p{L}\p{N}+\-*/=().]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates a plain arithmetic expression (+ - × ÷ * / parentheses, decimals,
 * unary minus). Returns null for anything else. Never uses eval().
 */
export function evaluateArithmetic(input: string): number | null {
  const text = input
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');
  if (!text || text.length > MAX_EXPRESSION_LENGTH) return null;
  if (!/^[0-9+\-*/().]+$/.test(text)) return null;

  let pos = 0;
  let failed = false;

  const peek = () => text[pos];

  function parseExpression(depth: number): number {
    if (depth > MAX_DEPTH) {
      failed = true;
      return 0;
    }
    let value = parseTerm(depth);
    while (!failed && (peek() === '+' || peek() === '-')) {
      const op = text[pos++];
      const right = parseTerm(depth);
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(depth: number): number {
    let value = parseFactor(depth);
    while (!failed && (peek() === '*' || peek() === '/')) {
      const op = text[pos++];
      const right = parseFactor(depth);
      if (op === '/') {
        if (right === 0) {
          failed = true;
          return 0;
        }
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  }

  function parseFactor(depth: number): number {
    const ch = peek();
    if (ch === '-' || ch === '+') {
      pos += 1;
      const value = parseFactor(depth + 1);
      return ch === '-' ? -value : value;
    }
    if (ch === '(') {
      pos += 1;
      const value = parseExpression(depth + 1);
      if (peek() !== ')') {
        failed = true;
        return 0;
      }
      pos += 1;
      return value;
    }
    const match = /^\d+(?:\.\d+)?/.exec(text.slice(pos));
    if (!match) {
      failed = true;
      return 0;
    }
    pos += match[0].length;
    return Number(match[0]);
  }

  const result = parseExpression(0);
  if (failed || pos !== text.length || !Number.isFinite(result)) return null;
  return result;
}

/** Parses an option such as "7", "-5", "−5", "+3", "2.50" as a number, else null. */
export function parseNumericOption(option: string): number | null {
  const text = option.replace(/[−–—]/g, '-').trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const EXPRESSION_QUESTION =
  /(?:what\s+is|evaluate|compute|calculate|find|simplify)\s*:?\s*(?:the\s+(?:value|sum|difference|product|quotient)\s+of\s+)?([-+−–—\d().\s×÷*/]+?)\s*\??\s*$/i;

/** Extracts a plain arithmetic expression from "What is 7 − (−3)?"-style questions. */
export function extractExpression(question: string): string | null {
  const match = EXPRESSION_QUESTION.exec(question.trim());
  if (!match) return null;
  // A sentence-ending period is punctuation, not a decimal point.
  const expression = match[1].trim().replace(/\.+$/, '').trim();
  // Require a real operation (a lone number or a bare date-like token is not a problem to check).
  if (!/[\d)]\s*[-+−–—*/×÷]\s*[\d(\-+−]/.test(expression)) return null;
  return expression;
}

const ANSWER_GIVEAWAY = /\b(?:the\s+)?(?:correct\s+)?answer\s*(?:is|are|:|=)\b/i;

export function validateGeneratedQuestion(
  input: GeneratedQuestionInput,
  context: { priorQuestions?: string[] } = {},
): QuestionValidationResult {
  const errors: string[] = [];
  let mathVerified = false;

  const question = input.question.trim();
  const options = input.options.map((option) => option.trim());

  if (question.length < 5) errors.push('Question text is too short.');
  if (options.length !== 4) errors.push('A question must have exactly four options.');
  if (options.some((option) => option.length === 0)) errors.push('Options must not be empty.');

  const normalizedOptions = options.map(normalizeText);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    errors.push('Options must be distinct.');
  }

  if (
    !Number.isInteger(input.correctIndex) ||
    input.correctIndex < 0 ||
    input.correctIndex >= options.length
  ) {
    errors.push('correctIndex does not reference an option.');
    return { ok: false, errors, mathVerified };
  }

  const normalizedQuestion = normalizeText(question);
  const prior = (context.priorQuestions ?? []).map(normalizeText);
  if (prior.includes(normalizedQuestion)) {
    errors.push('Question duplicates a previous question.');
  }

  const correctOption = options[input.correctIndex];
  if (ANSWER_GIVEAWAY.test(question)) {
    errors.push('Question text states the answer.');
  }
  const normalizedCorrect = normalizedOptions[input.correctIndex];
  if (normalizedCorrect.length >= 5 && normalizedQuestion.includes(normalizedCorrect)) {
    errors.push('Question text contains the correct option.');
  }

  const expression = extractExpression(question);
  if (expression) {
    const expected = evaluateArithmetic(expression);
    if (expected !== null) {
      const numeric = options.map(parseNumericOption);
      if (numeric.some((value) => value === null)) {
        errors.push('Arithmetic question must have numeric options.');
      } else {
        const matches = numeric
          .map((value, index) => (Math.abs((value as number) - expected) < 1e-9 ? index : -1))
          .filter((index) => index >= 0);
        if (matches.length === 0) {
          errors.push(`No option equals the computed value ${expected}.`);
        } else if (matches.length > 1) {
          errors.push('More than one option equals the computed value.');
        } else if (matches[0] !== input.correctIndex) {
          errors.push(
            `Marked answer "${correctOption}" is wrong; computed value is ${expected}.`,
          );
        } else {
          mathVerified = true;
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, mathVerified: mathVerified && errors.length === 0 };
}
