import { db } from '../../../server/db';
import { lessonCreateSchema } from '../../../server/validation';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../server/auth';
import { LessonService } from '../../../services/lesson.service';
import { UserRole } from '../../../types/domain';
import { AppError } from '../../../lib/errors';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  try {
    const user = await db.user.findUnique({ where: { id: session.sub } });
    if (!user) {
      return jsonError('Authentication required.', 401);
    }

    const url = new URL(request.url);
    const subject = url.searchParams.get('subject')?.trim();
    const lessons = await LessonService.listLessons(
      user.role as UserRole,
      user.id,
      subject,
    );

    return jsonSuccess({ lessons });
  } catch {
    return jsonError('Unable to load lessons at this time.', 500);
  }
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
    return jsonError('You are not authorized to create lessons.', 403);
  }

  try {
    const body = await request.json();
    const parsed = lessonCreateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid lesson payload.',
        400,
      );
    }

    const lesson = await LessonService.createLesson(parsed.data, user.id);
    return jsonSuccess({ lesson }, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to create lesson at this time.', 500);
  }
}
