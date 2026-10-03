/**
 * Tuklas 2.0 — Centralized Password & Security Utilities
 *
 * Enforces industry-standard PBKDF2-HMAC-SHA512 password hashing with 220,000 iterations
 * and server-side password complexity policy validation.
 */

import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivePasswordKey = promisify(pbkdf2);

export const PASSWORD_HASH_ITERATIONS = 220_000;
export const LEGACY_PASSWORD_HASH_ITERATIONS = 100_000;

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password against Tuklas 2.0 minimum security policy:
 * - At least 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (password && password.length > 128) {
    errors.push('Password must not exceed 128 characters.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include at least one lowercase letter.');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must include at least one number.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a salted PBKDF2-SHA512 password hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (
    await derivePasswordKey(
      password,
      salt,
      PASSWORD_HASH_ITERATIONS,
      64,
      'sha512',
    )
  ).toString('hex');
  return `pbkdf2-sha512$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

export function parseStoredPasswordHash(storedHash: string) {
  const parts = storedHash.split('$');
  if (parts.length === 4 && parts[0] === 'pbkdf2-sha512') {
    const iterations = Number(parts[1]);
    if (
      !Number.isSafeInteger(iterations) ||
      iterations < 1 ||
      iterations > PASSWORD_HASH_ITERATIONS
    ) {
      return null;
    }
    return { iterations, salt: parts[2], expectedHash: parts[3] };
  }

  const separatorIndex = storedHash.indexOf(':');
  if (separatorIndex < 1) return null;
  return {
    iterations: LEGACY_PASSWORD_HASH_ITERATIONS,
    salt: storedHash.slice(0, separatorIndex),
    expectedHash: storedHash.slice(separatorIndex + 1),
  };
}

/**
 * Verifies a plaintext password against a stored hash using timing-safe comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parsed = parseStoredPasswordHash(storedHash);
  if (!parsed || !/^[\da-f]{128}$/i.test(parsed.expectedHash)) return false;

  const expectedBuffer = Buffer.from(parsed.expectedHash, 'hex');
  const actualBuffer = await derivePasswordKey(
    password,
    parsed.salt,
    parsed.iterations,
    64,
    'sha512',
  );

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/**
 * Checks whether an existing stored hash should be upgraded to latest iterations.
 */
export function passwordHashNeedsUpgrade(storedHash: string): boolean {
  const parsed = parseStoredPasswordHash(storedHash);
  return (
    !parsed ||
    parsed.iterations < PASSWORD_HASH_ITERATIONS ||
    !storedHash.startsWith('pbkdf2-sha512$')
  );
}
