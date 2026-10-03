import { pbkdf2Sync, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { GET as getSession } from '../src/app/api/auth/session/route';
import { GET as getProtected } from '../src/app/api/auth/protected/route';
import {
  GET as getProfile,
  PATCH as updateProfile,
} from '../src/app/api/profile/route';

const emailFor = (suffix: string) =>
  `auth-test-${suffix}-${randomUUID()}@example.com`;

afterEach(async () => {
  await db.user.deleteMany({
    where: { email: { contains: 'auth-test-' } },
  });
});

describe('auth api', () => {
  it('registers a new user', async () => {
    const email = emailFor('register');
    const response = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Test User',
          role: 'STUDENT',
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.user.email).toBe(email);
    expect(payload.data.user).not.toHaveProperty('passwordHash');
    expect(payload.data.user).not.toHaveProperty('password');
    expect(response.headers.get('set-cookie')).toContain('tuklas_session=');
  });

  it('rejects duplicate registration', async () => {
    const email = emailFor('duplicate');
    await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'First User',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'AnotherPass123!',
          displayName: 'Second User',
          role: 'TEACHER',
        }),
      }),
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('A user with this email already exists.');
  });

  it('logs in an existing user', async () => {
    const email = emailFor('login');
    await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Login User',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.user.email).toBe(email);
    expect(response.headers.get('set-cookie')).toContain('tuklas_session=');
  });

  it('upgrades a legacy password hash after a successful login', async () => {
    const email = emailFor('legacy-password');
    const password = 'StrongPass123!';
    await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: 'Legacy Account',
          role: 'STUDENT',
        }),
      }),
    );
    const salt = 'legacy-test-salt';
    const legacyHash = pbkdf2Sync(
      password,
      salt,
      100_000,
      64,
      'sha512',
    ).toString('hex');
    await db.user.update({
      where: { email },
      data: { passwordHash: `${salt}:${legacyHash}` },
    });

    const response = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );

    expect(response.status).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { email } })).passwordHash,
    ).toMatch(/^pbkdf2-sha512\$220000\$/);
  });

  it('rejects invalid login credentials', async () => {
    const email = emailFor('invalid-login');
    await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Wrong User',
          role: 'STUDENT',
        }),
      }),
    );

    const response = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'WrongPassword123!',
        }),
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Invalid email or password.');
  });

  it('uses the same login error for an unknown account', async () => {
    const response = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('unknown'),
          password: 'StrongPass123!',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Invalid email or password.');
  });

  it('returns an authenticated session for valid cookies', async () => {
    const email = emailFor('session');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Session User',
          role: 'STUDENT',
        }),
      }),
    );

    const cookieHeader = registerResponse.headers.get('set-cookie');
    expect(cookieHeader).toContain('tuklas_session=');

    const response = await getSession(
      new Request('http://localhost/api/auth/session', {
        headers: {
          Cookie: cookieHeader ?? '',
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const registered = await registerResponse.json();
    expect(payload.success).toBe(true);
    expect(payload.data.user.email).toBe(email);
    expect(payload.data.user.id).toBe(registered.data.user.id);
    expect(payload.data.user.role).toBe('STUDENT');
  });

  it('rejects an unauthenticated session request', async () => {
    const response = await getSession(
      new Request('http://localhost/api/auth/session'),
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Authentication required.');
  });

  it('treats malformed session cookies as unauthorized', async () => {
    const response = await getProtected(
      new Request('http://localhost/api/auth/protected', {
        headers: { Cookie: 'tuklas_session=malformed.signature.x' },
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe('Authentication required.');
  });

  it('allows a protected route for authenticated users and denies without auth', async () => {
    const email = emailFor('protected');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Protected User',
          role: 'TEACHER',
        }),
      }),
    );
    const cookieHeader = registerResponse.headers.get('set-cookie') ?? '';

    const protectedResponse = await getProtected(
      new Request('http://localhost/api/auth/protected', {
        headers: { Cookie: cookieHeader },
      }),
    );
    expect(protectedResponse.status).toBe(200);
    const protectedPayload = await protectedResponse.json();
    expect(protectedPayload.success).toBe(true);
    expect(protectedPayload.data.user.email).toBe(email);

    const unauthenticated = await getProtected(
      new Request('http://localhost/api/auth/protected'),
    );
    expect(unauthenticated.status).toBe(401);
  });

  it('logs a user out and clears the session cookie', async () => {
    const email = emailFor('logout');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Logout User',
          role: 'STUDENT',
        }),
      }),
    );

    const cookieHeader = registerResponse.headers.get('set-cookie') ?? '';
    const response = await logout(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('tuklas_session=;');
    expect(payload.data.message).toBe('Logged out successfully.');

    const staleCookieResponse = await getProtected(
      new Request('http://localhost/api/auth/protected', {
        headers: { Cookie: cookieHeader },
      }),
    );
    expect(staleCookieResponse.status).toBe(401);
  });

  it('rejects an expired persisted session', async () => {
    const email = emailFor('expired');
    const registerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'StrongPass123!',
          displayName: 'Expired Session',
          role: 'STUDENT',
        }),
      }),
    );
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.authSession.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await getProtected(
      new Request('http://localhost/api/auth/protected', {
        headers: { Cookie: registerResponse.headers.get('set-cookie') ?? '' },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns and updates only the current user profile', async () => {
    const ownerEmail = emailFor('profile-owner');
    const otherEmail = emailFor('profile-other');
    const ownerResponse = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ownerEmail,
          password: 'StrongPass123!',
          displayName: 'Profile Owner',
          role: 'STUDENT',
        }),
      }),
    );
    await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: otherEmail,
          password: 'StrongPass123!',
          displayName: 'Other Profile',
          role: 'TEACHER',
        }),
      }),
    );
    const cookie = ownerResponse.headers.get('set-cookie') ?? '';

    const profileResponse = await getProfile(
      new Request(
        `http://localhost/api/profile?userId=${encodeURIComponent(otherEmail)}`,
        {
          headers: { Cookie: cookie },
        },
      ),
    );
    expect(profileResponse.status).toBe(200);
    expect((await profileResponse.json()).data.user.email).toBe(ownerEmail);

    const promotionResponse = await updateProfile(
      new Request('http://localhost/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          displayName: 'Updated Student',
          role: 'TEACHER',
        }),
      }),
    );
    expect(promotionResponse.status).toBe(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { email: ownerEmail } })).role,
    ).toBe('STUDENT');

    const updateResponse = await updateProfile(
      new Request('http://localhost/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ displayName: 'Updated Student' }),
      }),
    );
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).data.user.displayName).toBe(
      'Updated Student',
    );
  });

  it('requires authentication to read or update a profile', async () => {
    const getResponse = await getProfile(
      new Request('http://localhost/api/profile'),
    );
    const patchResponse = await updateProfile(
      new Request('http://localhost/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'No Session' }),
      }),
    );

    expect(getResponse.status).toBe(401);
    expect(patchResponse.status).toBe(401);
  });

  it('validates registration input', async () => {
    const response = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'short',
          displayName: '',
          role: 'STUDENT',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toBeTruthy();
  });

  it('does not allow public admin registration', async () => {
    const response = await register(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: emailFor('admin'),
          password: 'StrongPass123!',
          displayName: 'Attempted Admin',
          role: 'ADMIN',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
  });
});
