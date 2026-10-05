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
import { mistakeAnalysisSchema } from '../../../../server/ai-validation';

/**
 * Mistake analysis is SERVER-AUTHORITATIVE: the caller names one of their own practice questions that they
 * already answered wrongly, and everything the model sees (question, options, the right answer, what the student
 * chose) comes from the database. The caller cannot supply their own text, so this cannot be used as a general
 * AI prompt, and a forged "correct answer" is impossible.
 */
const inputSchema = z.object({
  practiceQuestionId: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'STUDENT')
    return jsonError('Only students can request mistake analysis.', 403);

  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Choose one of your answered practice questions.', 400);

    const row = await db.practiceQuestion.findFirst({
      where: { id: parsed.data.practiceQuestionId, session: { studentId: user.id } },
      include: { answer: true, lesson: { select: { title: true } } },
    });
    if (!row) return jsonError('Question not found.', 404);
    if (!row.answer) return jsonError('Answer the question first.', 409);
    if (row.answer.correct) return jsonError('Mistake analysis is only for incorrect answers.', 409);

    const options = Array.isArray(row.options) ? (row.options as string[]) : [];
    const topic = row.lesson?.title ?? row.skill ?? 'Mathematics';

    enforceAiRateLimit(`${user.id}:mistake-analysis`, 20);
    const result = await requestAiText({
      system: `You are the Tuklas Mistake Analyzer. Return strict JSON only: {"understood":"","misunderstood":"","misconception":"","simpleExplanation":""}. Diagnose supportively and briefly. Do not shame the student or claim certainty about their mental state.`,
      user: `Topic: ${topic}\nQuestion: ${row.question}\nOptions: ${options.join(' | ')}\nCorrect answer: ${options[row.correctIndex]}\nStudent answer: ${options[row.answer.selectedIndex]}`,
      maxTokens: 500,
      responseSchema: mistakeAnalysisSchema,
    });

    return jsonSuccess({ analysis: result });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
