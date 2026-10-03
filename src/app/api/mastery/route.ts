import { createApiHandler } from '../../../lib/api-handler';
import { SkillMasteryService } from '../../../services/skill-mastery.service';

/**
 * The signed-in student's skill mastery, with the evidence-based explanation.
 *
 * - without `lessonId`: every skill the student has been assessed on
 * - with `lessonId`: every skill of that lesson (including ones not started) plus the
 *   recommended next step
 *
 * Read-only: levels are computed from recorded answers and cannot be set by a client.
 */
export const GET = createApiHandler(
  async (request, { user }) => {
    const lessonId = new URL(request.url).searchParams.get('lessonId') ?? undefined;
    if (lessonId) {
      return SkillMasteryService.lessonPicture(user!.id, lessonId);
    }
    const skills = await SkillMasteryService.listForStudent(user!.id);
    return { skills };
  },
  { requireAuth: true, allowedRoles: ['STUDENT'] },
);
