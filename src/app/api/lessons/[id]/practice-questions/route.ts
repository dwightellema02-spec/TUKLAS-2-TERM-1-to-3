import { createApiHandler } from '../../../../../lib/api-handler';
import { PracticeAuthoringService, practiceQuestionSchema, type PracticeQuestionInput } from '../../../../../services/practice-authoring.service';

/** The lesson's practice bank, with answers (the lesson's author or an administrator only). */
export const GET = createApiHandler(
  async (_request, { user, params }) => ({ questions: await PracticeAuthoringService.list(params!.id, user!) }),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);

/** Add a practice question to the lesson's bank. */
export const POST = createApiHandler<unknown, PracticeQuestionInput>(
  async (_request, { user, params, body }) => PracticeAuthoringService.create(params!.id, user!, body),
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'], bodySchema: practiceQuestionSchema, successStatus: 201 },
);
