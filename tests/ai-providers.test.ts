import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ConfigurationError, validateEnv } from '../src/config/env';
import { AiServiceError, requestAiText } from '../src/server/ai';
import { resolveProviderName } from '../src/server/ai-providers';

const ENV_KEYS = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const SECRET_ANTHROPIC = 'sk-ant-SECRET-VALUE-123';
const SECRET_GEMINI = 'gem-SECRET-VALUE-456';

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const anthropicBody = (text: string) => ({ content: [{ type: 'text', text }] });
const geminiBody = (...parts: string[]) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: parts.map((text) => ({ text })) } }],
});

const call = (schema?: z.ZodType) =>
  requestAiText({ system: 'SYS', user: 'USER', maxTokens: 321, responseSchema: schema });

function useAnthropic() {
  process.env.AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = SECRET_ANTHROPIC;
  delete process.env.ANTHROPIC_MODEL;
}

function useGemini() {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = SECRET_GEMINI;
  process.env.GEMINI_MODEL = 'test-model-name';
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return { status: 200, message: '' };
  } catch (error) {
    if (error instanceof AiServiceError) return { status: error.status, message: error.message };
    throw error;
  }
}

describe('provider selection and configuration', () => {
  it('resolves provider names case-insensitively and defaults to anthropic', () => {
    expect(resolveProviderName(undefined)).toBe('anthropic');
    expect(resolveProviderName('')).toBe('anthropic');
    expect(resolveProviderName('  Gemini ')).toBe('gemini');
    expect(resolveProviderName('ANTHROPIC')).toBe('anthropic');
    expect(resolveProviderName('openai')).toBeNull();
  });

  it('validateEnv rejects an unknown AI_PROVIDER without echoing it', () => {
    const base = {
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret-at-least-32-characters-long-12345',
      AI_PROVIDER: 'definitely-not-a-provider',
    };
    expect(() => validateEnv(base)).toThrow(ConfigurationError);
    try {
      validateEnv(base);
    } catch (error) {
      expect((error as ConfigurationError).missingVariables.join(' ')).toContain('AI_PROVIDER');
      expect((error as Error).message).not.toContain('definitely-not-a-provider');
    }
  });

  it('validateEnv exposes both providers settings, with no assumed Gemini model', () => {
    const config = validateEnv({
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret-at-least-32-characters-long-12345',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
    });
    expect(config.aiProvider).toBe('gemini');
    expect(config.geminiApiKey).toBe('k');
    expect(config.geminiModel).toBeNull();
    expect(validateEnv({ NODE_ENV: 'test', AUTH_SECRET: 'x'.repeat(40) }).aiProvider).toBe('anthropic');
  });

  it('answers 503 and never calls the network for an unknown provider', async () => {
    process.env.AI_PROVIDER = 'mystery-vendor';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await statusOf(call());
    expect(result.status).toBe(503);
    expect(result.message).not.toContain('mystery-vendor');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes to the selected provider endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(anthropicBody('from anthropic')))
      .mockResolvedValueOnce(reply(geminiBody('from gemini')));
    vi.stubGlobal('fetch', fetchMock);

    useAnthropic();
    expect(await call()).toBe('from anthropic');
    useGemini();
    expect(await call()).toBe('from gemini');

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.anthropic.com/v1/messages');
    expect(String(fetchMock.mock.calls[1][0])).toContain('generativelanguage.googleapis.com');
  });
});

