/**
 * Tuklas 2.0 — Student Mistakes Endpoint
 *
 * GET /api/mistakes
 *
 * Returns student-specific diagnostic mistake records for targeted practice and review.
 */

import { createApiHandler } from '../../../lib/api-handler';
import { MistakeService } from '../../../services/mistake.service';

export const GET = createApiHandler(
  async (req, ctx) => {
    const studentId = ctx.user!.id;
    const { searchParams } = new URL(req.url);

    const lessonId = searchParams.get('lessonId') ?? undefined;
    const resolvedParam = searchParams.get('resolved');
    const resolved =
      resolvedParam === 'true' ? true : resolvedParam === 'false' ? false : undefined;

    const mistakes = await MistakeService.getStudentMistakes(studentId, {
      lessonId,
      resolved,
    });

    return { mistakes };
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
  },
);
