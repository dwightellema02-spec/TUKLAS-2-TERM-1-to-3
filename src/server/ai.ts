import { z } from 'zod';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const REQUEST_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export class AiServiceError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
  }
}

export function enforceAiRateLimit(key: string, limit = 10) {
  const now = Date.now();
  const current = requestCounts.get(key);

  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }

  if (current.count >= limit) {
    throw new AiServiceError(
      'Too many AI requests. Please try again shortly.',
      429,
    );
  }

  current.count += 1;
}

function parseJsonText(text: string) {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    throw new AiServiceError(
      'The AI returned an invalid structured response.',
      502,
    );
  }
}

export async function requestAiText<T = string>(input: {
  system: string;
  user: string;
  maxTokens: number;
  responseSchema?: z.ZodType<T>;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiServiceError('AI service is not configured.', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiServiceError(
        'The AI service rejected the request.',
        response.status === 429 ? 429 : 502,
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content
      ?.find((item) => item.type === 'text')
      ?.text?.trim();
    if (!text) {
      throw new AiServiceError('The AI returned an empty response.', 502);
    }

    if (!input.responseSchema) {
      return text as T;
    }

    const parsed = input.responseSchema.safeParse(parseJsonText(text));
    if (!parsed.success) {
      throw new AiServiceError(
        'The AI returned a response with an unexpected shape.',
        502,
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof AiServiceError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiServiceError(
        'The AI service timed out. Please try again.',
        504,
      );
    }

    throw new AiServiceError('The AI service is temporarily unavailable.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function aiErrorResponse(
  error: unknown,
  jsonError: (message: string, status?: number) => Response,
) {
  if (error instanceof AiServiceError) {
    return jsonError(error.message, error.status);
  }

  return jsonError('Unable to process the AI request at this time.', 502);
}
