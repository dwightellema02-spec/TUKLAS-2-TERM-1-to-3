import { createApiHandler } from '../../../../../../lib/api-handler';
import { ClassInsightsService } from '../../../../../../services/class-insights.service';

/** One class member's evidence for the class's teacher (or an admin). */
export const GET = createApiHandler(
  async (_request, { user, params }) =>
    ClassInsightsService.getStudentInsight(params!.id, params!.userId, { id: user!.id, role: user!.role }),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
