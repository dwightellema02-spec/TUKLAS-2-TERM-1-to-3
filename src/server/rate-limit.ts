const WINDOW_MS = 60_000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export class RateLimitError extends Error {
  constructor() {
    super('Too many requests. Please try again shortly.');
    this.name = 'RateLimitError';
  }
}

export function enforceRateLimit(key: string, limit: number) {
  const now = Date.now();
  const current = requestCounts.get(key);

  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  if (current.count >= limit) {
    throw new RateLimitError();
  }

  current.count += 1;
}

export function getRequestAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}