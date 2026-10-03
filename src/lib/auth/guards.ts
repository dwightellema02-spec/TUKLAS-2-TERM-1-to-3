/**
 * Tuklas 2.0 — Centralized Role & Ownership Authorization Guards
 *
 * Provides reusable server-side authorization checks for API routes,
 * server actions, and domain service workflows.
 */

import { PublicUser, UserRole } from '../../types/domain';
import { AuthenticationError, AuthorizationError } from '../errors';

/**
 * Asserts that a user identity is authenticated.
 */
export function requireAuth(user?: PublicUser): asserts user is PublicUser {
  if (!user) {
    throw new AuthenticationError('Authentication required to access this resource.');
  }
}

/**
 * Asserts that the authenticated user possesses an exact required role.
 */
export function requireRole(user: PublicUser | undefined, role: UserRole): asserts user is PublicUser {
  requireAuth(user);
  if (user.role !== role) {
    throw new AuthorizationError(`Access restricted to ${role} accounts.`);
  }
}

/**
 * Asserts that the authenticated user possesses one of the allowed roles.
 */
export function requireAnyRole(user: PublicUser | undefined, allowedRoles: UserRole[]): asserts user is PublicUser {
  requireAuth(user);
  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError(
      `Access restricted to [${allowedRoles.join(', ')}] accounts.`,
    );
  }
}

/**
 * Enforces ownership: student may only access resources belonging to themselves.
 * Teachers and Admins can be allowed via optional allowStaff flag.
 */
export function requireOwnership(
  user: PublicUser | undefined,
  resourceOwnerId: string,
  options: { allowStaff?: boolean; resourceName?: string } = {},
): void {
  requireAuth(user);

  if (user.id === resourceOwnerId) {
    return;
  }

  if (options.allowStaff && (user.role === 'TEACHER' || user.role === 'ADMIN')) {
    return;
  }

  const resource = options.resourceName ?? 'resource';
  throw new AuthorizationError(`You are not authorized to access this ${resource}.`);
}
