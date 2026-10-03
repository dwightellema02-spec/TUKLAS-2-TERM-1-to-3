import { createApiHandler } from '../../../../../../lib/api-handler';
import { ClassService } from '../../../../../../services/class.service';

/** Removes a student from the class (their own learning data is kept). */
export const DELETE = createApiHandler(
  async (_request, { user, params }) => {
    await ClassService.removeMember(params!.id, { id: user!.id, role: user!.role }, params!.userId);
    return { removed: true };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
