import { db } from '../../../../../../server/db';
import { getSessionFromRequest, jsonError, jsonSuccess } from '../../../../../../server/auth';
import { LessonService } from '../../../../../../services/lesson.service';
import { sectionSchema } from '../../../../../../server/validation';
import { AppError } from '../../../../../../lib/errors';
import { UserRole } from '../../../../../../types/domain';

export async function PATCH(
  request: Request,
  context?: { params?: Promise<{ id: string; sectionId: string }> | { id: string; sectionId: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to update sections.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId = resolvedParams?.id ?? '';
    const sectionId = resolvedParams?.sectionId ?? '';

    const body = await request.json();
    const parsed = sectionSchema.partial().safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid section update data.', 400);
    }

    const section = await LessonService.updateSection(lessonId, sectionId, parsed.data, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess({ section });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to update section at this time.', 500);
  }
}

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string; sectionId: string }> | { id: string; sectionId: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to delete sections.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId = resolvedParams?.id ?? '';
    const sectionId = resolvedParams?.sectionId ?? '';

    const result = await LessonService.deleteSection(lessonId, sectionId, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess(result);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to delete section at this time.', 500);
  }
}
