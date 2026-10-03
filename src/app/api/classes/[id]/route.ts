import { createApiHandler } from '../../../../lib/api-handler';
import { ClassService } from '../../../../services/class.service';

/** Class detail: roster with real per-student activity, and active assignments. */
export const GET = createApiHandler(
  async (_request, { user, params }) =>
    ClassService.getClassDetail(params!.id, { id: user!.id, role: user!.role }),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
