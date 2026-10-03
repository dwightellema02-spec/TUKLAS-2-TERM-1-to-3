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
  RateLimitError,
} from '../../../../server/rate-limit';
import { AuthAuditLogger } from '../../../../lib/auth/audit';

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
    enforceRateLimit(
      `login:${getRequestAddress(request)}:${normalizedEmail}`,
      10,
    );

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      AuthAuditLogger.log({
        event: 'LOGIN_FAILURE',
        email: normalizedEmail,
        ip: getRequestAddress(request),
        success: false,
        reason: !user ? 'USER_NOT_FOUND' : !user.isActive ? 'ACCOUNT_INACTIVE' : 'INVALID_PASSWORD',
      });
      return jsonError('Invalid email or password.', 401);
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
