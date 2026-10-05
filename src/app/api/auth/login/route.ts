import { z } from 'zod';
import { db } from '../../../../server/db';
import {
  createSessionToken,
  jsonError,
  jsonSuccess,
  hashPassword,
  passwordHashNeedsUpgrade,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from '../../../../server/auth';
import {
  enforceRateLimit,
  getRequestAddress,
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  RateLimitError,
} from '../../../../server/rate-limit';
import { AuthAuditLogger } from '../../../../lib/auth/audit';

/** A real hash of a random secret, made once per process: the work done for accounts that do not exist. */
let decoy: Promise<string> | null = null;
const decoyHash = () => (decoy ??= hashPassword(`decoy-${Math.random().toString(36).slice(2)}-${Date.now()}`));

/**
 * Failed attempts for emails that have no account. Without this an existing account locks after repeated failures
 * (HTTP 429) while a made-up email keeps answering 401, which tells an attacker which accounts exist. Best effort and
 * per process; the real accounts' lock is stored in the database.
 */
const unknownFailures = new Map<string, { count: number; lockedUntil: number }>();
function unknownLocked(email: string): boolean {
  const entry = unknownFailures.get(email);
  return Boolean(entry && entry.lockedUntil > Date.now());
}
function noteUnknownFailure(email: string) {
  const now = Date.now();
  if (unknownFailures.size > 5_000) {
    for (const [key, entry] of unknownFailures) if (entry.lockedUntil <= now && entry.count === 0) unknownFailures.delete(key);
  }
  const entry = unknownFailures.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_LOGINS) {
    entry.count = 0;
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  unknownFailures.set(email, entry);
}

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return jsonError('Invalid login input.', 400);
    }
    const parsed = loginSchema.safeParse(json);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid login input.',
        400,
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const ip = getRequestAddress(request);
    // Two independent limits. The address comes from the trusted proxy position (see
    // getRequestAddress), and the per-account limit does not depend on any header at
    // all, so rotating X-Forwarded-For cannot multiply an attacker's guesses.
    enforceRateLimit(`login-ip:${ip}`, 60);
    enforceRateLimit(`login-account:${normalizedEmail}`, 20);

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    // A locked account refuses every password attempt (even a correct one) until the
    // lock expires, so the lock cannot be used as a password oracle.
    if ((user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) || (!user && unknownLocked(normalizedEmail))) {
      AuthAuditLogger.log({
        event: 'LOGIN_FAILURE',
        email: normalizedEmail,
        ip,
        success: false,
        reason: 'ACCOUNT_LOCKED',
      });
      return jsonError('Too many failed attempts. Please try again later.', 429);
    }

    // Always do one password derivation, even for an unknown or inactive account, so the response time
    // does not reveal whether an account exists.
    const passwordOk =
      !!user && user.isActive
        ? await verifyPassword(password, user.passwordHash)
        : (await verifyPassword(password, await decoyHash()), false);

    if (!user || !passwordOk) {
      if (!user) noteUnknownFailure(normalizedEmail);
      if (user && user.isActive) {
        const updated = await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: { increment: 1 } },
          select: { failedLoginCount: true },
        });
        if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
          await db.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS), failedLoginCount: 0 },
          });
        }
      }
      AuthAuditLogger.log({
        event: 'LOGIN_FAILURE',
        email: normalizedEmail,
        ip: getRequestAddress(request),
        success: false,
        reason: !user ? 'USER_NOT_FOUND' : !user.isActive ? 'ACCOUNT_INACTIVE' : 'INVALID_PASSWORD',
      });
      return jsonError('Invalid email or password.', 401);
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    if (passwordHashNeedsUpgrade(user.passwordHash)) {
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }

    AuthAuditLogger.log({
      event: 'LOGIN_SUCCESS',
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: getRequestAddress(request),
      success: true,
    });

    const response = jsonSuccess({
      user: toPublicUser(user),
    });

    setSessionCookie(response, await createSessionToken(toPublicUser(user)));
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) return jsonError(error.message, 429);
    if (error instanceof Error && error.message.includes('AUTH_SECRET'))
      return jsonError('Authentication is not configured.', 503);
    return jsonError('Unable to log in at this time.', 500);
  }
}
