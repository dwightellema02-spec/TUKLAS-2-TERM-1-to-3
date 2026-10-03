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

const inputSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
    selectedIndex: z.number().int().nonnegative(),
    topic: z.string().trim().min(1).max(200),
  })
  .superRefine((value, context) => {
    if (value.correctIndex >= value.options.length)
      context.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'correctIndex must reference an option',
      });
    if (value.selectedIndex >= value.options.length)
      context.addIssue({
        code: 'custom',
        path: ['selectedIndex'],
        message: 'selectedIndex must reference an option',
      });
    if (value.correctIndex === value.selectedIndex)
      context.addIssue({
        code: 'custom',
        path: ['selectedIndex'],
        message: 'Mistake analysis requires an incorrect answer',
      });
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
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid mistake analysis input.',
        400,
      );

    enforceAiRateLimit(`${user.id}:mistake-analysis`, 20);
    const result = await requestAiText({
      system: `You are the Tuklas Mistake Analyzer. Return strict JSON only: {"understood":"","misunderstood":"","misconception":"","simpleExplanation":""}. Diagnose supportively and briefly. Do not shame the student or claim certainty about their mental state.`,
      user: `Topic: ${parsed.data.topic}\nQuestion: ${parsed.data.question}\nOptions: ${parsed.data.options.join(' | ')}\nCorrect answer: ${parsed.data.options[parsed.data.correctIndex]}\nStudent answer: ${parsed.data.options[parsed.data.selectedIndex]}`,
      maxTokens: 500,
      responseSchema: mistakeAnalysisSchema,
    });

    return jsonSuccess({ analysis: result });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
