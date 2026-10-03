import { z } from 'zod';
import { createApiHandler } from '../../../../../lib/api-handler';
import { ClassService } from '../../../../../services/class.service';

const addSchema = z.object({ email: z.string().trim().email('Enter a valid email address.') });

/** Adds an existing student account to the class by email. */
export const POST = createApiHandler<unknown, z.infer<typeof addSchema>>(
  async (_request, { user, params, body }) => {
    const student = await ClassService.addMemberByEmail(
      params!.id,
      { id: user!.id, role: user!.role },
      body.email,
    );
    return { student };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'], bodySchema: addSchema, successStatus: 201 },
);
