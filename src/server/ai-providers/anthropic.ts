import { AiServiceError } from '../ai-errors';
import type { AiProvider } from './types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Operator-set base URL (proxies, tests). The API key is only ever sent to this host. */
const messagesUrl = () =>
  `${(process.env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/messages`;

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const anthropicProvider: AiProvider = {
  name: 'anthropic',

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  },

  async complete({ system, user, maxTokens, signal, onUsage }) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new AiServiceError('AI service is not configured.', 503);

    const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
    const response = await fetch(messagesUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal,
    });

    if (!response.ok) {
      throw new AiServiceError(
        'The AI service rejected the request.',
        response.status === 429 ? 429 : 502,
        response.status >= 500, // a provider outage may pass on a second try; a 4xx will not
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    onUsage?.({ model, inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null });
    const text = payload.content?.find((item) => item.type === 'text')?.text?.trim();
    if (!text) throw new AiServiceError('The AI returned an empty response.', 502);
    return text;
  },
};
