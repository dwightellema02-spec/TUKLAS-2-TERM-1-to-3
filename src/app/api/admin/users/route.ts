import { z } from 'zod';
import { createApiHandler } from '../../../../lib/api-handler';
import { AdminService } from '../../../../services/admin.service';

const createSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  displayName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  role: z.enum(['TEACHER', 'STUDENT']),
  password: z.string().min(1, 'A temporary password is required.').max(128),
});

export const GET = createApiHandler(
  async (request) => {
    const params = new URL(request.url).searchParams;
    const users = await AdminService.listUsers({
      role: params.get('role') ?? undefined,
      query: params.get('q') ?? undefined,
    });
    return { users };
  },
  { requireAuth: true, allowedRoles: ['ADMIN'] },
);

/** Creates a teacher or student account with a temporary password the admin hands over. */
export const POST = createApiHandler<unknown, z.infer<typeof createSchema>>(
  async (_request, { user, body }) => ({ user: await AdminService.createUser({ id: user!.id }, body) }),
  { requireAuth: true, allowedRoles: ['ADMIN'], bodySchema: createSchema, successStatus: 201 },
);
