import { z } from 'zod';
import { createApiHandler } from '../../../../../../lib/api-handler';
import { AdminService } from '../../../../../../services/admin.service';

const passwordSchema = z.object({ password: z.string().min(1, 'A new password is required.').max(128) });

/** Sets a new password and ends all of the user's sessions. */
export const POST = createApiHandler<unknown, z.infer<typeof passwordSchema>>(
  async (_request, { user, params, body }) => {
    await AdminService.resetPassword({ id: user!.id }, params!.id, body.password);
    return { reset: true };
  },
  { requireAuth: true, allowedRoles: ['ADMIN'], bodySchema: passwordSchema },
);
