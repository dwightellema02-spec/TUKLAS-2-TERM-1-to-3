import { db } from '../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
  toPublicUser,
} from '../../../../server/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
  });

  if (!user || !user.isActive) {
    return jsonError('Authentication required.', 401);
  }

  return jsonSuccess({
    user: toPublicUser(user),
    authenticated: true,
  });
}
