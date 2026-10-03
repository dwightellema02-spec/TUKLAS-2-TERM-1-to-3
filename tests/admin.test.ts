import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, hashPassword, SESSION_COOKIE_NAME } from '../src/server/auth';
import { resetRateLimits } from '../src/server/rate-limit';
import { GET as listUsers, POST as createUser } from '../src/app/api/admin/users/route';
import { PATCH as updateUser } from '../src/app/api/admin/users/[id]/route';
import { POST as resetPassword } from '../src/app/api/admin/users/[id]/password/route';
import { GET as listAudit } from '../src/app/api/admin/audit/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { GET as listClasses } from '../src/app/api/classes/route';

const PREFIX = 'admin-test-';
type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

async function actor(role: Role, tag: string, password = 'OriginalPass123!') {
  const user = await db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: await hashPassword(password),
      role,
      displayName: `${role} ${tag}`,
    },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role });
  return { user, token, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const headers = (cookie: string) => ({
  'content-type': 'application/json',
  ...(cookie ? { Cookie: cookie } : {}),
});
const req = (method: string, cookie: string, body?: unknown, url = 'http://localhost/api/admin/users') =>
  new Request(url, { method, headers: headers(cookie), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const newAccount = (over: Record<string, unknown> = {}) => ({
  email: `${PREFIX}new-${randomUUID()}@example.com`,
  displayName: 'New Person',
  role: 'TEACHER',
  password: 'TempPass123!',
  ...over,
});

function tryLogin(email: string, password: string) {
  return login(req('POST', '', { email, password }, 'http://localhost/api/auth/login'));
}

beforeEach(() => resetRateLimits());

afterEach(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetUserId: { in: ids } }] } });
  await db.class.deleteMany({ where: { teacherId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('access control', () => {
  it('only admins can use any admin route', async () => {
    const teacher = await actor('TEACHER', 'acl-t');
    const student = await actor('STUDENT', 'acl-s');
    const target = await actor('STUDENT', 'acl-target');
    for (const who of [teacher, student]) {
      expect((await listUsers(req('GET', who.cookie))).status).toBe(403);
      expect((await createUser(req('POST', who.cookie, newAccount()))).status).toBe(403);
      expect((await updateUser(req('PATCH', who.cookie, { isActive: false }), ctx(target.user.id))).status).toBe(403);
      expect((await resetPassword(req('POST', who.cookie, { password: 'Hacked123!' }), ctx(target.user.id))).status).toBe(403);
      expect((await listAudit(req('GET', who.cookie))).status).toBe(403);
    }
    expect((await listUsers(req('GET', ''))).status).toBe(401);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.user.id } })).isActive).toBe(true);
  });
});

describe('creating accounts', () => {
  it('creates a teacher who can sign in with the temporary password, and audits it', async () => {
    const admin = await actor('ADMIN', 'create');
    const body = newAccount();
    const response = await createUser(req('POST', admin.cookie, body));
    expect(response.status).toBe(201);
    const created = (await response.json()).data.user;
    expect(created).toMatchObject({ email: body.email, role: 'TEACHER', isActive: true });
    expect(created).not.toHaveProperty('passwordHash');

    const stored = await db.user.findUniqueOrThrow({ where: { id: created.id }, include: { teacherProfile: true } });
    expect(stored.passwordHash).not.toContain('TempPass123!');
    expect(stored.teacherProfile).not.toBeNull();
    expect((await tryLogin(body.email as string, 'TempPass123!')).status).toBe(200);

    const audit = await db.adminAuditLog.findFirstOrThrow({ where: { targetUserId: created.id } });
    expect(audit).toMatchObject({ action: 'USER_CREATED', actorId: admin.user.id });
  });

  it('creates students too, with a student profile', async () => {
    const admin = await actor('ADMIN', 'create-s');
    const created = (await (await createUser(req('POST', admin.cookie, newAccount({ role: 'STUDENT' })))).json()).data.user;
    const stored = await db.user.findUniqueOrThrow({ where: { id: created.id }, include: { studentProfile: true } });
    expect(stored.role).toBe('STUDENT');
    expect(stored.studentProfile).not.toBeNull();
  });

  it('can never create an administrator, whatever the request says', async () => {
    const admin = await actor('ADMIN', 'no-admin');
    expect((await createUser(req('POST', admin.cookie, newAccount({ role: 'ADMIN' })))).status).toBe(400);
    expect((await createUser(req('POST', admin.cookie, newAccount({ role: 'admin' })))).status).toBe(400);
  });

  it('enforces the password policy, valid email and unique email', async () => {
    const admin = await actor('ADMIN', 'validate');
    expect((await createUser(req('POST', admin.cookie, newAccount({ password: 'short' })))).status).toBe(400);
    expect((await createUser(req('POST', admin.cookie, newAccount({ password: 'alllowercase123' })))).status).toBe(400);
    expect((await createUser(req('POST', admin.cookie, newAccount({ email: 'nope' })))).status).toBe(400);
    expect((await createUser(req('POST', admin.cookie, newAccount({ displayName: 'x' })))).status).toBe(400);
    const body = newAccount();
    expect((await createUser(req('POST', admin.cookie, body))).status).toBe(201);
    expect((await createUser(req('POST', admin.cookie, { ...body, email: (body.email as string).toUpperCase() }))).status).toBe(409);
  });
});

