import { createApiHandler } from '../../../../../lib/api-handler';
import { CurriculumService } from '../../../../../services/curriculum.service';
import {
  subjectUpdateSchema,
  SubjectUpdateInput,
} from '../../../../../server/validation';
import { ValidationError } from '../../../../../lib/errors';

export const GET = createApiHandler(
  async (_req, { params }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Subject ID is required.');
    const subject = await CurriculumService.getSubjectById(id);
    return { subject };
  },
  { requireAuth: true },
);

export const PATCH = createApiHandler<unknown, SubjectUpdateInput>(
  async (_req, { params, body }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Subject ID is required.');
    const subject = await CurriculumService.updateSubject(id, body);
    return { subject };
  },
  {
    requireAuth: true,
    allowedRoles: ['ADMIN'],
    bodySchema: subjectUpdateSchema,
  },
);
