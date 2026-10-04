import { createApiHandler } from '../../../../../lib/api-handler';
import { ClassInsightsService } from '../../../../../services/class-insights.service';

/** Class-level analytics for the class's teacher (or an admin): skills, hard questions, mistakes, activity. */
export const GET = createApiHandler(
  async (_request, { user, params }) => ClassInsightsService.getClassInsights(params!.id, { id: user!.id, role: user!.role }),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
