import { createApiHandler } from '../../../../lib/api-handler';
import { LessonService } from '../../../../services/lesson.service';
import { lessonReorderSchema } from '../../../../server/validation';
import { z } from 'zod';
import { UserRole } from '../../../../types/domain';

type LessonReorderInput = z.infer<typeof lessonReorderSchema>;

export const POST = createApiHandler<unknown, LessonReorderInput>(
  async (_req, { body, user }) => {
    const lessons = await LessonService.reorderLessons(
      body.unitId,
      body.lessonIds,
      {
        id: user!.id,
        role: user!.role as UserRole,
      },
    );
    return { lessons };
  },
  {
    requireAuth: true,
    allowedRoles: ['TEACHER', 'ADMIN'],
    bodySchema: lessonReorderSchema,
  },
);
