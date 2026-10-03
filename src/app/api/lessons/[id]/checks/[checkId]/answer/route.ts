import { z } from 'zod';
import { createApiHandler } from '../../../../../../../lib/api-handler';
import { enforceRateLimit } from '../../../../../../../server/rate-limit';
import { LessonService } from '../../../../../../../services/lesson.service';

const checkAnswerSchema = z
  .object({
    selectedIndex: z.number().int().min(0).max(50).optional(),
    answer: z.string().max(200).optional(),
  })
  .refine(
    (value) => value.selectedIndex !== undefined || value.answer !== undefined,
    'Provide selectedIndex or answer.',
  );

type CheckAnswerBody = z.infer<typeof checkAnswerSchema>;

/**
 * Students submit an answer to a lesson knowledge check. The server grades it from the
 * stored key, records the attempt, and tells the student whether it was correct.
 */
export const POST = createApiHandler<unknown, CheckAnswerBody>(
  async (_request, { user, params, body }) => {
    const studentId = user!.id;
    enforceRateLimit(`check-answer:${studentId}`, 120);
    return LessonService.submitCheckAnswer(
      params!.id,
      params!.checkId,
      studentId,
      body,
    );
  },
  {
    requireAuth: true,
    allowedRoles: ['STUDENT'],
    bodySchema: checkAnswerSchema,
  },
);
