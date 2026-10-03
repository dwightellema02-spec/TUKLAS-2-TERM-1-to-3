import { z } from 'zod';
import { createApiHandler } from '../../../../lib/api-handler';
import { enforceRateLimit, getRequestAddress } from '../../../../server/rate-limit';
import { ClassService } from '../../../../services/class.service';

const joinSchema = z.object({
  code: z.string().trim().min(4, 'Enter the join code your teacher gave you.').max(20),
});

/**
 * A student joins a class with its code. Guessing codes is throttled per student and per
 * address; invalid, rotated and closed codes are indistinguishable.
 */
export const POST = createApiHandler<unknown, z.infer<typeof joinSchema>>(
  async (request, { user, body }) => {
    enforceRateLimit(`join:${user!.id}`, 10);
    enforceRateLimit(`join-ip:${getRequestAddress(request)}`, 60);
    return ClassService.joinByCode(user!.id, body.code);
  },
  { requireAuth: true, allowedRoles: ['STUDENT'], bodySchema: joinSchema },
);
