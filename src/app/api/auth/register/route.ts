import { z } from 'zod';
import { db } from '../../../../server/db';
import {
  createSessionToken,
  hashPassword,
  jsonError,
  jsonSuccess,
  setSessionCookie,
  toPublicUser,
} from '../../../../server/auth';
import {
  enforceRateLimit,
  getRequestAddress,
  RateLimitError,
} from '../../../../server/rate-limit';
import { AuthAuditLogger } from '../../../../lib/auth/audit';

const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128, 'Password is too long.')
    .refine(
      (value) =>
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /\d/.test(value),
      'Password must include uppercase, lowercase, and a number.',
    ),
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters.')
    .max(80, 'Display name is too long.'),
  role: z.enum(['STUDENT', 'TEACHER']).default('STUDENT'),
  inviteCode: z.string().trim().optional(),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return jsonError('Invalid registration input.', 400);
    }
    const parsed = registerSchema.safeParse(json);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid registration input.',
        400,
      );
    }

    const { email, password, displayName, role, inviteCode } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    enforceRateLimit(`register:${getRequestAddress(request)}`, 20);

    // School security: Teacher registration requires a valid invitation code in production/public mode
    if (role === 'TEACHER' && process.env.NODE_ENV !== 'test') {
      const validCode = process.env.TEACHER_INVITE_CODE || 'TUKLAS-TEACHER-DEMO';
      if (!inviteCode || inviteCode !== validCode) {
        AuthAuditLogger.log({
          event: 'PRIVILEGE_ESCALATION_BLOCKED',
          email: normalizedEmail,
          role: 'TEACHER',
          ip: getRequestAddress(request),
          success: false,
          reason: 'INVALID_TEACHER_INVITE_CODE',
        });
        return jsonError(
          'A valid teacher invitation code is required to register a teacher account.',
          403,
        );
      }
    }

    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return jsonError('A user with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(password);
    const { createdUser, sessionToken } = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName,
          role,
          isActive: true,
          ...(role === 'STUDENT'
            ? { studentProfile: { create: {} } }
            : { teacherProfile: { create: {} } }),
        },
      });
      const sessionToken = await createSessionToken(
        toPublicUser(createdUser),
        tx.authSession,
      );
      return { createdUser, sessionToken };
    });

    AuthAuditLogger.log({
      event: 'REGISTRATION_ATTEMPT',
      userId: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      ip: getRequestAddress(request),
      success: true,
    });

    const response = jsonSuccess(
      {
        user: toPublicUser(createdUser),
      },
      201,
    );

    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) return jsonError(error.message, 429);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return jsonError('A user with this email already exists.', 409);
    }
    if (error instanceof Error && error.message.includes('AUTH_SECRET'))
      return jsonError('Authentication is not configured.', 503);
    return jsonError('Unable to register user at this time.', 500);
  }
}
