import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  createErrorResponse,
  normalizeError,
} from '../src/lib/errors';

describe('Error Handling Foundation', () => {
  it('correctly maps specific domain errors to HTTP status codes and codes', () => {
    const valErr = new ValidationError('Invalid email format.');
    expect(valErr.statusCode).toBe(400);
    expect(valErr.code).toBe('VALIDATION_ERROR');

    const authErr = new AuthenticationError();
    expect(authErr.statusCode).toBe(401);
    expect(authErr.code).toBe('AUTHENTICATION_REQUIRED');

    const permErr = new AuthorizationError();
    expect(permErr.statusCode).toBe(403);
    expect(permErr.code).toBe('FORBIDDEN');

    const notFound = new NotFoundError('Lesson not found.');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe('NOT_FOUND');

    const conflict = new ConflictError('User already exists.');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.code).toBe('CONFLICT');

    const rateLimit = new RateLimitError();
    expect(rateLimit.statusCode).toBe(429);
    expect(rateLimit.code).toBe('RATE_LIMITED');

    const dbErr = new DatabaseError();
    expect(dbErr.statusCode).toBe(500);
    expect(dbErr.code).toBe('DATABASE_ERROR');
  });

  it('normalizes Zod errors to clean validation errors without leaking schemas', () => {
    const schema = z.object({
      email: z.string().email('Invalid email address.'),
      age: z.number().min(10, 'Must be at least 10 years old.'),
    });

    const result = schema.safeParse({ email: 'not-an-email', age: 5 });
    expect(result.success).toBe(false);

    if (!result.success) {
      const normalized = normalizeError(result.error);
      expect(normalized.statusCode).toBe(400);
      expect(normalized.code).toBe('VALIDATION_ERROR');
      expect(normalized.message).toBe('Invalid email address.');
      expect(normalized.details).toBeDefined();
    }
  });

  it('serializes errors safely into Next.js responses without stack traces', async () => {
    const error = new ValidationError('Invalid parameter.');
    const response = createErrorResponse(error);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toBe('Invalid parameter.');
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body).not.toHaveProperty('stack');
  });
});
