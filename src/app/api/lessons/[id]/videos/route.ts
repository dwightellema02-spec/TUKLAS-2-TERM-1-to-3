import { db } from '../../../../../server/db';
import { getSessionFromRequest, jsonError, jsonSuccess } from '../../../../../server/auth';
import { LessonService } from '../../../../../services/lesson.service';
import { videoAttachmentSchema } from '../../../../../server/validation';
import { AppError } from '../../../../../lib/errors';
import { UserRole } from '../../../../../types/domain';

export async function POST(
  request: Request,
  context?: { params?: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to attach videos.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId =
      resolvedParams?.id ??
      new URL(request.url).pathname.split('/').filter(Boolean).at(-2) ??
      '';

    const body = await request.json();
    const parsed = videoAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid video data.', 400);
    }

    const video = await LessonService.attachVideo(lessonId, parsed.data, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess({ video }, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to attach video at this time.', 500);
  }
}
