/**
 * Tuklas 2.0 — Current User Identity & Profile Endpoint
 *
 * GET /api/auth/me
 *
 * Returns safe authenticated user metadata, role, and profile details.
 * Strictly avoids exposing passwordHash, secrets, tokens, or security attributes.
 */

import { db } from '../../../../server/db';
import { getSessionFromRequest, jsonError, jsonSuccess } from '../../../../server/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      studentProfile: {
        select: {
          studentNumber: true,
          gradeLevel: true,
          section: true,
          schoolName: true,
          bio: true,
        },
      },
      teacherProfile: {
        select: {
          department: true,
          title: true,
          specialization: true,
          schoolName: true,
          bio: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return jsonError('Account is inactive or session is invalid.', 401);
  }

  return jsonSuccess({
    user: {
      id: user.id,
      name: user.displayName,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      studentProfile: user.studentProfile,
      teacherProfile: user.teacherProfile,
      createdAt: user.createdAt,
    },
    authenticated: true,
  });
}
