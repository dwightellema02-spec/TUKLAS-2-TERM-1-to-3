import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as register } from '../src/app/api/auth/register/route';
import { db } from '../src/server/db';

const PREFIX = 'invite-test-';
const originalCode = process.env.TEACHER_INVITE_CODE;
let counter = 0;

function registerTeacher(inviteCode?: string) {
  counter += 1;
  return register(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${PREFIX}${process.pid}-${counter}@example.test`,
        password: 'StrongPass123!',
        displayName: 'Invite Test Teacher',
        role: 'TEACHER',
        ...(inviteCode === undefined ? {} : { inviteCode }),
      }),
    }),
  );
}

beforeEach(() => {
  process.env.TEACHER_INVITE_CODE = 'configured-invite-code';
});

afterEach(async () => {
  if (originalCode === undefined) delete process.env.TEACHER_INVITE_CODE;
  else process.env.TEACHER_INVITE_CODE = originalCode;
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('teacher registration invite code', () => {
  it('rejects a teacher registration without an invite code', async () => {
    const response = await registerTeacher();
    expect(response.status).toBe(403);
  });

  it('rejects a wrong invite code', async () => {
    const response = await registerTeacher('not-the-code');
    expect(response.status).toBe(403);
  });

  it('does not accept the old hardcoded demo code', async () => {
    const response = await registerTeacher('TUKLAS-TEACHER-DEMO');
    expect(response.status).toBe(403);
  });

  it('disables teacher registration entirely when no code is configured', async () => {
    delete process.env.TEACHER_INVITE_CODE;
    expect((await registerTeacher('TUKLAS-TEACHER-DEMO')).status).toBe(403);
    expect((await registerTeacher('')).status).toBe(403);
    process.env.TEACHER_INVITE_CODE = '   ';
    expect((await registerTeacher('   ')).status).toBe(403);
  });

  it('creates a TEACHER account only with the correct code', async () => {
    const response = await registerTeacher('configured-invite-code');
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.user.role).toBe('TEACHER');
    const stored = await db.user.findFirstOrThrow({
      where: { email: { startsWith: PREFIX } },
    });
    expect(stored.role).toBe('TEACHER');
  });

  it('never creates a user row for a rejected attempt', async () => {
    await registerTeacher('wrong');
    const count = await db.user.count({ where: { email: { startsWith: PREFIX } } });
    expect(count).toBe(0);
  });
});
