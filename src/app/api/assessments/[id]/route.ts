/**
 * Tuklas 2.0 — Assessment Details Endpoint
 *
 * GET /api/assessments/[id]
 *
 * Returns assessment metadata and questions.
 * Anti-cheating guard: Students receive safe projections without answers or explanations.
 */

import { createApiHandler } from '../../../../lib/api-handler';
import { AssessmentService } from '../../../../services/assessment.service';
import { UserRole } from '../../../../types/domain';

export const GET = createApiHandler(
  async (_req, ctx) => {
    const assessmentId = ctx.params?.id ?? '';
    const role = (ctx.user?.role ?? 'STUDENT') as UserRole;

    const assessment = await AssessmentService.getAssessmentById(assessmentId, role);
    return { assessment };
  },
  { requireAuth: true },
);
