import { z } from 'zod';
import { db } from '../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../server/auth';
import { PracticeService } from '../../../../services/practice.service';
import { AppError } from '../../../../lib/errors';

const sessionSchema = z.object({
  lessonId: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(200),
  difficulty: z.string().trim().min(1).max(50),
  type: z.enum(['PRACTICE', 'LESSON_QUIZ']).optional(),
  total: z.number().int().positive().max(200),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'STUDENT') {
    return jsonError('Only students can start practice sessions.', 403);
  }

  try {
    const body = await request.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid practice session payload.',
        400,
      );
    }

    const practiceSession = await PracticeService.startSession(
      user.id,
      parsed.data,
    );
    return jsonSuccess({ session: practiceSession }, 201);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to create practice session at this time.', 500);
  }
}
