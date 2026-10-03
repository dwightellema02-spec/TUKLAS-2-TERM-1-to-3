/**
 * Tuklas 2.0 — Server Component Authentication & Role Guards
 *
 * Enforces server-side authentication and role-based access for Next.js App Router
 * Server Components and layouts, redirecting unauthorized visitors.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, getUserFromCookieValue } from '../../server/auth';
import { PublicUser, UserRole } from '../../types/domain';

export interface ServerAuthResult {
  user: PublicUser;
  authenticated: true;
}

/**
 * Validates the current HTTP session cookie on the server.
 * Returns the public user identity if valid and active, or redirects to /login.
 */
export async function requireServerUser(allowedRoles?: UserRole[]): Promise<PublicUser> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    redirect('/login');
  }

  const user = await getUserFromCookieValue(sessionCookie.value);

  if (!user) {
    redirect('/login');
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    redirect('/unauthorized');
  }

  return user;
}