describe('deactivating and reactivating', () => {
  it('ends access immediately: sessions are deleted and the old cookie stops working', async () => {
    const admin = await actor('ADMIN', 'deact');
    const teacher = await actor('TEACHER', 'deact-t');
    expect((await listClasses(req('GET', teacher.cookie, undefined, 'http://localhost/api/classes'))).status).toBe(200);
    expect(await db.authSession.count({ where: { userId: teacher.user.id } })).toBeGreaterThan(0);

    const response = await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx(teacher.user.id));
    expect(response.status).toBe(200);
    expect(await db.authSession.count({ where: { userId: teacher.user.id } })).toBe(0);
    expect((await listClasses(req('GET', teacher.cookie, undefined, 'http://localhost/api/classes'))).status).toBe(401);
    expect((await tryLogin(teacher.user.email, 'OriginalPass123!')).status).toBe(401);
    expect(
      (await db.adminAuditLog.findFirstOrThrow({ where: { targetUserId: teacher.user.id } })).action,
    ).toBe('USER_DEACTIVATED');
  });

  it('lets the user sign in again after reactivation', async () => {
    const admin = await actor('ADMIN', 'react');
    const student = await actor('STUDENT', 'react-s');
    await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx(student.user.id));
    await updateUser(req('PATCH', admin.cookie, { isActive: true }), ctx(student.user.id));
    expect((await tryLogin(student.user.email, 'OriginalPass123!')).status).toBe(200);
  });
});

describe('protections', () => {
  it('an admin cannot change their own account', async () => {
    const admin = await actor('ADMIN', 'self');
    expect((await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx(admin.user.id))).status).toBe(403);
    expect((await updateUser(req('PATCH', admin.cookie, { role: 'STUDENT' }), ctx(admin.user.id))).status).toBe(403);
    expect((await resetPassword(req('POST', admin.cookie, { password: 'Another123!' }), ctx(admin.user.id))).status).toBe(403);
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.user.id } })).role).toBe('ADMIN');
  });

  it('an admin cannot manage another administrator', async () => {
    const admin = await actor('ADMIN', 'peer-a');
    const peer = await actor('ADMIN', 'peer-b');
    expect((await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx(peer.user.id))).status).toBe(403);
    expect((await updateUser(req('PATCH', admin.cookie, { role: 'STUDENT' }), ctx(peer.user.id))).status).toBe(403);
    expect((await resetPassword(req('POST', admin.cookie, { password: 'Another123!' }), ctx(peer.user.id))).status).toBe(403);
    const after = await db.user.findUniqueOrThrow({ where: { id: peer.user.id } });
    expect(after).toMatchObject({ role: 'ADMIN', isActive: true });
  });

  it('cannot promote anyone to administrator', async () => {
    const admin = await actor('ADMIN', 'promote');
    const student = await actor('STUDENT', 'promote-s');
    expect((await updateUser(req('PATCH', admin.cookie, { role: 'ADMIN' }), ctx(student.user.id))).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: student.user.id } })).role).toBe('STUDENT');
  });

  it('answers 404 for an unknown user and 400 for an empty update', async () => {
    const admin = await actor('ADMIN', 'unknown');
    expect((await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx('missing'))).status).toBe(404);
    const student = await actor('STUDENT', 'unknown-s');
    expect((await updateUser(req('PATCH', admin.cookie, {}), ctx(student.user.id))).status).toBe(400);
  });
});

