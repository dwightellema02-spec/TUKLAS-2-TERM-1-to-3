import { createApiHandler } from '../../../../../lib/api-handler';
import { CurriculumService } from '../../../../../services/curriculum.service';
import { ValidationError } from '../../../../../lib/errors';

export const GET = createApiHandler(
  async (_req, { params, user }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Term ID is required.');
    const term = await CurriculumService.getTermById(id, user?.role, user?.id);
    return { term };
  },
  { requireAuth: true },
);
