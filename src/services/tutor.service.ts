/**
 * Tuklas 2.0 — The AI learning companion (master plan §3-6, §16-17, §46 rules 6-9).
 *
 * One entry point, `help`, used by every tutoring surface. Per request it:
 *   1. interprets what the student is trying to do (intent.ts)
 *   2. decides how far up the hint ladder this reply may go (ladder.ts, server state)
 *   3. builds a prompt from the published lesson, the question, the student's skills and
 *      the conversation, WITHOUT the answer key for an open question (prompt.ts)
 *   4. asks the configured AI provider (Anthropic or Gemini)
 *   5. checks the reply deterministically (guard.ts); a bad reply is never shown
 *   6. if the AI is unavailable or its reply is rejected, returns a clearly labelled
 *      AUTOMATIC hint (fallback.ts) instead of pretending to be the AI
 *   7. saves the exchange, the new ladder level and an audit record
 */

import { db } from '../server/db';
import { AiServiceError, requestAiText } from '../server/ai';
import { getAiProvider } from '../server/ai-providers';
import { NotFoundError, ValidationError } from '../lib/errors';
import { classifyIntegerMistake } from '../server/mistake-classifier';
import { classifyIntent, type TutorIntent } from '../server/tutor/intent';
import { decideRung, MAX_UNANSWERED_RUNG, RUNG_LABELS, type LadderDecision } from '../server/tutor/ladder';
import { buildTutorPrompt, sanitizeStudentMessage, type PromptLesson, type PromptQuestion } from '../server/tutor/prompt';
import { checkTutorReply, type GuardReason } from '../server/tutor/guard';
import { automaticCheckResponse, automaticHint } from '../server/tutor/fallback';
import { SkillMasteryService } from './skill-mastery.service';

export type TutorSource = 'AI' | 'AUTOMATIC';

export type TutorHelpInput = {
  message: string;
  conversationId?: string;
  lessonId?: string;
  practiceQuestionId?: string;
};

export const AI_LABEL = 'Ask Tuklas (AI)';
export const AUTOMATIC_LABEL = 'Automatic hint (not AI)';

export function isAiAvailable(): boolean {
  try {
    return getAiProvider().isConfigured();
  } catch {
    return false;
  }
}

