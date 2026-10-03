import { createApiHandler } from '../../../../../lib/api-handler';
import { CurriculumService } from '../../../../../services/curriculum.service';
import { unitReorderSchema } from '../../../../../server/validation';
import { z } from 'zod';

type UnitReorderInput = z.infer<typeof unitReorderSchema>;

export const POST = createApiHandler<unknown, UnitReorderInput>(
  async (_req, { body }) => {
    const units = await CurriculumService.reorderUnits(body.termId, body.unitIds);
    return { units };
  },
  {
    requireAuth: true,
    allowedRoles: ['TEACHER', 'ADMIN'],
    bodySchema: unitReorderSchema,
  },
);
