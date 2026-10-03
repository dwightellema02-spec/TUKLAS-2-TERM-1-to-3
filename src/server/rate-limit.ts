import { RateLimitError } from '../lib/errors';

// One RateLimitError class for the whole app. It is an AppError (status 429), so every
// route using createApiHandler answers 429 instead of a generic 500.
export { RateLimitError };

const WINDOW_MS = 60_000;
const SWEEP_THRESHOLD = 5_000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(key: string, limit: number) {
  const now = Date.now();

  // Keep memory bounded: attackers can mint unlimited distinct keys.
  if (requestCounts.size > SWEEP_THRESHOLD) {
    for (const [existingKey, entry] of requestCounts) {
      if (entry.resetAt <= now) requestCounts.delete(existingKey);
    }
  }

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

/** Test helper: forget all in-memory counters. */
export function resetRateLimits() {
  requestCounts.clear();
}

const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Returns the client address as seen by the nearest TRUSTED proxy.
 *
 * Each proxy appends the address it received the request from to X-Forwarded-For, so
 * entries to the LEFT of the trusted proxies are whatever the client chose to send and
 * must be ignored. TRUSTED_PROXY_HOPS is the number of proxies you control in front of
 * the app (default 1, e.g. Vercel or a single nginx). If fewer entries than hops are
 * present, or the value is not an IP address, the address is "unknown".
 */
export function getRequestAddress(request: Request) {
  const header = request.headers.get('x-forwarded-for');
  if (!header) return 'unknown';

  const configured = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10);
  const hops = Number.isInteger(configured) && configured >= 1 ? configured : 1;

  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length < hops) return 'unknown';

  const candidate = entries[entries.length - hops];
  return IP_PATTERN.test(candidate) ? candidate : 'unknown';
}

/** Consecutive failed password attempts before an account is temporarily locked. */
export const MAX_FAILED_LOGINS = 5;
/** How long a locked account refuses all password attempts. */
export const LOCKOUT_MS = 15 * 60_000;
