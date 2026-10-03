import { z } from 'zod';
import { createApiHandler } from '../../../../lib/api-handler';
import { enforceAiRateLimit } from '../../../../server/ai';
import { TutorService } from '../../../../services/tutor.service';

const helpSchema = z.object({
  message: z.string().trim().min(1, 'Write a message first.').max(1_000, 'Please keep your message under 1000 characters.'),
  conversationId: z.string().trim().min(1).optional(),
  lessonId: z.string().trim().min(1).optional(),
  practiceQuestionId: z.string().trim().min(1).optional(),
});

/**
 * The student's existing conversation for a question or lesson (so a refresh keeps context),
 * plus whether the AI is currently available.
 */
export const GET = createApiHandler(
  async (request, { user }) => {
    const params = new URL(request.url).searchParams;
    return TutorService.getConversation(user!.id, {
      practiceQuestionId: params.get('practiceQuestionId') ?? undefined,
      lessonId: params.get('lessonId') ?? undefined,
    });
  },
  { requireAuth: true, allowedRoles: ['STUDENT'] },
);

/**
 * Ask Tuklas for help. The reply is either from the AI (labelled "AI") or, when the AI is
 * unavailable or its answer fails the safety checks, an automatic hint (labelled as such).
 */
export const POST = createApiHandler<unknown, z.infer<typeof helpSchema>>(
  async (_request, { user, body }) => {
    enforceAiRateLimit(`${user!.id}:tutor`, 30);
    return TutorService.help(user!.id, body);
  },
  { requireAuth: true, allowedRoles: ['STUDENT'], bodySchema: helpSchema },
);
