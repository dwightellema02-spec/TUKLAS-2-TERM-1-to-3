import { createApiHandler } from '../../../../../lib/api-handler';
import { CurriculumService } from '../../../../../services/curriculum.service';
import { unitUpdateSchema, UnitUpdateInput } from '../../../../../server/validation';
import { ValidationError } from '../../../../../lib/errors';

export const GET = createApiHandler(
  async (_req, { params, user }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Unit ID is required.');
    const unit = await CurriculumService.getUnitById(id, user?.role, user?.id);
    return { unit };
  },
  { requireAuth: true },
);

export const PATCH = createApiHandler<unknown, UnitUpdateInput>(
  async (_req, { params, body }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Unit ID is required.');
    const unit = await CurriculumService.updateUnit(id, body);
    return { unit };
  },
  {
    requireAuth: true,
    allowedRoles: ['TEACHER', 'ADMIN'],
    bodySchema: unitUpdateSchema,
  },
);

export const DELETE = createApiHandler(
  async (_req, { params }) => {
    const id = params?.id;
    if (!id) throw new ValidationError('Unit ID is required.');
    const result = await CurriculumService.archiveUnit(id);
    return result;
  },
  {
    requireAuth: true,
    allowedRoles: ['TEACHER', 'ADMIN'],
  },
);
