import { createApiHandler } from '../../../../../../lib/api-handler';
import { ClassService } from '../../../../../../services/class.service';

/** Archives an assignment (students stop seeing it; their progress is kept). */
export const DELETE = createApiHandler(
  async (_request, { user, params }) => {
    await ClassService.archiveAssignment(
      params!.id,
      { id: user!.id, role: user!.role },
      params!.assignmentId,
    );
    return { archived: true };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
