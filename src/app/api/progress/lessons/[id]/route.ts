/**
 * Tuklas 2.0 — Lesson Progress Detail Endpoint
 *
 * GET /api/progress/lessons/[id]
 *
 * Retrieves progress, attempt history, and scores for a specific lesson.
 */

import { createApiHandler } from '../../../../../lib/api-handler';
import { ProgressService } from '../../../../../services/progress.service';
import { NotFoundError } from '../../../../../lib/errors';

export const GET = createApiHandler(
  async (_req, ctx) => {
    const lessonId = ctx.params?.id ?? '';
    const studentId = ctx.user!.id;

    const progress = await ProgressService.getStudentProgress(studentId, lessonId);
    if (!progress) {
      throw new NotFoundError(`No progress record found for lesson "${lessonId}".`);
    }

    return { progress };
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
  },
);
