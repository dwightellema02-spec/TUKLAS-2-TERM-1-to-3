import { createApiHandler } from '../../../../lib/api-handler';
import { CurriculumService } from '../../../../services/curriculum.service';
import { unitCreateSchema, UnitCreateInput } from '../../../../server/validation';

export const POST = createApiHandler<unknown, UnitCreateInput>(
  async (_req, { body }) => {
    const unit = await CurriculumService.createUnit(body);
    return { unit };
  },
  {
    requireAuth: true,
    allowedRoles: ['TEACHER', 'ADMIN'],
    bodySchema: unitCreateSchema,
    successStatus: 201,
  },
);
