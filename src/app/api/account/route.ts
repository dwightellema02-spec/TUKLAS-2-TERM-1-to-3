import { z } from 'zod';
import { createApiHandler } from '../../../lib/api-handler';
import { AccountService } from '../../../services/account.service';

const deleteSchema = z.object({ password: z.string().min(1).max(200), confirm: z.string().max(20) });

/** A student deletes their own account and learning records (password and the word DELETE required). */
export const DELETE = createApiHandler<unknown, z.infer<typeof deleteSchema>>(
  async (_request, { user, body }) => {
    await AccountService.deleteStudentAccount(user!, body);
    return { deleted: true };
  },
  { requireAuth: true, bodySchema: deleteSchema },
);
