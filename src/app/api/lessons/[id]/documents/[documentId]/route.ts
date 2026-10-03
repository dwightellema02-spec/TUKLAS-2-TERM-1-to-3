import { createApiHandler } from '../../../../../../lib/api-handler';
import { DocumentService } from '../../../../../../services/document.service';

export const DELETE = createApiHandler(
  async (_request, { user, params }) => {
    await DocumentService.remove(params!.id, params!.documentId, user!);
    return { removed: true };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
