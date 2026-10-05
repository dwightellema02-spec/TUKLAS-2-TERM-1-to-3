import { createApiHandler } from '../../../../../../lib/api-handler';
import { PracticeAuthoringService, practiceQuestionSchema, type PracticeQuestionInput } from '../../../../../../services/practice-authoring.service';

/** Replace one practice question. */
export const PUT = createApiHandler<unknown, PracticeQuestionInput>(
  async (_request, { user, params, body }) => PracticeAuthoringService.update(params!.id, params!.questionId, user!, body),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'], bodySchema: practiceQuestionSchema },
);

/** Remove one practice question (students' earlier practice copies are kept). */
export const DELETE = createApiHandler(
  async (_request, { user, params }) => {
    await PracticeAuthoringService.remove(params!.id, params!.questionId, user!);
    return { removed: true };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
