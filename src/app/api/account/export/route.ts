import { createApiHandler } from '../../../../lib/api-handler';
import { AccountService } from '../../../../services/account.service';

/** Download everything Tuklas stores about the signed-in person. */
export const GET = createApiHandler(async (_request, { user }) => AccountService.exportData(user!), { requireAuth: true });
