import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './db';

export const SESSION_COOKIE_NAME = 'tuklas_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
function getAuthSecret() {
  const configuredSecret = process.env.AUTH_SECRET ?? '';
  const secret =
    process.env.NODE_ENV === 'test' && configuredSecret.length < 32
      ? 'test-only-session-secret-0123456789'
      : configuredSecret;
  if (secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be configured with at least 32 characters.',
    );
  }
  return secret;
}

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
};

export type SessionPayload = {
  sub: string;
  sid: string;
  exp: number;
};

export function toPublicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function jsonSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      error: null,
    },
    { status },
  );
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: message,
    },
    { status },
  );
}

export {
  hashPassword,
  verifyPassword,
  passwordHashNeedsUpgrade,
  validatePasswordPolicy,
} from '../lib/auth/password';

function base64UrlEncode(value: Buffer) {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

function signSessionPayload(payload: SessionPayload) {
  const header = base64UrlEncode(
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'session' })),
  );
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = createHmac('sha256', getAuthSecret())
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${signingInput}.${signature}`;
}

function verifySessionSignature(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = createHmac('sha256', getAuthSecret())
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signaturePart);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const decodedHeader = JSON.parse(
      base64UrlDecode(headerPart).toString('utf8'),
    ) as { alg?: string; typ?: string };
    const decodedPayload = JSON.parse(
      base64UrlDecode(payloadPart).toString('utf8'),
    ) as Partial<SessionPayload>;
    if (
      decodedHeader.alg !== 'HS256' ||
      decodedHeader.typ !== 'session' ||
      typeof decodedPayload.sub !== 'string' ||
      typeof decodedPayload.sid !== 'string' ||
      typeof decodedPayload.exp !== 'number' ||
      decodedPayload.exp <= Date.now()
    ) {
      return null;
    }
    return decodedPayload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  user: PublicUser,
  sessionStore = db.authSession,
) {
  const sid = randomUUID();
  const sessionPayload: SessionPayload = {
    sub: user.id,
    sid,
    exp: Date.now() + SESSION_DURATION_MS,
  };

  await sessionStore.create({
    data: {
      id: sid,
      userId: user.id,
      expiresAt: new Date(sessionPayload.exp),
    },
  });

  return signSessionPayload(sessionPayload);
}

export async function getSessionFromRequest(
  request: Request,
): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((entry) => entry.trim());
  const sessionCookie = cookies.find((entry) =>
    entry.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  if (!sessionCookie) return null;

  try {
    const token = decodeURIComponent(
      sessionCookie.slice(SESSION_COOKIE_NAME.length + 1),
    );
    const payload = verifySessionSignature(token);
    if (!payload) return null;

    const session = await db.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      !session.user ||
      !session.user.isActive ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Validates a raw cookie value and returns the authenticated PublicUser if active.
 */
export async function getUserFromCookieValue(cookieValue: string): Promise<PublicUser | null> {
  try {
    const token = decodeURIComponent(cookieValue);
    const payload = verifySessionSignature(token);
    if (!payload) return null;

    const session = await db.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      !session.user ||
      !session.user.isActive ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return toPublicUser(session.user);
  } catch {
    return null;
  }
}

/**
 * Purges expired sessions from the database.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.authSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

export async function revokeSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return;

  const sessionCookie = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return;

  let payload: SessionPayload | null;
  try {
    const token = decodeURIComponent(
      sessionCookie.slice(SESSION_COOKIE_NAME.length + 1),
    );
    payload = verifySessionSignature(token);
  } catch {
    return;
  }
  if (!payload) return;

  await db.authSession.deleteMany({
    where: { id: payload.sid, userId: payload.sub },
  });
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function requireSession(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return null;
  }

  return session;
}
