import { describe, expect, it } from 'vitest';
import { ConfigurationError, validateEnv } from '../src/config/env';

describe('Configuration & Environment Validation', () => {
  it('validates a complete environment configuration successfully', () => {
    const validEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/tuklas',
      AUTH_SECRET: 'test-secret-at-least-32-characters-long-12345',
      ANTHROPIC_API_KEY: 'test-api-key',
      ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
      PORT: '3000',
    };

    const config = validateEnv(validEnv);
    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toBe('postgresql://user:pass@localhost:5432/tuklas');
    expect(config.anthropicApiKey).toBe('test-api-key');
    expect(config.port).toBe(3000);
    expect(config.allowDemoSeed).toBe(false);
  });

  it('throws ConfigurationError when DATABASE_URL is missing in production', () => {
    const invalidEnv = {
      NODE_ENV: 'production',
      AUTH_SECRET: 'test-secret-at-least-32-characters-long-12345',
    };

    expect(() => validateEnv(invalidEnv)).toThrow(ConfigurationError);
    try {
      validateEnv(invalidEnv);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).missingVariables).toContain('DATABASE_URL');
      // CRITICAL SECURITY CHECK: Ensure error message does not expose secrets
      expect((error as Error).message).not.toContain('test-secret');
    }
  });

  it('throws ConfigurationError when AUTH_SECRET is less than 32 characters in production', () => {
    const shortSecretEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost:5432/tuklas',
      AUTH_SECRET: 'too-short',
    };

    expect(() => validateEnv(shortSecretEnv)).toThrow(ConfigurationError);
  });

  it('allows optional Anthropic API key and defaults model gracefully', () => {
    const noAiEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/tuklas',
      AUTH_SECRET: 'test-secret-at-least-32-characters-long-12345',
    };

    const config = validateEnv(noAiEnv);
    expect(config.anthropicApiKey).toBeNull();
    expect(config.anthropicModel).toBe('claude-haiku-4-5-20251001');
  });
});