describe('anthropic provider', () => {
  beforeEach(useAnthropic);

  it('sends the documented request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(anthropicBody('hello')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await call()).toBe('hello');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe(SECRET_ANTHROPIC);
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 321,
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses ANTHROPIC_MODEL when set', async () => {
    process.env.ANTHROPIC_MODEL = 'custom-model';
    const fetchMock = vi.fn().mockResolvedValue(reply(anthropicBody('x')));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('custom-model');
  });

  it('parses and validates structured output, including fenced JSON', async () => {
    const schema = z.object({ n: z.number() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(anthropicBody('```json\n{"n": 7}\n```'))));
    expect(await call(schema)).toEqual({ n: 7 });
  });

  it.each([
    ['invalid JSON', 'not json at all', 502],
    ['wrong shape', '{"n": "seven"}', 502],
  ])('rejects structured output with %s', async (_label, text, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(anthropicBody(text))));
    expect((await statusOf(call(z.object({ n: z.number() })))).status).toBe(status);
  });

  it('maps upstream failures to honest statuses', async () => {
    const run = async (response: Response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      return (await statusOf(call())).status;
    };
    expect(await run(reply('rate limited', 429))).toBe(429);
    expect(await run(reply('boom', 500))).toBe(502);
    expect(await run(reply('nope', 401))).toBe(502);
    expect(await run(reply({ content: [] }))).toBe(502);
    expect(await run(reply({ content: [{ type: 'text', text: '   ' }] }))).toBe(502);
  });

  it('maps a timeout to 504 and a network failure to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    expect((await statusOf(call())).status).toBe(504);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    expect((await statusOf(call())).status).toBe(502);
  });

  it('answers 503 without calling the network when there is no key', async () => {
    process.env.ANTHROPIC_API_KEY = '   ';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await statusOf(call())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the API key in errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(`error mentioning ${SECRET_ANTHROPIC}`, 500)));
    const { message } = await statusOf(call());
    expect(message).not.toContain(SECRET_ANTHROPIC);
  });
});

describe('gemini provider', () => {
  beforeEach(useGemini);

  it('sends the documented request shape (plain text)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(geminiBody('hello')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await call()).toBe('hello');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test-model-name:generateContent',
    );
    expect(init.headers['x-goog-api-key']).toBe(SECRET_GEMINI);
    expect(String(url)).not.toContain(SECRET_GEMINI); // key travels in a header, never the URL
    const body = JSON.parse(init.body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'USER' }] }]);
    expect(body.generationConfig.maxOutputTokens).toBe(321);
    expect(body.generationConfig).not.toHaveProperty('responseMimeType');
  });

  it('turns on JSON mode only when the caller expects structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(geminiBody('{"n": 3}')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await call(z.object({ n: z.number() }))).toEqual({ n: 3 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.responseMimeType).toBe(
      'application/json',
    );
  });

  it('joins multi-part replies and escapes the model name in the URL', async () => {
    process.env.GEMINI_MODEL = 'weird/model name';
    const fetchMock = vi.fn().mockResolvedValue(reply(geminiBody('Hel', 'lo')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await call()).toBe('Hello');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/weird%2Fmodel%20name:generateContent');
  });

  it('reports blocked or empty answers honestly', async () => {
    const run = async (body: unknown, status = 200) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(body, status)));
      return statusOf(call());
    };
    expect((await run({ promptFeedback: { blockReason: 'SAFETY' } })).status).toBe(502);
    expect((await run({ candidates: [{ finishReason: 'SAFETY' }] })).message).toMatch(/declined/);
    expect((await run({ candidates: [] })).message).toMatch(/empty/);
    expect((await run({})).status).toBe(502);
  });

  it('maps upstream failures, timeouts and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('quota', 429)));
    expect((await statusOf(call())).status).toBe(429);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('boom', 503)));
    expect((await statusOf(call())).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    expect((await statusOf(call())).status).toBe(504);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect((await statusOf(call())).status).toBe(502);
  });

  it('is not configured without BOTH a key and a model, and does not call the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    process.env.GEMINI_MODEL = '';
    expect((await statusOf(call())).status).toBe(503);
    useGemini();
    process.env.GEMINI_API_KEY = '';
    expect((await statusOf(call())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks the API key in errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(`bad key ${SECRET_GEMINI}`, 400)));
    const { message } = await statusOf(call());
    expect(message).not.toContain(SECRET_GEMINI);
  });
});
