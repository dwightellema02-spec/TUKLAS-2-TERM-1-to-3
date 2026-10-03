import { createApiHandler } from '../../../../../lib/api-handler';
import { PracticeService } from '../../../../../services/practice.service';

/**
 * The student's own practice session. Each question's answer key and explanation are
 * included only after that question has been answered.
 */
export const GET = createApiHandler(
  async (_request, { user, params }) => {
    const session = await PracticeService.getSessionForStudent(params!.id, user!.id);
    return { session };
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
  },
);
