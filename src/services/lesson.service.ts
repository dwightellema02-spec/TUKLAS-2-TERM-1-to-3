/**
 * Tuklas 2.0 — Lesson Domain Service
 *
 * Encapsulates lesson business logic, authorization rules, multi-section authoring,
 * formative checks, educational video references, draft/publish lifecycle,
 * anti-cheating student projections, and transactional reordering.
 */

import { db } from '../server/db';
import { UserRole } from '../types/domain';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';
import { z } from 'zod';
import {
  lessonCreateSchema,
  LessonUpdateInput,
  SectionInput,
  FormativeCheckInput,
  VideoAttachmentInput,
} from '../server/validation';
import { parseYouTubeUrl } from '../lib/youtube';
import { sanitizeText, sanitizeWorkedExample } from '../lib/sanitizer';
import { Prisma } from '@prisma/client';

export type LessonCreateData = z.infer<typeof lessonCreateSchema>;
export type LessonUpdateData = LessonUpdateInput;

export class LessonService {
  /**
   * Helper to verify that a teacher or admin owns/controls a lesson.
   */
  private static async verifyLessonOwnership(
    lessonId: string,
    user: { id: string; role: UserRole },
  ) {
    const existing = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, authorId: true, status: true, title: true, unitId: true },
    });

    if (!existing) {
      throw new NotFoundError('Lesson not found.');
    }

    if (user.role !== 'ADMIN' && existing.authorId !== user.id) {
      throw new AuthorizationError('You are not authorized to modify this lesson.');
    }

    return existing;
  }

  /**
   * Lists lessons according to user role and optional subject filter.
   */
  static async listLessons(userRole: UserRole, userId: string, subjectFilter?: string | null) {
    const whereClause = {
      ...(userRole === 'STUDENT' ? { status: 'PUBLISHED' as const } : {}),
      ...(userRole === 'TEACHER' ? { authorId: userId } : {}),
      ...(subjectFilter ? { subject: subjectFilter } : {}),
    };

    return db.lesson.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        subject: true,
        gradeLevel: true,
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
        estimatedMinutes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        author: { select: { id: true, displayName: true, role: true } },
        _count: {
          select: { sections: true, vocabulary: true, checks: true, sources: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Retrieves full lesson detail.
   * CRITICAL ANTI-CHEATING RULE: Automatically strips correctIndex, correctAnswer,
   * and explanations from checks, quizzes, and assessments when called by a STUDENT.
   */
  static async getLessonById(lessonId: string, userRole: UserRole, userId: string) {
    const whereClause = {
      id: lessonId,
      ...(userRole === 'STUDENT'
        ? { status: 'PUBLISHED' as const }
        : userRole === 'TEACHER'
          ? { authorId: userId }
          : {}),
    };

    const lesson = await db.lesson.findFirst({
      where: whereClause,
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
        sources: { orderBy: { position: 'asc' } },
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
      throw new NotFoundError('Lesson not found.');
    }

    // For teachers and admins, return full lesson with answer keys and teacher explanations
    if (userRole !== 'STUDENT') {
      return lesson;
    }

    // For students, project a safe copy with all assessment solutions and keys stripped
    return {
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
  }

  /**
   * Teacher Preview: returns the complete lesson with answer keys, explanations,
   * and draft/published indicators. Strictly protected against students.
   */
  static async previewLesson(lessonId: string, user: { id: string; role: UserRole }) {
    if (user.role === 'STUDENT') {
      throw new AuthorizationError('Students are not authorized to view teacher lesson preview.');
    }

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
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
        sources: { orderBy: { position: 'asc' } },
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
      throw new NotFoundError('Lesson not found.');
    }

    if (user.role !== 'ADMIN' && lesson.authorId !== user.id) {
      throw new AuthorizationError('You are not authorized to preview this teacher lesson.');
    }

    return {
      ...lesson,
      isPreviewMode: true,
    };
  }

  /**
   * Creates a validated lesson under a verified curriculum unit.
   * Default status is always DRAFT.
   */
  static async createLesson(data: LessonCreateData, authorId: string) {
    const unit = await db.unit.findUnique({
      where: { id: data.unitId },
      include: {
        term: {
          include: {
            curriculum: {
              include: { subject: true, gradeLevel: true },
            },
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundError('Curriculum unit not found.');
    }

    // The curriculum hierarchy is authoritative: subject and gradeLevel are derived from the unit
    const subjectName = unit.term?.curriculum?.subject?.name ?? data.subject ?? 'General';
    const gradeLabel = unit.term?.curriculum?.gradeLevel?.label ?? data.gradeLevel ?? 'General';

    // Process attached videos if present
    const validVideoSources: Array<{
      url: string;
      videoId: string;
      thumbnailUrl: string;
      title: string;
      description: string | null;
      position: number;
    }> = [];

    if (data.videos && data.videos.length > 0) {
      for (let i = 0; i < data.videos.length; i++) {
        const vid = data.videos[i];
        const parsed = parseYouTubeUrl(vid.url);
        if (!parsed.isValid || !parsed.videoId) {
          throw new ValidationError(`Invalid YouTube URL: ${vid.url}. ${parsed.error ?? ''}`);
        }
        validVideoSources.push({
          url: parsed.canonicalUrl ?? vid.url,
          videoId: parsed.videoId,
          thumbnailUrl: parsed.thumbnailUrl ?? '',
          title: sanitizeText(vid.title || 'Educational Video'),
          description: vid.description ? sanitizeText(vid.description) : null,
          position: vid.position ?? i,
        });
      }
    }

    // Always initialize new lessons in DRAFT mode unless explicit
    const initialStatus = data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    const publishedAt = initialStatus === 'PUBLISHED' ? new Date() : null;

    return db.lesson.create({
      data: {
        title: sanitizeText(data.title),
        subject: subjectName,
        gradeLevel: gradeLabel,
        unitId: unit.id,
        estimatedMinutes: data.estimatedMinutes ?? null,
        sourceTitle: data.sourceTitle ? sanitizeText(data.sourceTitle) : null,
        sourceTranscript: data.sourceTranscript ?? null,
        status: initialStatus,
        publishedAt,
        authorId,
        sections: {
          create: (data.sections ?? []).map((section, idx) => ({
            position: section.position ?? idx,
            heading: sanitizeText(section.heading),
            type: section.type ?? 'TEXT',
            content: section.content ? sanitizeText(section.content) : null,
            metadata: (section.metadata as Prisma.InputJsonValue) ?? (section.type === 'EXAMPLE' && section.metadata ? (sanitizeWorkedExample(section.metadata) as unknown as Prisma.InputJsonValue) : undefined),
            sourceExplanation: section.sourceExplanation ? sanitizeText(section.sourceExplanation) : null,
            aiExplanation: section.aiExplanation ? sanitizeText(section.aiExplanation) : null,
          })),
        },
        sources: {
          create: validVideoSources.map((v) => ({
            provider: 'youtube',
            url: v.url,
            videoId: v.videoId,
            thumbnailUrl: v.thumbnailUrl,
            title: v.title,
            description: v.description,
            position: v.position,
            isActive: true,
          })),
        },
        vocabulary: {
          create: (data.vocabulary ?? []).map((entry) => ({
            term: sanitizeText(entry.term),
            definition: sanitizeText(entry.definition),
          })),
        },
        checks: {
          create: (data.checks ?? []).map((entry, idx) => ({
            position: entry.position ?? idx,
            question: sanitizeText(entry.question),
            questionType: entry.questionType ?? 'MULTIPLE_CHOICE',
            options: entry.options ?? [],
            correctIndex: entry.correctIndex ?? 0,
            correctAnswer: entry.correctAnswer ? sanitizeText(entry.correctAnswer) : null,
            explanation: sanitizeText(entry.explanation),
            points: entry.points ?? 1,
          })),
        },
        quizQuestions: {
          create: (data.quizQuestions ?? []).map((entry, idx) => ({
            position: entry.position ?? idx,
            question: sanitizeText(entry.question),
            options: entry.options,
            correctIndex: entry.correctIndex,
            explanation: sanitizeText(entry.explanation),
            skill: entry.skill ? sanitizeText(entry.skill) : null,
          })),
        },
      },
      include: {
        sections: { orderBy: { position: 'asc' } },
        sources: { orderBy: { position: 'asc' } },
        vocabulary: true,
        checks: { orderBy: { position: 'asc' } },
        quizQuestions: { orderBy: { position: 'asc' } },
      },
    });
  }

  /**
   * Updates lesson metadata, sections, formative checks, and videos with strict ownership enforcement.
   */
  static async updateLesson(
    lessonId: string,
    data: LessonUpdateData,
    user: { id: string; role: UserRole },
  ) {
    const existing = await this.verifyLessonOwnership(lessonId, user);

    let updatedSubject: string | undefined;
    let updatedGrade: string | undefined;

    if (data.unitId && data.unitId !== existing.unitId) {
      const unit = await db.unit.findUnique({
        where: { id: data.unitId },
        include: {
          term: {
            include: { curriculum: { include: { subject: true, gradeLevel: true } } },
          },
        },
      });
      if (!unit) {
        throw new NotFoundError('Target curriculum unit not found.');
      }
      updatedSubject = unit.term.curriculum.subject.name;
      updatedGrade = unit.term.curriculum.gradeLevel.label;
    }

    const isPublishing = data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
    const publishedAt = isPublishing
      ? new Date()
      : data.status === 'DRAFT'
        ? null
        : undefined;

    // Validate YouTube videos if provided
    let processedVideos: Array<{
      url: string;
      videoId: string;
      thumbnailUrl: string;
      title: string;
      description: string | null;
      position: number;
    }> | undefined;

    if (data.videos !== undefined) {
      processedVideos = [];
      for (let i = 0; i < data.videos.length; i++) {
        const vid = data.videos[i];
        const parsed = parseYouTubeUrl(vid.url);
        if (!parsed.isValid || !parsed.videoId) {
          throw new ValidationError(`Invalid YouTube URL: ${vid.url}. ${parsed.error ?? ''}`);
        }
        processedVideos.push({
          url: parsed.canonicalUrl ?? vid.url,
          videoId: parsed.videoId,
          thumbnailUrl: parsed.thumbnailUrl ?? '',
          title: sanitizeText(vid.title || 'Educational Video'),
          description: vid.description ? sanitizeText(vid.description) : null,
          position: vid.position ?? i,
        });
      }
    }

    return db.$transaction(
      async (tx) => {
        // Sections update
        if (data.sections !== undefined) {
          await tx.lessonSection.deleteMany({ where: { lessonId } });
          if (data.sections.length > 0) {
            await tx.lessonSection.createMany({
              data: data.sections.map((section, idx) => ({
                lessonId,
                position: section.position ?? idx,
                heading: sanitizeText(section.heading),
                type: section.type ?? 'TEXT',
                content: section.content ? sanitizeText(section.content) : null,
                metadata: (section.metadata as Prisma.InputJsonValue) ?? (section.type === 'EXAMPLE' && section.metadata ? (sanitizeWorkedExample(section.metadata) as unknown as Prisma.InputJsonValue) : undefined),
                sourceExplanation: section.sourceExplanation ? sanitizeText(section.sourceExplanation) : null,
                aiExplanation: section.aiExplanation ? sanitizeText(section.aiExplanation) : null,
              })),
            });
          }
        }

        // Videos / Sources update
        if (processedVideos !== undefined) {
          await tx.lessonSource.deleteMany({ where: { lessonId, provider: 'youtube' } });
          if (processedVideos.length > 0) {
            await tx.lessonSource.createMany({
              data: processedVideos.map((v) => ({
                lessonId,
                provider: 'youtube',
                url: v.url,
                videoId: v.videoId,
                thumbnailUrl: v.thumbnailUrl,
                title: v.title,
                description: v.description,
                position: v.position,
                isActive: true,
              })),
            });
          }
        }

        // Vocabulary update
        if (data.vocabulary !== undefined) {
          await tx.lessonVocabulary.deleteMany({ where: { lessonId } });
          if (data.vocabulary.length > 0) {
            await tx.lessonVocabulary.createMany({
              data: data.vocabulary.map((entry) => ({
                lessonId,
                term: sanitizeText(entry.term),
                definition: sanitizeText(entry.definition),
              })),
            });
          }
        }

        // Checks update
        if (data.checks !== undefined) {
          await tx.lessonCheck.deleteMany({ where: { lessonId } });
          if (data.checks.length > 0) {
            await tx.lessonCheck.createMany({
              data: data.checks.map((entry, idx) => ({
                lessonId,
                position: entry.position ?? idx,
                question: sanitizeText(entry.question),
                questionType: entry.questionType ?? 'MULTIPLE_CHOICE',
                options: (entry.options ?? []) as Prisma.InputJsonValue,
                correctIndex: entry.correctIndex ?? 0,
                correctAnswer: entry.correctAnswer ? sanitizeText(entry.correctAnswer) : null,
                explanation: sanitizeText(entry.explanation),
                points: entry.points ?? 1,
              })),
            });
          }
        }

        // Quiz Questions update
        if (data.quizQuestions !== undefined) {
          await tx.quizQuestion.deleteMany({ where: { lessonId } });
          if (data.quizQuestions.length > 0) {
            await tx.quizQuestion.createMany({
              data: data.quizQuestions.map((entry, idx) => ({
                lessonId,
                position: entry.position ?? idx,
                question: sanitizeText(entry.question),
                options: entry.options as Prisma.InputJsonValue,
                correctIndex: entry.correctIndex,
                explanation: sanitizeText(entry.explanation),
                skill: entry.skill ? sanitizeText(entry.skill) : null,
              })),
            });
          }
        }

        return tx.lesson.update({
          where: { id: lessonId },
          data: {
            ...(data.title ? { title: sanitizeText(data.title) } : {}),
            ...(data.description !== undefined
              ? { description: data.description ? sanitizeText(data.description) : null }
              : {}),
            ...(updatedSubject ? { subject: updatedSubject } : {}),
            ...(updatedGrade ? { gradeLevel: updatedGrade } : {}),
            ...(data.unitId !== undefined ? { unitId: data.unitId } : {}),
            ...(data.position !== undefined ? { position: data.position } : {}),
            ...(data.estimatedMinutes !== undefined ? { estimatedMinutes: data.estimatedMinutes } : {}),
            ...(data.status ? { status: data.status } : {}),
            ...(publishedAt !== undefined ? { publishedAt } : {}),
            ...(data.sourceTitle !== undefined
              ? { sourceTitle: data.sourceTitle ? sanitizeText(data.sourceTitle) : null }
              : {}),
            ...(data.sourceTranscript !== undefined ? { sourceTranscript: data.sourceTranscript } : {}),
          },
          include: {
            sections: { orderBy: { position: 'asc' } },
            sources: { orderBy: { position: 'asc' } },
            vocabulary: true,
            checks: { orderBy: { position: 'asc' } },
            quizQuestions: { orderBy: { position: 'asc' } },
          },
        });
      },
      { maxWait: 15000, timeout: 20000 },
    );
  }

  /**
   * Publishes a lesson after verifying teacher authorization and comprehensive educational content requirements.
   */
  static async publishLesson(lessonId: string, user: { id: string; role: UserRole }) {
    await this.verifyLessonOwnership(lessonId, user);

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        sections: { orderBy: { position: 'asc' } },
        checks: true,
        sources: true,
        unit: true,
      },
    });

    if (!lesson) {
      throw new NotFoundError('Lesson not found.');
    }

    if (!lesson.unitId || !lesson.unit) {
      throw new ValidationError('Cannot publish a lesson without an associated curriculum unit.');
    }

    if (!lesson.title || lesson.title.trim().length < 3) {
      throw new ValidationError('Lesson must have a title with at least 3 characters.');
    }

    if (lesson.sections.length === 0) {
      throw new ValidationError('Cannot publish a lesson with no sections. Add at least one educational section.');
    }

    // Verify all sections have meaningful content
    for (const section of lesson.sections) {
      const hasContent = (section.content && section.content.trim().length > 0) ||
        (section.sourceExplanation && section.sourceExplanation.trim().length > 0);
      if (!hasContent) {
        throw new ValidationError(`Section "${section.heading}" has no educational content. Add content before publishing.`);
      }
    }

    // Verify all formative checks are complete
    for (const check of lesson.checks) {
      if (!check.question || check.question.trim().length === 0) {
        throw new ValidationError('Formative check question text cannot be empty.');
      }
      if (!check.explanation || check.explanation.trim().length === 0) {
        throw new ValidationError('Each formative check must include a pedagogical explanation.');
      }
      if (check.questionType === 'MULTIPLE_CHOICE') {
        const options = Array.isArray(check.options) ? check.options : [];
        if (options.length < 2) {
          throw new ValidationError('Multiple choice check requires at least 2 options.');
        }
        if (check.correctIndex < 0 || check.correctIndex >= options.length) {
          throw new ValidationError('Multiple choice check correctIndex is out of bounds.');
        }
      } else if (check.questionType === 'SHORT_ANSWER' || check.questionType === 'NUMERIC') {
        if (!check.correctAnswer || check.correctAnswer.trim().length === 0) {
          throw new ValidationError(`${check.questionType === 'NUMERIC' ? 'Numeric' : 'Short answer'} check requires a correct answer.`);
        }
      }
    }

    // Transactionally update status and publishedAt
    return db.lesson.update({
      where: { id: lessonId },
      data: {
        status: 'PUBLISHED',
        publishedAt: lesson.publishedAt ?? new Date(),
      },
      include: {
        sections: { orderBy: { position: 'asc' } },
        sources: { orderBy: { position: 'asc' } },
        checks: { orderBy: { position: 'asc' } },
      },
    });
  }

  /**
   * Granular Section Operations:
   * Adds an educational section to a lesson.
   */
  static async addSection(
    lessonId: string,
    data: SectionInput,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const position = data.position ?? (await db.lessonSection.count({ where: { lessonId } }));

    return db.lessonSection.create({
      data: {
        lessonId,
        position,
        heading: sanitizeText(data.heading),
        type: data.type ?? 'TEXT',
        content: data.content ? sanitizeText(data.content) : null,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? (data.type === 'EXAMPLE' && data.metadata ? (sanitizeWorkedExample(data.metadata) as unknown as Prisma.InputJsonValue) : undefined),
        sourceExplanation: data.sourceExplanation ? sanitizeText(data.sourceExplanation) : null,
        aiExplanation: data.aiExplanation ? sanitizeText(data.aiExplanation) : null,
      },
    });
  }

  /**
   * Updates an existing section in a lesson.
   */
  static async updateSection(
    lessonId: string,
    sectionId: string,
    data: Partial<SectionInput>,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const section = await db.lessonSection.findFirst({
      where: { id: sectionId, lessonId },
    });

    if (!section) {
      throw new NotFoundError('Lesson section not found.');
    }

    return db.lessonSection.update({
      where: { id: sectionId },
      data: {
        ...(data.heading !== undefined ? { heading: sanitizeText(data.heading) } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.content !== undefined ? { content: data.content ? sanitizeText(data.content) : null } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
        ...(data.sourceExplanation !== undefined ? { sourceExplanation: data.sourceExplanation ? sanitizeText(data.sourceExplanation) : null } : {}),
        ...(data.aiExplanation !== undefined ? { aiExplanation: data.aiExplanation ? sanitizeText(data.aiExplanation) : null } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
      },
    });
  }

  /**
   * Deletes a section from a lesson and readjusts positions.
   */
  static async deleteSection(
    lessonId: string,
    sectionId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const section = await db.lessonSection.findFirst({
      where: { id: sectionId, lessonId },
    });

    if (!section) {
      throw new NotFoundError('Lesson section not found.');
    }

    await db.lessonSection.delete({ where: { id: sectionId } });

    // Readjust remaining section positions
    const remaining = await db.lessonSection.findMany({
      where: { lessonId },
      orderBy: { position: 'asc' },
    });

    await db.$transaction(
      async (tx) => {
        // Phase 1: negative positions to avoid unique constraint collision
        for (let i = 0; i < remaining.length; i++) {
          await tx.lessonSection.update({
            where: { id: remaining[i].id },
            data: { position: -(i + 1) },
          });
        }
        // Phase 2: positive positions
        for (let i = 0; i < remaining.length; i++) {
          await tx.lessonSection.update({
            where: { id: remaining[i].id },
            data: { position: i },
          });
        }
      },
      { maxWait: 15000, timeout: 20000 },
    );

    return { success: true, deletedSectionId: sectionId };
  }

  /**
   * Transactional two-phase section reordering to prevent collision on @@unique([lessonId, position]).
   */
  static async reorderSections(
    lessonId: string,
    sectionIds: string[],
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const existingSections = await db.lessonSection.findMany({
      where: { lessonId, id: { in: sectionIds } },
      select: { id: true },
    });

    if (existingSections.length !== sectionIds.length) {
      throw new ValidationError('All provided section IDs must belong to the specified lesson.');
    }

    await db.$transaction(
      async (tx) => {
        // Phase 1: negative temporary positions
        for (let i = 0; i < sectionIds.length; i++) {
          await tx.lessonSection.update({
            where: { id: sectionIds[i] },
            data: { position: -(i + 1) },
          });
        }
        // Phase 2: final 0..N-1 positions
        for (let i = 0; i < sectionIds.length; i++) {
          await tx.lessonSection.update({
            where: { id: sectionIds[i] },
            data: { position: i },
          });
        }
      },
      { maxWait: 15000, timeout: 20000 },
    );

    return db.lessonSection.findMany({
      where: { lessonId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Adds a formative check to a lesson.
   */
  static async addFormativeCheck(
    lessonId: string,
    data: FormativeCheckInput,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const position = data.position ?? (await db.lessonCheck.count({ where: { lessonId } }));

    return db.lessonCheck.create({
      data: {
        lessonId,
        position,
        question: sanitizeText(data.question),
        questionType: data.questionType ?? 'MULTIPLE_CHOICE',
        options: (data.options ?? []) as Prisma.InputJsonValue,
        correctIndex: data.correctIndex ?? 0,
        correctAnswer: data.correctAnswer ? sanitizeText(data.correctAnswer) : null,
        explanation: sanitizeText(data.explanation),
        points: data.points ?? 1,
      },
    });
  }

  /**
   * Updates an existing formative check.
   */
  static async updateFormativeCheck(
    lessonId: string,
    checkId: string,
    data: Partial<FormativeCheckInput>,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const check = await db.lessonCheck.findFirst({
      where: { id: checkId, lessonId },
    });

    if (!check) {
      throw new NotFoundError('Formative check not found.');
    }

    return db.lessonCheck.update({
      where: { id: checkId },
      data: {
        ...(data.question !== undefined ? { question: sanitizeText(data.question) } : {}),
        ...(data.questionType !== undefined ? { questionType: data.questionType } : {}),
        ...(data.options !== undefined ? { options: data.options as Prisma.InputJsonValue } : {}),
        ...(data.correctIndex !== undefined ? { correctIndex: data.correctIndex } : {}),
        ...(data.correctAnswer !== undefined ? { correctAnswer: data.correctAnswer ? sanitizeText(data.correctAnswer) : null } : {}),
        ...(data.explanation !== undefined ? { explanation: sanitizeText(data.explanation) } : {}),
        ...(data.points !== undefined ? { points: data.points } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
      },
    });
  }

  /**
   * Deletes a formative check from a lesson.
   */
  static async deleteFormativeCheck(
    lessonId: string,
    checkId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const check = await db.lessonCheck.findFirst({
      where: { id: checkId, lessonId },
    });

    if (!check) {
      throw new NotFoundError('Formative check not found.');
    }

    await db.lessonCheck.delete({ where: { id: checkId } });
    return { success: true, deletedCheckId: checkId };
  }

  /**
   * Validates and attaches an educational YouTube video to a lesson.
   */
  static async attachVideo(
    lessonId: string,
    data: VideoAttachmentInput,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const parsed = parseYouTubeUrl(data.url);
    if (!parsed.isValid || !parsed.videoId) {
      throw new ValidationError(parsed.error ?? 'Invalid YouTube URL.');
    }

    const position = data.position ?? (await db.lessonSource.count({ where: { lessonId } }));

    return db.lessonSource.create({
      data: {
        lessonId,
        provider: 'youtube',
        url: parsed.canonicalUrl ?? data.url,
        videoId: parsed.videoId,
        thumbnailUrl: parsed.thumbnailUrl ?? '',
        title: sanitizeText(data.title || 'Educational Video'),
        description: data.description ? sanitizeText(data.description) : null,
        position,
        isActive: true,
      },
    });
  }

  /**
   * Removes an attached video from a lesson.
   */
  static async removeVideo(
    lessonId: string,
    videoId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    const source = await db.lessonSource.findFirst({
      where: { id: videoId, lessonId },
    });

    if (!source) {
      throw new NotFoundError('Video reference not found.');
    }

    await db.lessonSource.delete({ where: { id: videoId } });
    return { success: true, deletedVideoId: videoId };
  }

  /**
   * Retrieves student progress on a lesson.
   */
  static async getProgress(lessonId: string, studentId: string) {
    return db.lessonProgress.findUnique({
      where: {
        studentId_lessonId: { studentId, lessonId },
      },
    });
  }

  /**
   * Updates or creates student progress on a lesson.
   */
  static async updateProgress(lessonId: string, studentId: string, status: 'IN_PROGRESS' | 'COMPLETED') {
    const lesson = await db.lesson.findFirst({
      where: { id: lessonId, status: 'PUBLISHED' },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundError('Lesson not found.');
    }

    const completedAt = status === 'COMPLETED' ? new Date() : null;
    return db.lessonProgress.upsert({
      where: {
        studentId_lessonId: { studentId, lessonId },
      },
      update: {
        status,
        ...(completedAt ? { completedAt } : {}),
      },
      create: {
        studentId,
        lessonId,
        status,
        completedAt,
      },
    });
  }

  /**
   * Non-destructive lesson archival: sets status to ARCHIVED.
   * Preserves all student quiz attempts, answers, and progress.
   */
  static async archiveLesson(
    lessonId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.verifyLessonOwnership(lessonId, user);

    return db.lesson.update({
      where: { id: lessonId },
      data: { status: 'ARCHIVED' },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Reorders lessons within a unit.
   */
  static async reorderLessons(
    unitId: string,
    lessonIds: string[],
    user: { id: string; role: UserRole },
  ) {
    const unit = await db.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      throw new NotFoundError('Unit not found.');
    }

    const lessons = await db.lesson.findMany({
      where: { unitId, id: { in: lessonIds } },
      select: { id: true, authorId: true },
    });

    if (lessons.length !== lessonIds.length) {
      throw new ValidationError('All provided lesson IDs must belong to the specified unit.');
    }

    if (user.role !== 'ADMIN') {
      const unauthorized = lessons.some((l) => l.authorId !== user.id);
      if (unauthorized) {
        throw new AuthorizationError('You may only reorder lessons you authored.');
      }
    }

    await db.$transaction(
      async (tx) => {
        // Phase 1: negative positions
        for (let i = 0; i < lessonIds.length; i++) {
          await tx.lesson.update({
            where: { id: lessonIds[i] },
            data: { position: -(i + 1) },
          });
        }
        // Phase 2: positive positions
        for (let i = 0; i < lessonIds.length; i++) {
          await tx.lesson.update({
            where: { id: lessonIds[i] },
            data: { position: i },
          });
        }
      },
      { maxWait: 15000, timeout: 20000 },
    );

    return db.lesson.findMany({
      where: { unitId },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, position: true, status: true },
    });
  }
}
