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

const inputSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  lessonId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).max(2_000),
});

const tutorReplySchema = z.string().trim().min(1).max(4_000);

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true },
  });
  if (!user || user.role !== 'STUDENT')
    return jsonError('Only students can use Ask Tuklas.', 403);

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid tutor input.',
        400,
      );

    const conversation = parsed.data.conversationId
      ? await db.chatConversation.findFirst({
          where: { id: parsed.data.conversationId, studentId: user.id },
          include: {
            lesson: {
              include: { sections: { orderBy: { position: 'asc' }, take: 10 } },
            },
          },
        })
      : null;

    if (parsed.data.conversationId && !conversation) {
      return jsonError('Conversation not found.', 404);
    }

    const lessonId =
      parsed.data.lessonId ?? conversation?.lessonId ?? undefined;
    const lesson = lessonId
      ? await db.lesson.findFirst({
          where: { id: lessonId, status: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            subject: true,
            gradeLevel: true,
            sections: {
              orderBy: { position: 'asc' },
              take: 10,
              select: { heading: true, sourceExplanation: true },
            },
          },
        })
      : null;

    if (lessonId && !lesson) return jsonError('Lesson not found.', 404);

    const messages = conversation
      ? await db.chatMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          take: 8,
        })
      : [];
    const history = messages
      .reverse()
      .map(
        (item) =>
          `${item.role === 'user' ? 'Student' : 'Tuklas'}: ${item.content}`,
      )
      .join('\n');
    const lessonContext = lesson
      ? `Current lesson: ${lesson.title}\nSubject: ${lesson.subject}; Grade: ${lesson.gradeLevel}\nSections:\n${lesson.sections.map((section) => `${section.heading}: ${section.sourceExplanation ?? ''}`).join('\n')}`
      : 'No specific lesson is open. Help as a friendly K-12 tutor without pretending to know unavailable context.';

    enforceAiRateLimit(`${user.id}:tutor`, 30);
    const rawReply = await requestAiText({
      system: `You are Ask Tuklas, a patient K-12 tutor. Prioritize the current lesson, explain rather than blindly provide answers, and use simple language. If asked for Filipino or Taglish, respond naturally while remaining accurate. Keep the response concise, plain text, and non-judgmental.\n${lessonContext}`,
      user: `${history ? `Recent conversation:\n${history}\n\n` : ''}Student: ${parsed.data.message}`,
      maxTokens: 700,
    });
    const reply = tutorReplySchema.safeParse(rawReply);
    if (!reply.success)
      return jsonError('The AI returned an invalid tutor response.', 502);

    const saved = await db.$transaction(async (transaction) => {
      const currentConversation =
        conversation ??
        (await transaction.chatConversation.create({
          data: { studentId: user.id, lessonId: lesson?.id ?? null },
        }));
      const userMessage = await transaction.chatMessage.create({
        data: {
          conversationId: currentConversation.id,
          role: 'user',
          content: parsed.data.message,
        },
      });
      const assistantMessage = await transaction.chatMessage.create({
        data: {
          conversationId: currentConversation.id,
          role: 'assistant',
          content: reply.data,
        },
      });
      await transaction.chatConversation.update({
        where: { id: currentConversation.id },
        data: { updatedAt: new Date() },
      });
      return {
        conversationId: currentConversation.id,
        userMessage,
        assistantMessage,
      };
    });

    return jsonSuccess({
      conversationId: saved.conversationId,
      reply: saved.assistantMessage,
    });
  } catch (error) {
    return aiErrorResponse(error, jsonError);
  }
}