const sectionText = (section: { sourceExplanation: string | null; content: string | null }) =>
  [section.sourceExplanation, section.content].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export class TutorService {
  /** The conversation (and messages) the student already has for a question or lesson. */
  static async getConversation(studentId: string, scope: { practiceQuestionId?: string; lessonId?: string }) {
    const where = scope.practiceQuestionId
      ? { studentId, practiceQuestionId: scope.practiceQuestionId }
      : scope.lessonId
        ? { studentId, lessonId: scope.lessonId, practiceQuestionId: null }
        : null;
    const conversation = where
      ? await db.chatConversation.findFirst({
          where,
          orderBy: { updatedAt: 'desc' },
          include: { messages: { orderBy: { createdAt: 'asc' }, take: 60 } },
        })
      : null;

    return {
      aiAvailable: isAiAvailable(),
      maxHintLevel: MAX_UNANSWERED_RUNG,
      conversation: conversation
        ? {
            id: conversation.id,
            hintLevel: conversation.hintLevel,
            messages: conversation.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              source: m.source,
              rung: m.rung,
              label: m.role === 'assistant' ? (m.source === 'AUTOMATIC' ? AUTOMATIC_LABEL : AI_LABEL) : null,
              createdAt: m.createdAt,
            })),
          }
        : null,
    };
  }

  static async help(studentId: string, input: TutorHelpInput) {
    const message = sanitizeStudentMessage(input.message);
    if (!message) throw new ValidationError('Write a message first.');

    // ---- 1. Resolve what the conversation is about (always scoped to this student) ----
    const existing = input.conversationId
      ? await db.chatConversation.findFirst({ where: { id: input.conversationId, studentId } })
      : null;
    if (input.conversationId && !existing) throw new NotFoundError('Conversation not found.');

    const practiceQuestionId = existing?.practiceQuestionId ?? input.practiceQuestionId ?? null;
    const questionRow = practiceQuestionId
      ? await db.practiceQuestion.findFirst({
          where: { id: practiceQuestionId, session: { studentId } },
          include: { answer: true, session: { select: { lessonId: true } } },
        })
      : null;
    if (practiceQuestionId && !questionRow) throw new NotFoundError('Question not found.');

    const lessonId = questionRow?.lessonId ?? questionRow?.session.lessonId ?? existing?.lessonId ?? input.lessonId ?? null;
    const lessonRow = lessonId
      ? await db.lesson.findFirst({
          where: { id: lessonId, status: 'PUBLISHED' },
          select: {
            title: true,
            objectives: { orderBy: { position: 'asc' }, select: { description: true } },
            sections: { orderBy: { position: 'asc' }, select: { heading: true, sourceExplanation: true, content: true } },
            vocabulary: { select: { term: true, definition: true } },
          },
        })
      : null;
    if (lessonId && !lessonRow) throw new NotFoundError('Lesson not found.');

    const lesson: PromptLesson | null = lessonRow
      ? {
          title: lessonRow.title,
          objectives: lessonRow.objectives.map((o) => o.description),
          sections: lessonRow.sections
            .map((s) => ({ heading: s.heading, text: sectionText(s) }))
            .filter((s) => s.text.length > 0),
          vocabulary: lessonRow.vocabulary,
        }
      : null;

    // ---- 2. Interpret intent and decide the rung ----
    const { intent, claimedAnswer } = classifyIntent(message);
    const answered = Boolean(questionRow?.answer);
    const options = Array.isArray(questionRow?.options) ? (questionRow!.options as string[]) : [];
    const correctText = questionRow ? options[questionRow.correctIndex] ?? '' : '';

    const decision: LadderDecision = questionRow
      ? decideRung({ currentLevel: existing?.hintLevel ?? 0, intent, questionAnswered: answered })
      : {
          // A general lesson chat has no answer to protect: explain concepts, Socratically.
          rung: 4,
          changeStrategy: intent === 'STILL_CONFUSED',
          declineAnswerRequest: false,
          useDifferentExample: intent === 'ANOTHER_EXAMPLE',
          mayRevealAnswer: true,
        };

    // ---- 3. Evidence about the student ----
    let promptQuestion: PromptQuestion | null = null;
    if (questionRow) {
      const submitted = questionRow.answer ? options[questionRow.answer.selectedIndex] : null;
      const attemptText = submitted ?? claimedAnswer;
      // A diagnosis is only given once the answer is submitted: before that, saying which proposed
      // answers are wrong would let the student probe for the right one.
      const diagnosis =
        answered && submitted && !questionRow.answer!.correct
          ? classifyIntegerMistake({ question: questionRow.question, selectedText: submitted, correctText })
          : null;
      promptQuestion = {
        text: questionRow.question,
        options,
        attempt: attemptText
          ? {
              text: attemptText,
              diagnosis:
                diagnosis && diagnosis.category !== 'UNCLASSIFIED'
                  ? { observation: diagnosis.observation, tip: diagnosis.tip, rule: diagnosis.rule }
                  : null,
            }
          : null,
        revealed: answered ? { correctText, explanation: questionRow.explanation } : null,
      };
    }

    const picture = lessonId ? await SkillMasteryService.lessonPicture(studentId, lessonId) : null;
    const skills =
      picture?.skills.map((s) => ({
        name: s.skill.name,
        level: s.status,
        repeatedSignErrors: Boolean((s.flags as { repeatedSignErrors?: boolean }).repeatedSignErrors),
        repeatedConceptual: Boolean((s.flags as { repeatedConceptualMistakes?: boolean }).repeatedConceptualMistakes),
      })) ?? [];

    const history = existing
      ? (
          await db.chatMessage.findMany({
            where: { conversationId: existing.id },
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        )
          .reverse()
          .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }))
      : [];

    // ---- 4. Ask the AI, 5. check the reply ----
    const isProposedAnswer = intent === 'CHECK_ANSWER' && Boolean(questionRow) && !answered;
    const prompt = buildTutorPrompt({ lesson, question: promptQuestion, skills, history, message, intent, decision });

    let source: TutorSource = 'AI';
    let content = '';
    let fallbackReason: string | null = null;
    let model = 'none';
    const startedAt = Date.now();

    try {
      model = getAiProvider().name;
      const reply = (await requestAiText({ system: prompt.system, user: prompt.user, maxTokens: 450 })).trim();
      const verdict = checkTutorReply({
        reply,
        secretAnswers: questionRow && !decision.mayRevealAnswer ? [correctText] : [],
        mayRevealAnswer: decision.mayRevealAnswer,
        questionText: questionRow?.question,
        noVerdict: isProposedAnswer,
      });
      if (verdict.ok) {
        content = reply;
      } else {
        source = 'AUTOMATIC';
        fallbackReason = `GUARD_${(verdict as { reason: GuardReason }).reason}`;
      }
    } catch (error) {
      source = 'AUTOMATIC';
      fallbackReason = error instanceof AiServiceError ? `AI_${error.status}` : 'AI_ERROR';
    }
    const latencyMs = Date.now() - startedAt;

    if (source === 'AUTOMATIC') {
      content = isProposedAnswer
        ? automaticCheckResponse({ question: questionRow!.question, claimed: claimedAnswer! })
        : automaticHint({
            rung: decision.rung,
            question: questionRow?.question ?? null,
            lessonExcerpt: lesson?.sections[0]?.text.slice(0, 220) ?? null,
            changeStrategy: decision.changeStrategy,
            useDifferentExample: decision.useDifferentExample,
            answeredExplanation: answered ? questionRow?.explanation ?? null : null,
            avoidValues: correctText ? [correctText] : [],
          });
    }

    // ---- 6. Save the exchange, the new ladder level and an audit record ----
    const newLevel = questionRow && !answered ? Math.max(existing?.hintLevel ?? 0, decision.rung) : existing?.hintLevel ?? 0;
    const saved = await db.$transaction(async (tx) => {
      const conversation =
        existing ??
        (await tx.chatConversation.create({
          data: { studentId, lessonId, practiceQuestionId: questionRow?.id ?? null },
        }));
      await tx.chatMessage.create({
        data: { conversationId: conversation.id, role: 'user', content: message, intent },
      });
      const assistant = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content,
          source,
          rung: questionRow ? decision.rung : null,
        },
      });
      await tx.chatConversation.update({
        where: { id: conversation.id },
        data: { hintLevel: newLevel, updatedAt: new Date() },
      });
      await tx.aIInteraction.create({
        data: {
          userId: studentId,
          lessonId,
          requestType: 'TUTOR',
          model,
          latencyMs,
          success: source === 'AI',
          metadata: { rung: decision.rung, intent, source, fallbackReason, answered },
        },
      });
      return { conversationId: conversation.id, assistant };
    });

    return {
      conversationId: saved.conversationId,
      reply: {
        id: saved.assistant.id,
        role: 'assistant' as const,
        content,
        source,
        rung: questionRow ? decision.rung : null,
        rungLabel: questionRow ? RUNG_LABELS[decision.rung] ?? null : null,
        label: source === 'AUTOMATIC' ? AUTOMATIC_LABEL : AI_LABEL,
        createdAt: saved.assistant.createdAt,
      },
      hintLevel: newLevel,
      maxHintLevel: MAX_UNANSWERED_RUNG,
      questionAnswered: answered,
      aiAvailable: isAiAvailable(),
      intent: intent as TutorIntent,
    };
  }
}
