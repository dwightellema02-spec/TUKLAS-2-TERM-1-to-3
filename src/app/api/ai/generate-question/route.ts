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
import { generatedPracticeQuestionSchema } from '../../../../server/ai-validation';

const inputSchema = z.object({
  sessionId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(200),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  questionNumber: z.number().int().positive().max(200),
  total: z.number().int().positive().max(200),
  priorQuestions: z
    .array(z.string().trim().min(1).max(2_000))
    .max(10)
    .default([]),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'STUDENT')
    return jsonError('Only students can generate practice questions.', 403);

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid question input.',
        400,
      );

    const practiceSession = await db.practiceSession.findFirst({
      where: {
        id: parsed.data.sessionId,
        studentId: user.id,
        completedAt: null,
      },
      select: { id: true, total: true },
    });
    if (!practiceSession) return jsonError('Practice session not found.', 404);

    const questionCount = await db.practiceQuestion.count({
      where: { sessionId: practiceSession.id },
    });
    if (
      questionCount >= practiceSession.total ||
      parsed.data.questionNumber > practiceSession.total
    ) {
      return jsonError('This practice session already has all questions.', 409);
    }

    enforceAiRateLimit(`${user.id}:question-generation`, 20);
    const result = await requestAiText({
      system: `You are the Tuklas Question Generator. Return strict JSON only in this shape: {"type":"multiple_choice","question":"","options":["A","B","C","D"],"correctIndex":0,"explanation":"","skill":"","learningObjective":"","difficulty":"Easy|Medium|Hard"}. Generate one age-appropriate question about the requested subject and topic. Do not repeat prior questions or introduce unrelated concepts.`,
      user: `Subject: ${parsed.data.subject}\nTopic: ${parsed.data.topic}\nDifficulty: ${parsed.data.difficulty}\nQuestion ${parsed.data.questionNumber} of ${parsed.data.total}.\nPrior questions:\n${parsed.data.priorQuestions.join('\n---\n') || 'None'}`,
      maxTokens: 700,
      responseSchema: generatedPracticeQuestionSchema,
    });

    const question = await db.practiceQuestion.create({
      data: {
        sessionId: practiceSession.id,
        question: result.question,
        options: result.options,
        correctIndex: result.correctIndex,
        explanation: result.explanation,
        skill: result.skill,
        learningObjective: result.learningObjective,
        difficulty: result.difficulty,
      },
    });

    return jsonSuccess({
      question: {
        id: question.id,
        type: result.type,
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        skill: question.skill,
        learningObjective: question.learningObjective,
        difficulty: question.difficulty,
      },
    });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
