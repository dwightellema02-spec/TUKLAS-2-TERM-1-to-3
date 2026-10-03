import { db } from '../../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../../server/auth';
import { lessonProgressSchema } from '../../../../../server/validation';
import { LessonService } from '../../../../../services/lesson.service';
import { AppError } from '../../../../../lib/errors';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'STUDENT') {
    return jsonError('Only students can access lesson progress.', 403);
  }

  const { id: lessonId } = await context.params;
  const progress = await LessonService.getProgress(lessonId, user.id);
  return jsonSuccess({ progress });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'STUDENT') {
    return jsonError('Only students can update lesson progress.', 403);
  }

  const { id: lessonId } = await context.params;

  try {
    const parsed = lessonProgressSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid lesson progress.',
        400,
      );
    }

    const progress = await LessonService.updateProgress(
      lessonId,
      user.id,
      parsed.data.status,
    );

    return jsonSuccess({ progress });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to update lesson progress at this time.', 500);
  }
}
