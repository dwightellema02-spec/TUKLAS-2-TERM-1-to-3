import { z } from 'zod';
import { createApiHandler } from '../../../lib/api-handler';
import { ClassService } from '../../../services/class.service';

const createSchema = z.object({
  name: z.string().trim().min(2, 'Class name must be at least 2 characters.').max(80, 'Class name is too long.'),
});

/** Teachers see their own classes; admins see all. */
export const GET = createApiHandler(
  async (_request, { user }) => {
    const classes = await ClassService.listClasses({ id: user!.id, role: user!.role });
    return { classes };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'] },
);

/** A teacher creates a class and gets a join code for it. */
export const POST = createApiHandler<unknown, z.infer<typeof createSchema>>(
  async (_request, { user, body }) => {
    const created = await ClassService.createClass(user!.id, body.name);
    return { class: created };
  },
  { requireAuth: true, allowedRoles: ['TEACHER'], bodySchema: createSchema, successStatus: 201 },
);
