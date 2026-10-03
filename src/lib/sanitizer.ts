/**
 * Tuklas 2.0 — Educational Content Sanitizer
 *
 * Sanitizes user-provided educational content, stripping dangerous HTML/XSS,
 * malicious scripts, and unsafe schemes, while strictly preserving:
 * - Mathematical expressions (e.g. x + 5 = 12, $2x + 3 = 11$, fractions 3/4)
 * - Safe markdown formatting
 * - Safe structured worked examples
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^>]*>(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^>]*>(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^>]*>(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<applet\b[^>]*>(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi,
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
  /<link\b[^>]*>/gi,
  /<meta\b[^>]*>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /on\w+\s*=\s*[^>\s]+/gi,
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /vbscript\s*:/gi,
];

/**
 * Sanitizes plain or markdown-formatted educational text.
 * Disarms active script payloads while preserving mathematical notation.
 */
export function sanitizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return '';
  }

  let sanitized = String(text);

  // Strip dangerous active script and frame tags
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Escape raw unencoded angle brackets if they resemble HTML tags,
  // but preserve mathematical inequalities (x < 5 or y > 10)
  sanitized = sanitized.replace(/<([a-zA-Z/][^>]*?)>/g, (match, inner) => {
    const tagName = inner.split(/[\s/]/)[0].toLowerCase();
    // Allow safe semantic inline tags if needed: b, i, em, strong, code, sup, sub, span
    const allowedTags = ['b', 'i', 'em', 'strong', 'code', 'sup', 'sub', 'span', 'p', 'br', 'ul', 'ol', 'li'];
    if (allowedTags.includes(tagName)) {
      // Strip any attributes except safe ones
      return `<${tagName}>`;
    }
    return `&lt;${inner}&gt;`;
  });

  return sanitized.trim();
}

/**
 * Validates and sanitizes URLs (sources, external links).
 * Strictly forbids javascript:, data:, and relative protocol-less vectors.
 */
export function sanitizeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface SanitizedWorkedExample {
  problem: string;
  steps: Array<{
    step: number;
    action: string;
    explanation: string;
  }>;
  finalAnswer: string;
}

/**
 * Validates and sanitizes a structured worked example.
 */
export function sanitizeWorkedExample(data: unknown): SanitizedWorkedExample | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const obj = data as Record<string, unknown>;
  const problem = sanitizeText(typeof obj.problem === 'string' ? obj.problem : '');
  const finalAnswer = sanitizeText(typeof obj.finalAnswer === 'string' ? obj.finalAnswer : '');

  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps: Array<{ step: number; action: string; explanation: string }> = [];

  for (let i = 0; i < rawSteps.length; i++) {
    const item = rawSteps[i];
    if (item && typeof item === 'object') {
      const stepObj = item as Record<string, unknown>;
      steps.push({
        step: i + 1,
        action: sanitizeText(typeof stepObj.action === 'string' ? stepObj.action : `Step ${i + 1}`),
        explanation: sanitizeText(typeof stepObj.explanation === 'string' ? stepObj.explanation : ''),
      });
    }
  }

  if (!problem && steps.length === 0 && !finalAnswer) {
    return null;
  }

  return {
    problem,
    steps,
    finalAnswer,
  };
}
