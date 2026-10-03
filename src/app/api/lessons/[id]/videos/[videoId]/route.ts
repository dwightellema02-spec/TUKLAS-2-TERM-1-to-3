import { db } from '../../../../../../server/db';
import { getSessionFromRequest, jsonError, jsonSuccess } from '../../../../../../server/auth';
import { LessonService } from '../../../../../../services/lesson.service';
import { AppError } from '../../../../../../lib/errors';
import { UserRole } from '../../../../../../types/domain';

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string; videoId: string }> | { id: string; videoId: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to remove videos.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId = resolvedParams?.id ?? '';
    const videoId = resolvedParams?.videoId ?? '';

    const result = await LessonService.removeVideo(lessonId, videoId, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess(result);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to remove video at this time.', 500);
  }
}
