import { AiServiceError } from '../ai-errors';
import type { AiProvider } from './types';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Google Gemini via the REST `generateContent` endpoint.
 *
 * There is intentionally NO default model: GEMINI_MODEL must be set, so Tuklas never
 * claims to use a model name nobody has verified against a live key.
 */
export const geminiProvider: AiProvider = {
  name: 'gemini',

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_MODEL?.trim());
  },

  async complete({ system, user, maxTokens, json, signal, onUsage }) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim();
    if (!apiKey || !model) throw new AiServiceError('AI service is not configured.', 503);

    const response = await fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw new AiServiceError(
        'The AI service rejected the request.',
        response.status === 429 ? 429 : 502,
        response.status >= 500,
      );
    }

    const payload = (await response.json()) as {
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    onUsage?.({ model, inputTokens: payload.usageMetadata?.promptTokenCount ?? null, outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null });

    if (payload.promptFeedback?.blockReason) {
      throw new AiServiceError('The AI declined to answer this request.', 502);
    }

    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) {
      throw new AiServiceError(
        candidate?.finishReason === 'SAFETY'
          ? 'The AI declined to answer this request.'
          : 'The AI returned an empty response.',
        502,
      );
    }
    return text;
  },
};
