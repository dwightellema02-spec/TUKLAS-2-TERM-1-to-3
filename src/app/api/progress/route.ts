/**
 * Tuklas 2.0 — Student Progress Overview Endpoint
 *
 * GET /api/progress
 *
 * Retrieves progress records, completed lesson counts, and learning activity statistics.
 */

import { createApiHandler } from '../../../lib/api-handler';
import { ProgressService } from '../../../services/progress.service';

export const GET = createApiHandler(
  async (_req, ctx) => {
    const studentId = ctx.user!.id;
    return ProgressService.getStudentProgress(studentId);
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
  },
);
