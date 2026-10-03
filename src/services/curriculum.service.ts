/**
 * Tuklas 2.0 — Curriculum Domain Service
 *
 * Encapsulates curriculum query logic, filtering, structural validation,
 * entity lifecycle management (Subject, Unit, Term), deterministic ordering,
 * and non-destructive archival.
 */

import { db } from '../server/db';
import { UserRole } from '../types/domain';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { Prisma } from '@prisma/client';

export type CurriculumFilterOptions = {
  search?: string;
  gradeLevel?: number;
  subjectId?: string;
  subjectCode?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

export class CurriculumService {
  /**
   * Retrieves the complete curriculum taxonomy, role-filtered for published vs author lessons,
   * with deterministic ordering across Subject -> Grade Level -> Term -> Unit -> Lesson.
   */
  static async getCurriculumHierarchy(
    userRole: UserRole,
    userId?: string,
    filters?: CurriculumFilterOptions,
  ) {
    // 1. Role-based lesson filter
    let lessonsWhere: Prisma.LessonWhereInput;
    if (userRole === 'STUDENT') {
      lessonsWhere = { status: 'PUBLISHED' };
    } else if (userRole === 'TEACHER' && userId) {
      if (filters?.status === 'PUBLISHED') {
        lessonsWhere = { status: 'PUBLISHED' };
      } else if (filters?.status) {
        lessonsWhere = { authorId: userId, status: filters.status };
      } else {
        lessonsWhere = {
          OR: [{ status: 'PUBLISHED' }, { authorId: userId }],
        };
      }
    } else if (userRole === 'ADMIN') {
      lessonsWhere = filters?.status ? { status: filters.status } : {};
    } else {
      lessonsWhere = { status: 'PUBLISHED' };
    }

    // 2. Keyword search filter
    if (filters?.search && filters.search.trim().length > 0) {
      const term = filters.search.trim();
      lessonsWhere = {
        AND: [
          lessonsWhere,
          {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
            ],
          },
        ],
      };
    }

    // 3. Subject-level filters
    const subjectWhere: Prisma.SubjectWhereInput = {};
    if (filters?.subjectId) {
      subjectWhere.id = filters.subjectId;
    }
    if (filters?.subjectCode) {
      subjectWhere.code = filters.subjectCode;
    }

    // 4. Grade-level filter
    const curriculumWhere: Prisma.CurriculumWhereInput = {};
    if (filters?.gradeLevel) {
      curriculumWhere.gradeLevel = { level: filters.gradeLevel };
    }

    const subjects = await db.subject.findMany({
      where: subjectWhere,
      orderBy: { name: 'asc' },
      include: {
        curricula: {
          where: curriculumWhere,
          orderBy: { gradeLevel: { level: 'asc' } },
          include: {
            gradeLevel: true,
            terms: {
              orderBy: { number: 'asc' },
              include: {
                units: {
                  orderBy: { position: 'asc' },
                  include: {
                    lessons: {
                      where: lessonsWhere,
                      orderBy: [{ position: 'asc' }, { title: 'asc' }],
                      select: {
                        id: true,
                        title: true,
                        description: true,
                        subject: true,
                        gradeLevel: true,
                        estimatedMinutes: true,
                        position: true,
                        status: true,
                        authorId: true,
                        publishedAt: true,
                        updatedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return subjects;
  }

  /**
   * Retrieves all subjects in alphabetical order.
   */
  static async listSubjects() {
    return db.subject.findMany({
      orderBy: { name: 'asc' },
      include: {
        curricula: {
          include: {
            gradeLevel: true,
            _count: { select: { terms: true } },
          },
        },
      },
    });
  }

  /**
   * Retrieves a specific subject by its ID or unique code.
   */
  static async getSubjectById(subjectIdOrCode: string) {
    const subject = await db.subject.findFirst({
      where: {
        OR: [{ id: subjectIdOrCode }, { code: subjectIdOrCode.toUpperCase() }],
      },
      include: {
        curricula: {
          include: {
            gradeLevel: true,
            terms: {
              include: {
                units: {
                  orderBy: { position: 'asc' },
                  select: { id: true, title: true, position: true, isDemo: true },
                },
              },
            },
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundError(`Subject '${subjectIdOrCode}' not found.`);
    }

    return subject;
  }

  /**
   * Creates a new Subject and automatically links it to standard grade levels and terms.
   */
  static async createSubject(data: {
    code: string;
    name: string;
    description?: string | null;
  }) {
    const existing = await db.subject.findFirst({
      where: {
        OR: [{ code: data.code.toUpperCase() }, { name: data.name }],
      },
    });

    if (existing) {
      throw new ConflictError(
        `A subject with code '${data.code}' or name '${data.name}' already exists.`,
      );
    }

    const subject = await db.subject.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description ?? null,
      },
    });

    // Auto-provision standard curricula (Grades 7, 8, 9, 10 with Terms 1, 2, 3)
    const existingGrades = await db.gradeLevel.findMany({
      where: { level: { in: [7, 8, 9, 10] } },
      orderBy: { level: 'asc' },
    });

    for (const grade of existingGrades) {
      const curriculum = await db.curriculum.create({
        data: {
          subjectId: subject.id,
          gradeLevelId: grade.id,
        },
      });

      for (const number of [1, 2, 3]) {
        await db.term.create({
          data: {
            curriculumId: curriculum.id,
            number,
            title: `Term ${number}`,
          },
        });
      }
    }

    return subject;
  }

  /**
   * Updates an existing subject.
   */
  static async updateSubject(
    subjectId: string,
    data: { name?: string; description?: string | null },
  ) {
    const subject = await db.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundError(`Subject '${subjectId}' not found.`);
    }

    if (data.name && data.name !== subject.name) {
      const conflict = await db.subject.findFirst({
        where: { name: data.name, id: { not: subjectId } },
      });
      if (conflict) {
        throw new ConflictError(`A subject with name '${data.name}' already exists.`);
      }
    }

    return db.subject.update({
      where: { id: subjectId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  /**
   * Retrieves all grade levels in ascending numerical order.
   */
  static async listGradeLevels() {
    return db.gradeLevel.findMany({
      orderBy: { level: 'asc' },
      include: {
        curricula: {
          include: { subject: true },
        },
      },
    });
  }

  /**
   * Retrieves a specific grade level by ID or numeric level.
   */
  static async getGradeById(gradeIdOrLevel: string) {
    const numericLevel = parseInt(gradeIdOrLevel, 10);
    const grade = await db.gradeLevel.findFirst({
      where: {
        OR: [
          { id: gradeIdOrLevel },
          ...(!isNaN(numericLevel) ? [{ level: numericLevel }] : []),
        ],
      },
      include: {
        curricula: {
          include: {
            subject: true,
            terms: {
              orderBy: { number: 'asc' },
              include: {
                units: {
                  orderBy: { position: 'asc' },
                  select: { id: true, title: true, position: true, isDemo: true },
                },
              },
            },
          },
        },
      },
    });

    if (!grade) {
      throw new NotFoundError(`Grade level '${gradeIdOrLevel}' not found.`);
    }

    return grade;
  }

  /**
   * Retrieves a specific term by ID with its parent curriculum and child units.
   */
  static async getTermById(termId: string, userRole?: UserRole, userId?: string) {
    const lessonsWhere =
      userRole === 'STUDENT'
        ? { status: 'PUBLISHED' as const }
        : userRole === 'TEACHER' && userId
          ? { OR: [{ status: 'PUBLISHED' as const }, { authorId: userId }] }
          : {};

    const term = await db.term.findUnique({
      where: { id: termId },
      include: {
        curriculum: {
          include: { subject: true, gradeLevel: true },
        },
        units: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              where: lessonsWhere,
              orderBy: [{ position: 'asc' }, { title: 'asc' }],
              select: {
                id: true,
                title: true,
                description: true,
                subject: true,
                gradeLevel: true,
                estimatedMinutes: true,
                position: true,
                status: true,
                authorId: true,
                publishedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!term) {
      throw new NotFoundError(`Term '${termId}' not found.`);
    }

    return term;
  }

  /**
   * Retrieves a specific curriculum unit with parent terms and curriculum metadata.
   */
  static async getUnitById(unitId: string, userRole?: UserRole, userId?: string) {
    const lessonsWhere =
      userRole === 'STUDENT'
        ? { status: 'PUBLISHED' as const }
        : userRole === 'TEACHER' && userId
          ? { OR: [{ status: 'PUBLISHED' as const }, { authorId: userId }] }
          : {};

    const unit = await db.unit.findUnique({
      where: { id: unitId },
      include: {
        term: {
          include: {
            curriculum: {
              include: { subject: true, gradeLevel: true },
            },
          },
        },
        lessons: {
          where: lessonsWhere,
          orderBy: [{ position: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            title: true,
            description: true,
            subject: true,
            gradeLevel: true,
            estimatedMinutes: true,
            position: true,
            status: true,
            authorId: true,
            publishedAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundError(`Unit '${unitId}' not found.`);
    }

    return unit;
  }

  /**
   * Creates a new curriculum unit within a term with deterministic positioning.
   */
  static async createUnit(data: {
    termId: string;
    title: string;
    description?: string | null;
    position?: number;
    isDemo?: boolean;
  }) {
    const term = await db.term.findUnique({
      where: { id: data.termId },
      include: { curriculum: { include: { subject: true, gradeLevel: true } } },
    });

    if (!term) {
      throw new NotFoundError(`Term '${data.termId}' not found.`);
    }

    // Determine deterministic position
    let position = data.position;
    if (position === undefined) {
      const highestPos = await db.unit.findFirst({
        where: { termId: data.termId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = highestPos ? highestPos.position + 1 : 0;
    }

    return db.unit.create({
      data: {
        termId: data.termId,
        title: data.title,
        description: data.description ?? null,
        position,
        isDemo: data.isDemo ?? false,
      },
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
  }

  /**
   * Updates an existing curriculum unit.
   */
  static async updateUnit(
    unitId: string,
    data: {
      title?: string;
      description?: string | null;
      position?: number;
      isDemo?: boolean;
    },
  ) {
    const unit = await db.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      throw new NotFoundError(`Unit '${unitId}' not found.`);
    }

    return db.unit.update({
      where: { id: unitId },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.isDemo !== undefined ? { isDemo: data.isDemo } : {}),
      },
    });
  }

  /**
   * Reorders all units within a term in a collision-safe database transaction.
   */
  static async reorderUnits(termId: string, unitIds: string[]) {
    const term = await db.term.findUnique({ where: { id: termId } });
    if (!term) {
      throw new NotFoundError(`Term '${termId}' not found.`);
    }

    const units = await db.unit.findMany({
      where: { termId, id: { in: unitIds } },
      select: { id: true },
    });

    if (units.length !== unitIds.length) {
      throw new ValidationError('All provided unit IDs must belong to the specified term.');
    }

    // Two-phase reordering inside a transaction to prevent unique constraint collisions:
    // Phase 1: Set temporary negative positions
    // Phase 2: Set final positive positions 0..N-1
    await db.$transaction(async (tx) => {
      for (let i = 0; i < unitIds.length; i++) {
        await tx.unit.update({
          where: { id: unitIds[i] },
          data: { position: -(i + 1) },
        });
      }
      for (let i = 0; i < unitIds.length; i++) {
        await tx.unit.update({
          where: { id: unitIds[i] },
          data: { position: i },
        });
      }
    });

    return db.unit.findMany({
      where: { termId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Non-destructive unit archival: marks all child lessons as ARCHIVED so that
   * student historical progress, quiz attempts, and mastery records remain preserved.
   */
  static async archiveUnit(unitId: string) {
    const unit = await db.unit.findUnique({
      where: { id: unitId },
      include: { lessons: { select: { id: true, status: true } } },
    });

    if (!unit) {
      throw new NotFoundError(`Unit '${unitId}' not found.`);
    }

    // Non-destructive: archive all child lessons
    await db.lesson.updateMany({
      where: { unitId },
      data: { status: 'ARCHIVED' },
    });

    return {
      archivedUnitId: unitId,
      archivedLessonsCount: unit.lessons.length,
      status: 'ARCHIVED' as const,
    };
  }
}
