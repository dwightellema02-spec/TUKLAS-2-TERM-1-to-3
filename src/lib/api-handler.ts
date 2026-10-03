/**
 * Tuklas 2.0 — Standardized API Handler Pipeline
 *
 * Implements the required pipeline:
 * Authentication -> Authorization -> Validation -> Business Logic -> Response
 */

import { NextResponse } from 'next/server';
import { ZodType } from 'zod';
import { getSessionFromRequest, jsonSuccess } from '../server/auth';
import { db } from '../server/db';
import { AuthenticationError, AuthorizationError, createErrorResponse, ValidationError } from './errors';
import { PublicUser, UserRole } from '../types/domain';

export type RequestContext = {
  user?: PublicUser;
  params?: Record<string, string>;
};

export type ApiHandlerOptions<TBody = unknown> = {
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  bodySchema?: ZodType<TBody>;
  successStatus?: number;
};

/**
 * Wraps Route Handlers to ensure strict authentication, role-based authorization,
 * input validation, and centralized error handling.
 */
export function createApiHandler<TResult = unknown, TBody = unknown>(
  handler: (req: Request, ctx: RequestContext & { body: TBody }) => Promise<TResult>,
  options: ApiHandlerOptions<TBody> = {},
) {
  return async function (
    request: Request,
    routeParams?: { params?: Promise<Record<string, string>> | Record<string, string> },
  ): Promise<NextResponse> {
    try {
      let user: PublicUser | undefined;

      // 1. Authentication (if required)
      if (options.requireAuth || options.allowedRoles?.length) {
        const session = await getSessionFromRequest(request);
        if (!session) {
          throw new AuthenticationError();
        }

        const dbUser = await db.user.findUnique({
          where: { id: session.sub },
          select: { id: true, email: true, displayName: true, role: true, isActive: true },
        });

        if (!dbUser || !dbUser.isActive) {
          throw new AuthenticationError('Account is inactive or disabled.');
        }

        user = {
          id: dbUser.id,
          email: dbUser.email,
          displayName: dbUser.displayName,
          role: dbUser.role as UserRole,
        };

        // 2. Authorization (role checks)
        if (options.allowedRoles && options.allowedRoles.length > 0) {
          if (!options.allowedRoles.includes(user.role)) {
            throw new AuthorizationError();
          }
        }
      }

      // 3. Request Body Validation (if schema provided)
      let parsedBody = undefined as unknown as TBody;
      if (options.bodySchema) {
        let rawBody: unknown;
        try {
          rawBody = await request.json();
        } catch {
          throw new ValidationError('Invalid JSON body.');
        }

        const parseResult = options.bodySchema.safeParse(rawBody);
        if (!parseResult.success) {
          throw new ValidationError(
            parseResult.error.issues[0]?.message ?? 'Invalid request payload.',
            parseResult.error.issues,
          );
        }
        parsedBody = parseResult.data;
      }

      // 4. Resolve Route Params (supporting Next.js 15 Promise-based params)
      let resolvedParams: Record<string, string> = {};
      if (routeParams?.params) {
        resolvedParams = (await routeParams.params) || {};
      }

      // 5. Execute Business Logic Handler
      const result = await handler(request, {
        user,
        params: resolvedParams,
        body: parsedBody,
      });

      // 6. Return Standardized Success Envelope
      return jsonSuccess(result, options.successStatus ?? 200);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}
