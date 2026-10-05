export type AiProviderName = 'anthropic' | 'gemini';

export type AiCompletionInput = {
  system: string;
  user: string;
  maxTokens: number;
  /** True when the caller will parse the reply as JSON (providers may enable JSON mode). */
  json: boolean;
  signal: AbortSignal;
  /** Called once with the usage the provider reports (token counts), when it reports any. */
  onUsage?: (usage: AiUsage) => void;
};

export type AiUsage = { model: string | null; inputTokens: number | null; outputTokens: number | null };

/**
 * A text-generation backend. Providers only translate between Tuklas' request shape and
 * a vendor API; timeouts, JSON parsing, schema validation, rate limits and error
 * mapping to HTTP statuses are shared in `requestAiText`.
 */
export type AiProvider = {
  readonly name: AiProviderName;
  /** True when every credential/setting this provider needs is present. */
  isConfigured(): boolean;
  /** Returns the model's text reply, or throws AiServiceError. */
  complete(input: AiCompletionInput): Promise<string>;
};
