import { createApiHandler } from '../../../../../lib/api-handler';
import { ClassService } from '../../../../../services/class.service';

/** Rotates the join code: the old code stops working immediately. */
export const POST = createApiHandler(
  async (_request, { user, params }) => {
    const updated = await ClassService.rotateJoinCode(params!.id, { id: user!.id, role: user!.role });
    return { class: updated };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);

/** Closes joining: no code works until a new one is generated. */
export const DELETE = createApiHandler(
  async (_request, { user, params }) => {
    const updated = await ClassService.closeJoining(params!.id, { id: user!.id, role: user!.role });
    return { class: updated };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);
