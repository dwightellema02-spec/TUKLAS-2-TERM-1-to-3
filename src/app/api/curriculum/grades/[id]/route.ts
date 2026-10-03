import { createApiHandler } from '../../../../../lib/api-handler';
import { CurriculumService } from '../../../../../services/curriculum.service';
import { ValidationError } from '../../../../../lib/errors';

export const GET = createApiHandler(
  async (_req, { params }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Grade level ID is required.');
    const grade = await CurriculumService.getGradeById(id);
    return { grade };
  },
  { requireAuth: true },
);