describe('changing roles', () => {
  it('turns a student into a teacher (with a teacher profile) and ends their old sessions', async () => {
    const admin = await actor('ADMIN', 'role');
    const person = await actor('STUDENT', 'role-p');
    const response = await updateUser(req('PATCH', admin.cookie, { role: 'TEACHER' }), ctx(person.user.id));
    expect(response.status).toBe(200);
    const stored = await db.user.findUniqueOrThrow({ where: { id: person.user.id }, include: { teacherProfile: true } });
    expect(stored.role).toBe('TEACHER');
    expect(stored.teacherProfile).not.toBeNull();
    expect(await db.authSession.count({ where: { userId: person.user.id } })).toBe(0);
    const entry = await db.adminAuditLog.findFirstOrThrow({ where: { targetUserId: person.user.id } });
    expect(entry).toMatchObject({ action: 'USER_ROLE_CHANGED', details: { from: 'STUDENT', to: 'TEACHER' } });
  });

  it('refuses to demote a teacher who still owns classes', async () => {
    const admin = await actor('ADMIN', 'owned');
    const teacher = await actor('TEACHER', 'owned-t');
    await db.class.create({ data: { name: 'Keep Me', teacherId: teacher.user.id } });
    const response = await updateUser(req('PATCH', admin.cookie, { role: 'STUDENT' }), ctx(teacher.user.id));
    expect(response.status).toBe(409);
    expect((await db.user.findUniqueOrThrow({ where: { id: teacher.user.id } })).role).toBe('TEACHER');
  });
});

describe('resetting a password', () => {
  it('sets the new password, ends sessions, clears a lockout, and audits it', async () => {
    const admin = await actor('ADMIN', 'reset');
    const person = await actor('STUDENT', 'reset-p');
    await db.user.update({
      where: { id: person.user.id },
      data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() + 600_000) },
    });
    expect((await tryLogin(person.user.email, 'OriginalPass123!')).status).toBe(429); // locked

    const response = await resetPassword(req('POST', admin.cookie, { password: 'BrandNew123!' }), ctx(person.user.id));
    expect(response.status).toBe(200);
    expect(await db.authSession.count({ where: { userId: person.user.id } })).toBe(0);
    expect((await tryLogin(person.user.email, 'OriginalPass123!')).status).toBe(401);
    expect((await tryLogin(person.user.email, 'BrandNew123!')).status).toBe(200);
    expect((await db.adminAuditLog.findFirstOrThrow({ where: { targetUserId: person.user.id } })).action).toBe('PASSWORD_RESET');
  });

  it('applies the password policy and never writes the password to the audit log', async () => {
    const admin = await actor('ADMIN', 'policy');
    const person = await actor('STUDENT', 'policy-p');
    expect((await resetPassword(req('POST', admin.cookie, { password: 'weak' }), ctx(person.user.id))).status).toBe(400);
    await resetPassword(req('POST', admin.cookie, { password: 'Secret123abc' }), ctx(person.user.id));
    const entries = await db.adminAuditLog.findMany({ where: { targetUserId: person.user.id } });
    expect(JSON.stringify(entries)).not.toContain('Secret123abc');
  });
});

describe('listing and audit log', () => {
  it('lists users with filters and never exposes password hashes', async () => {
    const admin = await actor('ADMIN', 'list');
    const teacher = await actor('TEACHER', 'list-teacher');
    await actor('STUDENT', 'list-student');
    const all = await (await listUsers(req('GET', admin.cookie, undefined, 'http://localhost/api/admin/users'))).text();
    expect(all).not.toContain('passwordHash');
    const byRole = (
      await (await listUsers(req('GET', admin.cookie, undefined, 'http://localhost/api/admin/users?role=TEACHER'))).json()
    ).data.users as Array<{ role: string }>;
    expect(byRole.length).toBeGreaterThan(0);
    expect(byRole.every((u) => u.role === 'TEACHER')).toBe(true);
    const search = (
      await (
        await listUsers(req('GET', admin.cookie, undefined, `http://localhost/api/admin/users?q=${teacher.user.email.slice(0, 22)}`))
      ).json()
    ).data.users as Array<{ id: string }>;
    expect(search.map((u) => u.id)).toContain(teacher.user.id);
  });

  it('records who did what, newest first', async () => {
    const admin = await actor('ADMIN', 'audit');
    const person = await actor('STUDENT', 'audit-p');
    await updateUser(req('PATCH', admin.cookie, { isActive: false }), ctx(person.user.id));
    await updateUser(req('PATCH', admin.cookie, { isActive: true }), ctx(person.user.id));
    const { entries } = (await (await listAudit(req('GET', admin.cookie))).json()).data;
    const mine = entries.filter((e: { targetUserId: string }) => e.targetUserId === person.user.id);
    expect(mine.map((e: { action: string }) => e.action)).toEqual(['USER_REACTIVATED', 'USER_DEACTIVATED']);
    expect(mine[0].actor).toBe(admin.user.displayName);
  });
});
