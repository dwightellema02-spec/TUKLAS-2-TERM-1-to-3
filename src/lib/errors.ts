/**
 * Tuklas 2.0 — Standardized Error Handling Hierarchy
 *
 * Distinguishes operational errors (validation, auth, not found, rate limits)
 * from unexpected server bugs. Guarantees safe responses without leaking
 * stack traces, internal database details, or credentials to clients.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiErrorResponse } from '../types/api';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DATABASE_ERROR'
  | 'AI_SERVICE_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(message: string, statusCode = 500, code: ErrorCode = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You are not authorized to perform this action.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again shortly.') {
    super(message, 429, 'RATE_LIMITED');
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred. Please try again.') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

export class AiError extends AppError {
  constructor(message = 'The AI service encountered an error. Please try again.', statusCode = 502) {
    super(message, statusCode, 'AI_SERVICE_ERROR');
  }
}

/**
 * Normalizes any error (Zod, Prisma, AppError, Error, unknown) into a structured client-safe error response.
 */
export function normalizeError(error: unknown): {
  statusCode: number;
  message: string;
  code: ErrorCode;
  details?: unknown;
} {
  // 1. Known AppError instances
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }

  // 2. Zod validation errors
  if (error instanceof ZodError) {
    const primaryMessage = error.issues[0]?.message ?? 'Invalid request payload.';
    return {
      statusCode: 400,
      message: primaryMessage,
      code: 'VALIDATION_ERROR',
      details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }

  // 3. Prisma Known Request Errors
  if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    const prismaCode = (error as { code: string }).code;
    if (prismaCode === 'P2002') {
      return {
        statusCode: 409,
        message: 'A record with this identifier already exists.',
        code: 'CONFLICT',
      };
    }
    if (prismaCode === 'P2025') {
      return {
        statusCode: 404,
        message: 'Record not found.',
        code: 'NOT_FOUND',
      };
    }
    return {
      statusCode: 500,
      message: 'Database query failure.',
      code: 'DATABASE_ERROR',
    };
  }

  // 4. Configuration Error
  if (error instanceof Error && error.message.includes('AUTH_SECRET')) {
    return {
      statusCode: 503,
      message: 'Authentication service is not configured.',
      code: 'CONFIGURATION_ERROR',
    };
  }

  // 5. Standard Error with message (if operational or recognized)
  if (error instanceof Error) {
    if (error.name === 'AiServiceError' || error.message.includes('AI')) {
      const status = 'status' in error && typeof error.status === 'number' ? error.status : 502;
      return {
        statusCode: status,
        message: error.message || 'AI service failure.',
        code: 'AI_SERVICE_ERROR',
      };
    }
    // Generic fallback
    return {
      statusCode: 500,
      message: process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : error.message,
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  // 6. Unknown fallback
  return {
    statusCode: 500,
    message: 'An unexpected server error occurred.',
    code: 'INTERNAL_SERVER_ERROR',
  };
}

/**
 * Creates a standard JSON error response using the Next.js NextResponse object.
 */
export function createErrorResponse(error: unknown): NextResponse<ApiErrorResponse> {
  const normalized = normalizeError(error);
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: normalized.message,
      code: normalized.code,
      details: normalized.details,
    },
    { status: normalized.statusCode },
  );
}
