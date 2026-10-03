import { db } from '../../../../../../server/db';
import { getSessionFromRequest, jsonError, jsonSuccess } from '../../../../../../server/auth';
import { LessonService } from '../../../../../../services/lesson.service';
import { formativeCheckSchema } from '../../../../../../server/validation';
import { AppError } from '../../../../../../lib/errors';
import { UserRole } from '../../../../../../types/domain';

export async function PATCH(
  request: Request,
  context?: { params?: Promise<{ id: string; checkId: string }> | { id: string; checkId: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to update formative checks.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId = resolvedParams?.id ?? '';
    const checkId = resolvedParams?.checkId ?? '';

    const body = await request.json();
    const parsed = formativeCheckSchema.partial().safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid check update data.', 400);
    }

    const check = await LessonService.updateFormativeCheck(lessonId, checkId, parsed.data, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess({ check });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to update formative check at this time.', 500);
  }
}

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string; checkId: string }> | { id: string; checkId: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to delete formative checks.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const lessonId = resolvedParams?.id ?? '';
    const checkId = resolvedParams?.checkId ?? '';

    const result = await LessonService.deleteFormativeCheck(lessonId, checkId, {
      id: user.id,
      role: user.role as UserRole,
    });

    return jsonSuccess(result);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to delete formative check at this time.', 500);
  }
}
