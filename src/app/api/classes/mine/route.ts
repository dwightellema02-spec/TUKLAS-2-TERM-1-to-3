import { createApiHandler } from '../../../../lib/api-handler';
import { ClassService } from '../../../../services/class.service';

/** The student's own classes and the work assigned to them. */
export const GET = createApiHandler(
  async (_request, { user }) => ClassService.getStudentView(user!.id),
  { requireAuth: true, allowedRoles: ['STUDENT'] },
);
