import { z } from 'zod';
import { createApiHandler } from '../../../../../lib/api-handler';
import { ValidationError } from '../../../../../lib/errors';
import { AdminService } from '../../../../../services/admin.service';

const updateSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(['TEACHER', 'STUDENT']).optional(),
  })
  .refine((value) => value.isActive !== undefined || value.role !== undefined, 'Nothing to update.');

/** Deactivate/reactivate an account or change its role (teacher/student only). */
export const PATCH = createApiHandler<unknown, z.infer<typeof updateSchema>>(
  async (_request, { user, params, body }) => {
    const actor = { id: user!.id };
    let updated;
    if (body.role !== undefined) updated = await AdminService.setRole(actor, params!.id, body.role);
    if (body.isActive !== undefined) updated = await AdminService.setActive(actor, params!.id, body.isActive);
    if (!updated) throw new ValidationError('Nothing to update.');
    return { user: updated };
  },
  { requireAuth: true, allowedRoles: ['ADMIN'], bodySchema: updateSchema },
);
