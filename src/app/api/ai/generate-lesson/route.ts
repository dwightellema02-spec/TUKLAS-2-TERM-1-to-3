import { z } from 'zod';
import { db } from '../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../server/auth';
import {
  aiErrorResponse,
  enforceAiRateLimit,
  requestAiText,
} from '../../../../server/ai';
import {
  generatedLessonSchema,
  transcriptAnalysisSchema,
} from '../../../../server/ai-validation';

const inputSchema = z.object({
  transcript: z.string().trim().min(20).max(100_000),
  analysis: transcriptAnalysisSchema,
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true },
  });
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
    return jsonError('You are not authorized to generate lessons.', 403);
  }

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid lesson generation input.',
        400,
      );

    enforceAiRateLimit(`${user.id}:lesson-generation`, 5);
    const result = await requestAiText({
      system: `You are the Tuklas Lesson Generator. Return strict JSON only with title, subject, gradeLevel, estimatedMinutes, objectives, vocabulary, sections, checks, commonMistakes, keyTakeaways, and quiz. Include zero-based position values on every section, check, and quiz item so the draft can be reviewed and submitted to the lesson API. Use sourceExplanation only for claims grounded in the transcript. Put additional explanations only in aiExplanation. Each check and quiz item must have exactly four options and a valid correctIndex. Create 3-4 sections, 2-3 checks, and 4 quiz questions.`,
      user: `Transcript:\n${parsed.data.transcript}\n\nPrior transcript analysis JSON:\n${JSON.stringify(parsed.data.analysis)}`,
      maxTokens: 3_500,
      responseSchema: generatedLessonSchema,
    });

    return jsonSuccess({ lesson: result, requiresTeacherReview: true });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
