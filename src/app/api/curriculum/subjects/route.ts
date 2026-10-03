import { createApiHandler } from '../../../../lib/api-handler';
import { CurriculumService } from '../../../../services/curriculum.service';
import {
  subjectCreateSchema,
  SubjectCreateInput,
} from '../../../../server/validation';

export const GET = createApiHandler(
  async () => {
    const subjects = await CurriculumService.listSubjects();
    return { subjects };
  },
  { requireAuth: true },
);

export const POST = createApiHandler<unknown, SubjectCreateInput>(
  async (_req, { body }) => {
    const subject = await CurriculumService.createSubject(body);
    return { subject };
  },
  {
    requireAuth: true,
    allowedRoles: ['ADMIN'],
    bodySchema: subjectCreateSchema,
    successStatus: 201,
  },
);
