/**
 * Tuklas 2.0 — Centralized Server Configuration & Validation
 *
 * Validates and exposes server environment variables safely.
 * CRITICAL SECURITY RULE: Never print or leak secret values in error messages or logs.
 */

import { resolveProviderName } from '../server/ai-providers';
import type { AiProviderName } from '../server/ai-providers';

export class ConfigurationError extends Error {
  readonly missingVariables: string[];

  constructor(message: string, missingVariables: string[] = []) {
    super(message);
    this.name = 'ConfigurationError';
    this.missingVariables = missingVariables;
  }
}

export type ServerConfig = {
  databaseUrl: string;
  authSecret: string;
  anthropicApiKey: string | null;
  anthropicModel: string;
  /** Which AI backend serves tutor/generation requests. */
  aiProvider: AiProviderName;
  geminiApiKey: string | null;
  /** No default on purpose: a Gemini model name must be chosen and verified by the operator. */
  geminiModel: string | null;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appUrl: string;
  allowDemoSeed: boolean;
};

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const TEST_AUTH_SECRET_FALLBACK = 'test-only-session-secret-0123456789-32chars';

/**
 * Validates environment variables and returns a frozen, type-safe configuration object.
 * Throws a clean ConfigurationError if required settings are missing.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): ServerConfig {
  const nodeEnv = (env.NODE_ENV as 'development' | 'test' | 'production') || 'development';
  const missing: string[] = [];

  // 1. DATABASE_URL
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl && nodeEnv !== 'test') {
    missing.push('DATABASE_URL');
  }

  // 2. AUTH_SECRET (Must be at least 32 characters long)
  let authSecret = env.AUTH_SECRET?.trim() || '';
  if (nodeEnv === 'test' && authSecret.length < 32) {
    authSecret = TEST_AUTH_SECRET_FALLBACK;
  } else if (!authSecret || authSecret.length < 32) {
    missing.push('AUTH_SECRET (must be at least 32 characters)');
  }

  // 3. AI_PROVIDER (must be a known provider; blank means "anthropic")
  const aiProvider = resolveProviderName(env.AI_PROVIDER);
  if (!aiProvider) {
    missing.push('AI_PROVIDER (must be "anthropic" or "gemini")');
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Server configuration error: Missing or invalid required environment variable(s): ${missing.join(', ')}. ` +
        `Verify your .env or platform configuration.`,
      missing,
    );
  }

  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim() || null;
  const anthropicModel = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || null;
  const geminiModel = env.GEMINI_MODEL?.trim() || null;
  const port = parseInt(env.PORT || '3000', 10);
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || `http://localhost:${isNaN(port) ? 3000 : port}`;
  const allowDemoSeed = env.ALLOW_DEMO_SEED === 'true';

  return Object.freeze({
    databaseUrl: databaseUrl || '',
    authSecret,
    anthropicApiKey,
    anthropicModel,
    aiProvider: aiProvider ?? 'anthropic',
    geminiApiKey,
    geminiModel,
    nodeEnv,
    port: isNaN(port) ? 3000 : port,
    appUrl,
    allowDemoSeed,
  });
}

let cachedConfig: ServerConfig | null = null;

/**
 * Retrieves the validated server configuration.
 * Memoizes configuration after first successful validation.
 */
export function getServerConfig(): ServerConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

/**
 * Resets cached configuration (primarily for test isolation).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

export function isProduction(): boolean {
  return getServerConfig().nodeEnv === 'production';
}

export function isTest(): boolean {
  return getServerConfig().nodeEnv === 'test';
}

export function isDevelopment(): boolean {
  return getServerConfig().nodeEnv === 'development';
}

export function hasAiConfigured(): boolean {
  const config = getServerConfig();
  return config.aiProvider === 'gemini'
    ? Boolean(config.geminiApiKey && config.geminiModel)
    : Boolean(config.anthropicApiKey);
}
