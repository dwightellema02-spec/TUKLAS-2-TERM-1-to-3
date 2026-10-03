import { z } from 'zod';
import { db } from '../../../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../../../server/auth';
import { PracticeService } from '../../../../../../services/practice.service';
import { AppError } from '../../../../../../lib/errors';

const answerSchema = z.object({
  questionId: z.string().trim().min(1),
  selectedIndex: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  context?: { params?: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const currentUser = await db.user.findUnique({ where: { id: session.sub } });
  if (!currentUser || currentUser.role !== 'STUDENT') {
    return jsonError('Only students can submit practice answers.', 403);
  }

  try {
    const body = await request.json();
    const parsed = answerSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid answer payload.',
        400,
      );
    }

    const resolvedParams = context?.params ? await context.params : null;
    const id =
      resolvedParams?.id ??
      new URL(request.url).pathname.split('/').filter(Boolean).at(-2) ??
      '';

    const result = await PracticeService.submitAnswer(
      currentUser.id,
      id,
      parsed.data.questionId,
      parsed.data.selectedIndex,
    );

    return jsonSuccess({ answer: result.answer, session: result.session });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to submit answer at this time.', 500);
  }
}
