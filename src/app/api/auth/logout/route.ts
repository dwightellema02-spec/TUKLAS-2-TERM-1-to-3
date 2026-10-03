import {
  clearSessionCookie,
  jsonError,
  jsonSuccess,
  revokeSessionFromRequest,
} from '../../../../server/auth';

import { AuthAuditLogger } from '../../../../lib/auth/audit';

export async function POST(request: Request) {
  const response = jsonSuccess({
    message: 'Logged out successfully.',
  });

  try {
    await revokeSessionFromRequest(request);
    AuthAuditLogger.log({ event: 'LOGOUT', success: true });
  } catch {
    const errorResponse = jsonError(
      'Unable to complete logout. Please try again.',
      503,
    );
    clearSessionCookie(errorResponse);
    return errorResponse;
  }
  clearSessionCookie(response);

  return response;
}
