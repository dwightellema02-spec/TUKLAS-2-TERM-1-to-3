/**
 * Tuklas 2.0 — Assessment Submission Endpoint
 *
 * POST /api/assessments/[id]/submit
 *
 * Evaluates student answers authoritatively on the server, creates attempt
 * and mistake records, and updates lesson progress in a transaction.
 */

import { z } from 'zod';
import { createApiHandler } from '../../../../../lib/api-handler';
import { AssessmentService } from '../../../../../services/assessment.service';

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1, 'Question ID is required.'),
      selectedIndex: z.number().int().optional(),
      textAnswer: z.string().optional(),
      numericAnswer: z.number().optional(),
    }),
  ).min(1, 'At least one answer must be submitted.'),
});

type SubmitBody = z.infer<typeof submitSchema>;

export const POST = createApiHandler<unknown, SubmitBody>(
  async (_req, ctx) => {
    const assessmentId = ctx.params?.id ?? '';
    const studentId = ctx.user!.id;

    const result = await AssessmentService.submitAssessment(
      assessmentId,
      studentId,
      ctx.body,
    );

    return { result };
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
    bodySchema: submitSchema,
  },
);
