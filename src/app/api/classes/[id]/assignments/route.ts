import { z } from 'zod';
import { createApiHandler } from '../../../../../lib/api-handler';
import { ClassService } from '../../../../../services/class.service';

const assignSchema = z.object({
  lessonId: z.string().trim().min(1, 'Choose a lesson.'),
  dueAt: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Due date is not a valid date.'),
});

/** Assigns a published lesson to the whole class, optionally with a due date. */
export const POST = createApiHandler<unknown, z.infer<typeof assignSchema>>(
  async (_request, { user, params, body }) => {
    const assignment = await ClassService.assignLesson(
      params!.id,
      { id: user!.id, role: user!.role },
      body.lessonId,
      body.dueAt ? new Date(body.dueAt) : null,
    );
    return { assignment };
  },
  { requireAuth: true, allowedRoles: ['TEACHER', 'ADMIN'], bodySchema: assignSchema, successStatus: 201 },
);
