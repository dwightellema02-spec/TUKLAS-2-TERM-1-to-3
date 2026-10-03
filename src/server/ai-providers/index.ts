import { AiServiceError } from '../ai-errors';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import type { AiProvider, AiProviderName } from './types';

export type { AiProvider, AiProviderName, AiCompletionInput } from './types';

export const AI_PROVIDER_NAMES: readonly AiProviderName[] = ['anthropic', 'gemini'];

const providers: Record<AiProviderName, AiProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/** Reads AI_PROVIDER ("anthropic" by default). An unknown value is a configuration error. */
export function resolveProviderName(value: string | undefined): AiProviderName | null {
  const name = (value?.trim().toLowerCase() || 'anthropic') as AiProviderName;
  return AI_PROVIDER_NAMES.includes(name) ? name : null;
}

export function getAiProvider(): AiProvider {
  const name = resolveProviderName(process.env.AI_PROVIDER);
  if (!name) {
    // Never echo the configured value back to API clients.
    throw new AiServiceError('AI service is not configured.', 503);
  }
  return providers[name];
}
