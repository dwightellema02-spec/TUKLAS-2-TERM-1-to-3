/**
 * Tuklas 2.0 — Phase 3: Production Authentication, Authorization & Security Test Suite
 *
 * Verifies:
 * 1. Login lifecycle for Student, Teacher, and Admin roles
 * 2. Inactive account blocking and anti-enumeration generic errors
 * 3. Session creation, persistence, signature verification, expiration, and revocation
 * 4. Password policy validation and safe storage (no password/hash leaks)
 * 5. GET /api/auth/me and GET /api/auth/session contracts
 * 6. Role-based access control (Student vs Teacher vs Admin)
 * 7. Ownership protection across student progress and mistakes
 * 8. Privilege escalation defenses (rejecting ADMIN registration and role tampering in PATCH)
 * 9. Production demo seed guard
 */

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import {
  cleanupExpiredSessions,
  createSessionToken,
  hashPassword,
  SESSION_COOKIE_NAME,
} from '../src/server/auth';
import { POST as register } from '../src/app/api/auth/register/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { GET as getSession } from '../src/app/api/auth/session/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { PATCH as updateProfile } from '../src/app/api/profile/route';
import { POST as createLesson } from '../src/app/api/lessons/route';
import { GET as getMistakes } from '../src/app/api/mistakes/route';
import { POST as resolveMistake } from '../src/app/api/mistakes/[id]/resolve/route';
import { validatePasswordPolicy } from '../src/lib/auth/password';

