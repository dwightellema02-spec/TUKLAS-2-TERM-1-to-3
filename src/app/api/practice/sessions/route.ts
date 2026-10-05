import { z } from 'zod';
import { db } from '../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../server/auth';
import { PracticeService } from '../../../../services/practice.service';
import { AppError } from '../../../../lib/errors';

/** Practice from the lesson's own question bank (works without an AI key). */
const lessonBankSchema = z.object({
  source: z.literal('LESSON_BANK'),
  lessonId: z.string().trim().min(1),
  /** Focus the session on one skill of the lesson (targeted practice). */
  skillId: z.string().trim().min(1).optional(),
  total: z.number().int().positive().max(50).default(10),
});

/** AI-generated practice: questions are generated one at a time afterwards. */
const aiSessionSchema = z.object({
  source: z.literal('AI').optional(),
  lessonId: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(200),
  difficulty: z.string().trim().min(1).max(50),
  type: z.enum(['PRACTICE', 'LESSON_QUIZ']).optional(),
  total: z.number().int().positive().max(200),
});

const sessionSchema = z.union([lessonBankSchema, aiSessionSchema]);

async function currentStudent(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { ok: false as const, response: jsonError('Authentication required.', 401) };
  }

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'STUDENT') {
    return {
      ok: false as const,
      response: jsonError('Only students can use practice sessions.', 403),
    };
  }
  return { ok: true as const, user };
}

export async function GET(request: Request) {
  const auth = await currentStudent(request);
  if (!auth.ok) return auth.response;

  const sessions = await PracticeService.listRecentSessions(auth.user.id, 10);
  return jsonSuccess({ sessions });
}

export async function POST(request: Request) {
  const auth = await currentStudent(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const body = await request.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid practice session payload.',
        400,
      );
    }

    if (parsed.data.source === 'LESSON_BANK') {
      const practiceSession = await PracticeService.startLessonBankSession(user.id, {
        lessonId: parsed.data.lessonId,
        skillId: parsed.data.skillId,
        total: parsed.data.total,
      });
      return jsonSuccess({ session: practiceSession }, 201);
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
