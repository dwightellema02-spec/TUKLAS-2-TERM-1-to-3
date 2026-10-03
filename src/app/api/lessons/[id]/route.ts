import { db } from '../../../../server/db';
import {
  getSessionFromRequest,
  jsonError,
  jsonSuccess,
} from '../../../../server/auth';
import { LessonService } from '../../../../services/lesson.service';
import { lessonUpdateSchema } from '../../../../server/validation';
import { AppError } from '../../../../lib/errors';
import { UserRole } from '../../../../types/domain';

export async function GET(
  request: Request,
  context?: { params?: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return jsonError('Authentication required.', 401);
  }

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const id =
      resolvedParams?.id ??
      new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ??
      '';

    const lesson = await db.lesson.findFirst({
      where: {
        id,
        ...(user.role === 'STUDENT'
          ? { status: 'PUBLISHED' as const }
          : user.role === 'TEACHER'
            ? { authorId: user.id }
            : {}),
      },
      include: {
        unit: {
          include: {
            term: {
              include: {
                curriculum: {
                  include: { subject: true, gradeLevel: true },
                },
              },
            },
          },
        },
        sections: { orderBy: { position: 'asc' } },
        contents: { orderBy: { position: 'asc' } },
        sources: { orderBy: { createdAt: 'asc' } },
        objectives: {
          orderBy: { position: 'asc' },
          include: {
            competency: true,
            skills: { include: { skill: true } },
          },
        },
        vocabulary: true,
        checks: { orderBy: { position: 'asc' } },
        quizQuestions: { orderBy: { position: 'asc' } },
        assessments: { include: { questions: { orderBy: { position: 'asc' } } } },
        author: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!lesson) {
      return jsonError('Lesson not found.', 404);
    }

    if (user.role !== 'STUDENT') return jsonSuccess({ lesson });

    const safeLesson = {
      ...lesson,
      sourceTranscript: null,
      sections: lesson.sections.map(({ sourceExplanation, ...section }) => ({
        ...section,
        sourceExplanation,
      })),
      checks: lesson.checks.map((check) => {
        const safe = { ...check };
        delete (safe as Partial<typeof check>).correctIndex;
        delete (safe as Partial<typeof check>).correctAnswer;
        delete (safe as Partial<typeof check>).explanation;
        return safe;
      }),
      quizQuestions: lesson.quizQuestions.map((question) => {
        const safe = { ...question };
        delete (safe as Partial<typeof question>).correctIndex;
        delete (safe as Partial<typeof question>).correctAnswer;
        delete (safe as Partial<typeof question>).explanation;
        return safe;
      }),
      assessments: lesson.assessments.map((assessment) => ({
        ...assessment,
        questions: assessment.questions.map((question) => {
          const safe = { ...question };
          delete (safe as Partial<typeof question>).correctIndex;
          delete (safe as Partial<typeof question>).correctAnswer;
          delete (safe as Partial<typeof question>).explanation;
          return safe;
        }),
      })),
    };

    return jsonSuccess({ lesson: safeLesson });
  } catch {
    return jsonError('Unable to load lesson at this time.', 500);
  }
}

export async function PATCH(
  request: Request,
  context?: { params?: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to update lessons.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const id =
      resolvedParams?.id ??
      new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ??
      '';

    const body = await request.json();
    const parsed = lessonUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message ?? 'Invalid lesson update payload.',
        400,
      );
    }

    const updated = await LessonService.updateLesson(id, parsed.data, {
      id: user.id,
      role: user.role as UserRole,
    });
    return jsonSuccess({ lesson: updated });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to update lesson at this time.', 500);
  }
}

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonError('Authentication required.', 401);

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) return jsonError('Authentication required.', 401);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return jsonError('You are not authorized to archive lessons.', 403);
  }

  try {
    const resolvedParams = context?.params ? await context.params : null;
    const id =
      resolvedParams?.id ??
      new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ??
      '';

    const archived = await LessonService.archiveLesson(id, {
      id: user.id,
      role: user.role as UserRole,
    });
    return jsonSuccess({ lesson: archived });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    return jsonError('Unable to archive lesson at this time.', 500);
  }
}
