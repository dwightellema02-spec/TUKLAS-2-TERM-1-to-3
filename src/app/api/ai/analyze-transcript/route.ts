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
import { transcriptAnalysisSchema } from '../../../../server/ai-validation';
import { z } from 'zod';

const inputSchema = z.object({
  sourceTitle: z.string().trim().max(500).optional(),
  transcript: z.string().trim().min(20).max(100_000),
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true },
  });
  if (!user) return jsonError('Authentication required.', 401);
  // Teacher tooling only: a student must not be able to use this as a general AI endpoint (up to 100,000 characters of input).
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('Only teachers can analyze transcripts.', 403);
  }

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid transcript input.',
        400,
      );

    enforceAiRateLimit(`${user.id}:transcript-analysis`);
    const result = await requestAiText({
      system: `You are the Tuklas Video Analyzer. You only have transcript text, never claim to see video or visual content. Return strict JSON only with this shape: {"subject":"","gradeLevel":"","mainTopic":"","subtopics":[""],"learningObjectives":[""],"keyConcepts":[""],"vocabulary":[{"term":"","definition":""}],"examplesFromSource":[""],"proceduresOrFormulas":[""],"possibleMisconceptions":[""],"estimatedGradeConfidence":"high|medium|low"}. Base every claim on the transcript. Keep lists concise.`,
      user: `Video title: ${parsed.data.sourceTitle ?? 'Unknown'}\n\nTranscript:\n${parsed.data.transcript}`,
      maxTokens: 1_500,
      responseSchema: transcriptAnalysisSchema,
    });

    return jsonSuccess({ analysis: result });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