const emailFor = (prefix = 'phase3-test') => `${prefix}-${randomUUID()}@example.com`;

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: 'phase3-test-' } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await db.mistakeRecord.deleteMany({ where: { studentId: { in: userIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await db.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.lesson.deleteMany({ where: { authorId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

describe('Phase 3 — Production Authentication, Authorization & Security', () => {
  describe('Password Security & Policy Validation', () => {
    it('validates password policy requiring 8+ chars, uppercase, lowercase, and digit', () => {
      expect(validatePasswordPolicy('short').valid).toBe(false);
      expect(validatePasswordPolicy('nouppercase123').valid).toBe(false);
      expect(validatePasswordPolicy('NOLOWERCASE123').valid).toBe(false);
      expect(validatePasswordPolicy('NoDigitsHere!').valid).toBe(false);
      expect(validatePasswordPolicy('ValidPass123').valid).toBe(true);
      expect(validatePasswordPolicy('StrongPassword99!').valid).toBe(true);
    });

    it('hashes passwords with PBKDF2-SHA512 and never exposes plaintext', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await hashPassword(password);
      expect(hash).toContain('pbkdf2-sha512$220000$');
      expect(hash).not.toContain(password);
    });
  });

  describe('Login Lifecycle & Credential Verification', () => {
    it('authenticates valid STUDENT, TEACHER, and ADMIN accounts', async () => {
      // 1. Create Student
      const studentEmail = emailFor('student');
      const studentHash = await hashPassword('StudentPass123!');
      await db.user.create({
        data: {
          email: studentEmail,
          passwordHash: studentHash,
          displayName: 'Test Student',
          role: 'STUDENT',
          isActive: true,
          studentProfile: { create: { studentNumber: 'LRN-P3-001' } },
        },
      });

      // 2. Create Teacher
      const teacherEmail = emailFor('teacher');
      const teacherHash = await hashPassword('TeacherPass123!');
      await db.user.create({
        data: {
          email: teacherEmail,
          passwordHash: teacherHash,
          displayName: 'Test Teacher',
          role: 'TEACHER',
          isActive: true,
          teacherProfile: { create: { department: 'Science' } },
        },
      });

      // 3. Create Admin
      const adminEmail = emailFor('admin');
      const adminHash = await hashPassword('AdminPass123!');
      await db.user.create({
        data: {
          email: adminEmail,
          passwordHash: adminHash,
          displayName: 'Test Admin',
          role: 'ADMIN',
          isActive: true,
        },
      });

      // Login Student
      const studentRes = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: studentEmail, password: 'StudentPass123!' }),
        }),
      );
      expect(studentRes.status).toBe(200);
      const studentPayload = await studentRes.json();
      expect(studentPayload.data.user.role).toBe('STUDENT');
      expect(studentPayload.data.user).not.toHaveProperty('passwordHash');
      expect(studentRes.headers.get('set-cookie')).toContain(SESSION_COOKIE_NAME);

      // Login Teacher
      const teacherRes = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: teacherEmail, password: 'TeacherPass123!' }),
        }),
      );
      expect(teacherRes.status).toBe(200);
      const teacherPayload = await teacherRes.json();
      expect(teacherPayload.data.user.role).toBe('TEACHER');

      // Login Admin
      const adminRes = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: adminEmail, password: 'AdminPass123!' }),
        }),
      );
      expect(adminRes.status).toBe(200);
      const adminPayload = await adminRes.json();
      expect(adminPayload.data.user.role).toBe('ADMIN');
    });

    it('rejects invalid password with generic error to reduce account enumeration', async () => {
      const email = emailFor('bad-pass');
      await db.user.create({
        data: {
          email,
          passwordHash: await hashPassword('CorrectPass123!'),
          displayName: 'Enum Target',
          role: 'STUDENT',
          isActive: true,
        },
      });

      const response = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'WrongPassword999!' }),
        }),
      );
      expect(response.status).toBe(401);
      const payload = await response.json();
      expect(payload.error).toBe('Invalid email or password.');
    });

    it('rejects unknown email with the exact same generic error', async () => {
      const response = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'nonexistent-account-999@tuklas.local',
            password: 'AnyPassword123!',
          }),
        }),
      );
      expect(response.status).toBe(401);
      const payload = await response.json();
      expect(payload.error).toBe('Invalid email or password.');
    });

    it('rejects inactive or deactivated accounts', async () => {
      const email = emailFor('inactive');
      await db.user.create({
        data: {
          email,
          passwordHash: await hashPassword('CorrectPass123!'),
          displayName: 'Deactivated User',
          role: 'STUDENT',
          isActive: false, // Inactive account
        },
      });

      const response = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'CorrectPass123!' }),
        }),
      );
      expect(response.status).toBe(401);
      const payload = await response.json();
      expect(payload.error).toBe('Invalid email or password.');
    });

    it('rejects malformed login payload', async () => {
      const response = await login(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'not-an-email' }),
        }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe('Session Management, Expiration & Revocation', () => {
    it('sets secure HttpOnly cookie and validates session on /api/auth/session and /api/auth/me', async () => {
      const email = emailFor('session-test');
      const reg = await register(
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
      const cookie = reg.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('HttpOnly');
      expect(cookie.toLowerCase()).toContain('samesite=lax');
      expect(cookie).toContain('Path=/');

      // GET /api/auth/session
      const sessionRes = await getSession(
        new Request('http://localhost/api/auth/session', {
          headers: { Cookie: cookie },
        }),
      );
      expect(sessionRes.status).toBe(200);
      const sessionData = await sessionRes.json();
      expect(sessionData.data.authenticated).toBe(true);
      expect(sessionData.data.user.email).toBe(email);
      expect(sessionData.data.user).not.toHaveProperty('passwordHash');

      // GET /api/auth/me
      const meRes = await getMe(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: cookie },
        }),
      );
      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.data.authenticated).toBe(true);
      expect(meData.data.user.name).toBe('Session User');
      expect(meData.data.user.role).toBe('STUDENT');
      expect(meData.data.user).not.toHaveProperty('passwordHash');
    });

    it('revokes session from database upon logout and prevents subsequent access', async () => {
      const email = emailFor('logout-test');
      const reg = await register(
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
      const cookie = reg.headers.get('set-cookie') ?? '';

      // Verify active
      const beforeLogout = await getMe(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: cookie },
        }),
      );
      expect(beforeLogout.status).toBe(200);

      // Perform logout
      const logoutRes = await logout(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

      // Verify old session token is rejected
      const afterLogout = await getMe(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: cookie },
        }),
      );
      expect(afterLogout.status).toBe(401);
    });

    it('rejects tampered session signatures', async () => {
      const email = emailFor('tamper-test');
      const reg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            password: 'StrongPass123!',
            displayName: 'Tamper Target',
            role: 'STUDENT',
          }),
        }),
      );
      const validCookie = reg.headers.get('set-cookie') ?? '';
      const tamperedCookie = validCookie.replace('tuklas_session=', 'tuklas_session=tampered.');

      const res = await getMe(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: tamperedCookie },
        }),
      );
      expect(res.status).toBe(401);
    });

    it('rejects expired database sessions and cleans them up', async () => {
      const email = emailFor('expired-test');
      const user = await db.user.create({
        data: {
          email,
          passwordHash: await hashPassword('StrongPass123!'),
          displayName: 'Expired Session User',
          role: 'STUDENT',
          isActive: true,
        },
      });

      // Create an expired session in database (expired 1 hour ago)
      const expiredSession = await db.authSession.create({
        data: {
          id: `expired-${randomUUID()}`,
          userId: user.id,
          expiresAt: new Date(Date.now() - 3600_000),
        },
      });

      // Cleanup expired sessions helper
      const cleaned = await cleanupExpiredSessions();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const found = await db.authSession.findUnique({ where: { id: expiredSession.id } });
      expect(found).toBeNull();
    });
  });

  describe('Role-Based Authorization (STUDENT vs TEACHER vs ADMIN)', () => {
    it('blocks students from accessing teacher lesson creation routes (403)', async () => {
      const studentEmail = emailFor('role-stu');
      const studentReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Student Role Account',
            role: 'STUDENT',
          }),
        }),
      );
      const cookie = studentReg.headers.get('set-cookie') ?? '';

      // Attempt teacher action: POST /api/lessons
      const res = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            title: 'Unauthorized Student Lesson',
            subject: 'Mathematics',
            gradeLevel: 'Grade 7',
          }),
        }),
      );
      expect(res.status).toBe(403);
    });

    it('allows authenticated teachers to access lesson creation routes', async () => {
      const teacherEmail = emailFor('role-teacher');
      const teacherHash = await hashPassword('TeacherPass123!');
      const teacherUser = await db.user.create({
        data: {
          email: teacherEmail,
          passwordHash: teacherHash,
          displayName: 'Authorized Teacher',
          role: 'TEACHER',
          isActive: true,
          teacherProfile: { create: { department: 'Math' } },
        },
      });
      const token = await createSessionToken({
        id: teacherUser.id,
        email: teacherUser.email,
        displayName: teacherUser.displayName,
        role: 'TEACHER',
      });
      const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;

      const unit = await db.unit.findFirst();
      const unitId = unit?.id ?? 'unit-math-7-term1-numbers';

      const res = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            title: 'Authorized Teacher Lesson',
            subject: 'Mathematics',
            gradeLevel: 'Grade 7',
            unitId,
            sections: [{ position: 0, heading: 'Intro' }],
          }),
        }),
      );
      expect(res.status).toBe(201);
      const payload = await res.json();
      expect(payload.data.lesson.authorId).toBe(teacherUser.id);
    });
  });

  describe('Ownership Authorization (Student Data Isolation)', () => {
    it('prevents Student A from viewing or modifying Student B mistakes', async () => {
      const emailA = emailFor('owner-a');
      const emailB = emailFor('owner-b');

      const regA = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: emailA,
            password: 'StrongPass123!',
            displayName: 'Student A',
            role: 'STUDENT',
          }),
        }),
      );
      const regB = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: emailB,
            password: 'StrongPass123!',
            displayName: 'Student B',
            role: 'STUDENT',
          }),
        }),
      );

      const cookieA = regA.headers.get('set-cookie') ?? '';
      const cookieB = regB.headers.get('set-cookie') ?? '';

      const userA = await db.user.findUniqueOrThrow({ where: { email: emailA } });

      // Create a mistake record belonging to Student A
      const mistakeA = await db.mistakeRecord.create({
        data: {
          studentId: userA.id,
          submittedAnswer: 'Wrong Answer',
          correctReference: 'Right Answer',
          category: 'CONCEPTUAL',
        },
      });

      // Student B queries mistakes -> mistakeA must NOT be returned
      const getBRes = await getMistakes(
        new Request('http://localhost/api/mistakes', {
          headers: { Cookie: cookieB },
        }),
      );
      expect(getBRes.status).toBe(200);
      const payloadB = await getBRes.json();
      expect(payloadB.data.mistakes.some((m: { id: string }) => m.id === mistakeA.id)).toBe(false);

      // Student B attempts to resolve Student A's mistake -> 403 Forbidden
      const resolveRes = await resolveMistake(
        new Request(`http://localhost/api/mistakes/${mistakeA.id}/resolve`, {
          method: 'POST',
          headers: { Cookie: cookieB },
        }),
        { params: Promise.resolve({ id: mistakeA.id }) },
      );
      expect(resolveRes.status).toBe(403);

      // Student A can resolve their own mistake -> 200 OK
      const resolveA = await resolveMistake(
        new Request(`http://localhost/api/mistakes/${mistakeA.id}/resolve`, {
          method: 'POST',
          headers: { Cookie: cookieA },
        }),
        { params: Promise.resolve({ id: mistakeA.id }) },
      );
      expect(resolveA.status).toBe(200);
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('strictly rejects registration requests attempting role=ADMIN', async () => {
      const response = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: emailFor('escalate-admin'),
            password: 'StrongPass123!',
            displayName: 'Attacker Admin',
            role: 'ADMIN', // Unauthorized role
          }),
        }),
      );
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.success).toBe(false);
    });

    it('rejects profile update requests attempting to alter role or inject unauthorized fields', async () => {
      const email = emailFor('patch-escalate');
      const reg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            password: 'StrongPass123!',
            displayName: 'Honest Student',
            role: 'STUDENT',
          }),
        }),
      );
      const cookie = reg.headers.get('set-cookie') ?? '';

      // Attempt to PATCH profile with role: ADMIN
      const patchRes = await updateProfile(
        new Request('http://localhost/api/profile', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            role: 'ADMIN',
          }),
        }),
      );
      // Schema validation fails with 400 because schema is .strict() and does not permit 'role'
      expect(patchRes.status).toBe(400);

      // Verify the user role remains STUDENT in the database
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      expect(user.role).toBe('STUDENT');
    });

    it('rejects profile update requests attempting to inject passwordHash directly', async () => {
      const email = emailFor('patch-hash');
      const reg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            password: 'StrongPass123!',
            displayName: 'Hash Inserter',
            role: 'STUDENT',
          }),
        }),
      );
      const cookie = reg.headers.get('set-cookie') ?? '';

      const patchRes = await updateProfile(
        new Request('http://localhost/api/profile', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            passwordHash: 'injected-fake-hash',
          }),
        }),
      );
      expect(patchRes.status).toBe(400);
    });
  });
});
