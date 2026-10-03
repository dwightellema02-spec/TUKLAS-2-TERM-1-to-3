/**
 * Tuklas 2.0 — Mistake Resolution Endpoint
 *
 * POST /api/mistakes/[id]/resolve
 *
 * Marks a student mistake as resolved following review or remediation.
 */

import { createApiHandler } from '../../../../../lib/api-handler';
import { MistakeService } from '../../../../../services/mistake.service';

export const POST = createApiHandler(
  async (_req, ctx) => {
    const mistakeId = ctx.params?.id ?? '';
    const studentId = ctx.user!.id;

    const resolvedMistake = await MistakeService.resolveMistake(mistakeId, studentId);
    return { mistake: resolvedMistake };
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
  },
);
