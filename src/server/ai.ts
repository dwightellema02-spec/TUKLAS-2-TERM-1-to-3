import { z } from 'zod';
import { AiServiceError } from './ai-errors';
import { getAiProvider } from './ai-providers';
import type { AiUsage } from './ai-providers/types';

export { AiServiceError } from './ai-errors';

const REQUEST_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

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

/**
 * Sends one request to the configured AI provider (AI_PROVIDER = anthropic | gemini).
 *
 * Shared here for every provider: the timeout/abort, JSON extraction, schema validation
 * and the mapping of failures to honest HTTP errors. When the provider is not
 * configured the caller gets a 503 — there is never a made-up reply.
 */
/** One quick second try for a provider outage or a dropped connection; never for 4xx, 429 or a timeout. */
const RETRY_DELAY_MS = 300;

export async function requestAiText<T = string>(input: {
  system: string;
  user: string;
  maxTokens: number;
  responseSchema?: z.ZodType<T>;
  /** Receives the provider's reported token usage and model id (for cost and audit records). */
  onUsage?: (usage: AiUsage) => void;
}): Promise<T> {
  const provider = getAiProvider();
  if (!provider.isConfigured()) {
    throw new AiServiceError('AI service is not configured.', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const attempt = () =>
      provider.complete({
        system: input.system,
        user: input.user,
        maxTokens: input.maxTokens,
        json: Boolean(input.responseSchema),
        signal: controller.signal,
        onUsage: input.onUsage,
      });
    let text: string;
    try {
      text = await attempt();
    } catch (first) {
      const dropped = first instanceof TypeError; // fetch() rejects with a TypeError when the connection fails
      const retryable = (first instanceof AiServiceError && first.retryable) || dropped;
      if (!retryable || controller.signal.aborted) throw first;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      text = await attempt();
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
