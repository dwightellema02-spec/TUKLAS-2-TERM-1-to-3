import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { hashPassword } from '../src/server/auth';
import { POST as login } from '../src/app/api/auth/login/route';
import {
  getRequestAddress,
  MAX_FAILED_LOGINS,
  resetRateLimits,
} from '../src/server/rate-limit';

const PREFIX = 'login-protect-';
const PASSWORD = 'CorrectPass123!';
const originalHops = process.env.TRUSTED_PROXY_HOPS;

let hash = '';
let counter = 0;

async function makeUser(tag: string) {
  return db.user.create({
    data: {
      email: `${PREFIX}${tag}-${randomUUID()}@example.com`,
      passwordHash: hash,
      role: 'STUDENT',
      displayName: `Protected ${tag}`,
    },
  });
}

/** Attempt a login. `spoof` is the attacker-controlled leading X-Forwarded-For entry. */
function attempt(email: string, password: string, spoof?: string, realIp = '203.0.113.7') {
  counter += 1;
  const forwarded = `${spoof ?? `10.0.0.${counter % 250}`}, ${realIp}`;
  return login(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': forwarded },
      body: JSON.stringify({ email, password }),
    }),
  );
}

beforeEach(async () => {
  resetRateLimits();
  delete process.env.TRUSTED_PROXY_HOPS;
  hash ||= await hashPassword(PASSWORD);
});

afterEach(async () => {
  if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = originalHops;
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

function req(forwarded?: string) {
  return new Request('http://localhost/x', {
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  });
}

describe('getRequestAddress', () => {
  it('uses the entry added by the trusted proxy, ignoring client-supplied entries to its left', () => {
    expect(getRequestAddress(req('203.0.113.7'))).toBe('203.0.113.7');
    expect(getRequestAddress(req('1.2.3.4, 203.0.113.7'))).toBe('203.0.113.7');
    expect(getRequestAddress(req('6.6.6.6, 7.7.7.7, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('gives the same address however the spoofed prefix is rotated', () => {
    const addresses = new Set(
      Array.from({ length: 20 }, (_, i) => getRequestAddress(req(`9.9.9.${i}, 203.0.113.7`))),
    );
    expect([...addresses]).toEqual(['203.0.113.7']);
  });

  it('honours TRUSTED_PROXY_HOPS for deployments with more than one proxy', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(getRequestAddress(req('6.6.6.6, 198.51.100.9, 10.1.1.1'))).toBe('198.51.100.9');
    expect(getRequestAddress(req('10.1.1.1'))).toBe('unknown'); // fewer entries than hops
  });

  it('returns "unknown" for a missing header, junk values or invalid hop settings', () => {
    expect(getRequestAddress(req())).toBe('unknown');
    expect(getRequestAddress(req('not-an-ip'))).toBe('unknown');
    expect(getRequestAddress(req("1.1.1.1; DROP TABLE users"))).toBe('unknown');
    process.env.TRUSTED_PROXY_HOPS = '0';
    expect(getRequestAddress(req('1.1.1.1, 203.0.113.7'))).toBe('203.0.113.7');
    process.env.TRUSTED_PROXY_HOPS = 'abc';
    expect(getRequestAddress(req('1.1.1.1, 203.0.113.7'))).toBe('203.0.113.7');
  });
});

describe('account lockout survives X-Forwarded-For rotation', () => {
  it(`locks the account after ${MAX_FAILED_LOGINS} consecutive failures even when every request spoofs a new address`, async () => {
    const user = await makeUser('rotate');
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      const response = await attempt(user.email, 'WrongPass123!', `172.16.${i}.1`);
      expect(response.status).toBe(401);
    }
    const locked = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even the CORRECT password is refused while locked, from any claimed address.
    const withCorrect = await attempt(user.email, PASSWORD, '8.8.8.8');
    expect(withCorrect.status).toBe(429);
    expect(withCorrect.headers.get('set-cookie')).toBeNull();
    expect((await attempt(user.email, PASSWORD, '4.4.4.4')).status).toBe(429);
  });

  it('allows login again after the lock expires and clears the counters', async () => {
    const user = await makeUser('expire');
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) await attempt(user.email, 'bad-password-1', `1.1.${i}.1`);
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1_000) } });

    const response = await attempt(user.email, PASSWORD);
    expect(response.status).toBe(200);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginCount).toBe(0);
  });

  it('resets the failure counter on a successful login', async () => {
    const user = await makeUser('reset');
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) await attempt(user.email, 'bad-password-1');
    expect((await attempt(user.email, PASSWORD)).status).toBe(200);
    // Four more failures after the success must not trip the lock (count restarted from 0).
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) {
      expect((await attempt(user.email, 'bad-password-2')).status).toBe(401);
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.lockedUntil).toBeNull();
    expect((await attempt(user.email, PASSWORD)).status).toBe(200);
  });

  it('does not lock one user because of failures against a different account', async () => {
    const victim = await makeUser('victim');
    const other = await makeUser('other');
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) await attempt(other.email, 'bad-password-1');
    expect((await attempt(victim.email, PASSWORD, '5.5.5.5')).status).toBe(200);
  });
});

describe('IP-independent and per-address limits', () => {
  it('limits guesses against an unknown account no matter how the header is rotated', async () => {
    const email = `${PREFIX}ghost-${randomUUID()}@example.com`;
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await attempt(email, 'whatever-123', `192.0.2.${i}`)).status);
    }
    // An unknown email locks after the same number of failures as a real account does, so the lock cannot be used to
    // find out which accounts exist (the per-account limit of 20 a minute still stands behind it).
    expect(statuses.slice(0, MAX_FAILED_LOGINS).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(MAX_FAILED_LOGINS).every((status) => status === 429)).toBe(true);
  });

  it('limits password spraying from one real address even with spoofed prefixes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 65; i += 1) {
      const email = `${PREFIX}spray-${i}-${randomUUID()}@example.com`;
      statuses.push((await attempt(email, 'whatever-123', `198.18.${i}.1`, '203.0.113.99')).status);
    }
    expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(60).every((status) => status === 429)).toBe(true);
  });

  it('does not throttle a different real address', async () => {
    for (let i = 0; i < 61; i += 1) {
      await attempt(`${PREFIX}spray-b-${i}-${randomUUID()}@example.com`, 'x-12345678', `1.1.${i}.1`, '203.0.113.50');
    }
    const user = await makeUser('bystander');
    expect((await attempt(user.email, PASSWORD, undefined, '203.0.113.51')).status).toBe(200);
  });

  it('keeps failing uniformly for unknown emails (no lock row to leak existence)', async () => {
    const response = await attempt(`${PREFIX}nobody-${randomUUID()}@example.com`, 'whatever-123');
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Invalid email or password.');
  });
});
