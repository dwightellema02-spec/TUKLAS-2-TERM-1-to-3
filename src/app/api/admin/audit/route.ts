import { createApiHandler } from '../../../../lib/api-handler';
import { AdminService } from '../../../../services/admin.service';

/** Recent admin actions (who did what to whom). */
export const GET = createApiHandler(
  async () => ({ entries: await AdminService.listAudit(50) }),
  { requireAuth: true, allowedRoles: ['ADMIN'] },
);
