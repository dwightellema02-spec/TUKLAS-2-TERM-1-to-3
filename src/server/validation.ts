import { z } from 'zod';

const questionSchema = z
  .object({
    position: z.number().int().nonnegative(),
    question: z.string().trim().min(1).max(2_000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
    explanation: z.string().trim().min(1).max(5_000),
    skill: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.correctIndex >= value.options.length) {
      context.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'correctIndex must reference an option',
      });
    }
  });

export const sectionSchema = z.object({
  id: z.string().optional(),
  position: z.number().int().nonnegative(),
  heading: z.string().trim().min(1, 'Section title/heading is required.').max(200),
  type: z
    .enum(['TEXT', 'EXAMPLE', 'VIDEO', 'ACTIVITY', 'CHECK', 'SUMMARY'])
    .default('TEXT')
    .optional(),
  content: z.string().max(50_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  sourceExplanation: z.string().trim().max(20_000).nullable().optional(),
  aiExplanation: z.string().trim().max(20_000).nullable().optional(),
});

export const sectionReorderSchema = z.object({
  sectionIds: z.array(z.string().trim().min(1)).min(1, 'At least one section ID is required.'),
});

export const formativeCheckSchema = z
  .object({
    id: z.string().optional(),
    position: z.number().int().nonnegative(),
    question: z.string().trim().min(1, 'Question text is required.').max(2_000),
    questionType: z
      .enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERIC'])
      .default('MULTIPLE_CHOICE')
      .optional(),
    options: z.array(z.string().trim().min(1).max(500)).max(6).optional(),
    correctIndex: z.number().int().nonnegative().optional(),
    correctAnswer: z.string().trim().max(1000).nullable().optional(),
    explanation: z.string().trim().min(1, 'Explanation is required for answer transparency.').max(5_000),
    points: z.number().int().positive().max(100).default(1).optional(),
    skill: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const qType = val.questionType || 'MULTIPLE_CHOICE';
    if (qType === 'MULTIPLE_CHOICE') {
      if (!val.options || val.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Multiple choice questions require at least 2 options.',
        });
      }
      if (val.correctIndex === undefined || val.correctIndex === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['correctIndex'],
          message: 'correctIndex is required for multiple choice questions.',
        });
      } else if (val.options && val.correctIndex >= val.options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['correctIndex'],
          message: 'correctIndex must point to an option index within bounds.',
        });
      }
    } else if (qType === 'TRUE_FALSE') {
      if (val.correctIndex !== 0 && val.correctIndex !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['correctIndex'],
          message: 'correctIndex for True/False must be 0 (True) or 1 (False).',
        });
      }
    } else if (qType === 'SHORT_ANSWER' || qType === 'NUMERIC') {
      if (!val.correctAnswer || val.correctAnswer.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['correctAnswer'],
          message: `${qType === 'NUMERIC' ? 'Numeric' : 'Short answer'} questions require a correctAnswer.`,
        });
      }
    }
  });

export const videoAttachmentSchema = z.object({
  url: z.string().trim().min(1, 'Video URL is required.'),
  title: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const lessonInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(100),
  gradeLevel: z.string().trim().min(1).max(50),
  estimatedMinutes: z.number().int().positive().max(600).nullable().optional(),
  sourceTitle: z.string().trim().max(500).nullable().optional(),
  sourceTranscript: z.string().max(200_000).nullable().optional(),
  sections: z.array(sectionSchema).max(100).optional(),
  vocabulary: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(200),
        definition: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(200)
    .optional(),
  checks: z.array(formativeCheckSchema).max(100).optional(),
  quizQuestions: z.array(questionSchema).max(100).optional(),
  videos: z.array(videoAttachmentSchema).max(20).optional(),
});

export const lessonCreateSchema = lessonInputSchema.extend({
  unitId: z.string().trim().min(1).max(100),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const lessonProgressSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
});

export const subjectCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Subject code must have at least 2 characters.')
    .max(50, 'Subject code cannot exceed 50 characters.')
    .transform((val) => val.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(2, 'Subject name must have at least 2 characters.')
    .max(100, 'Subject name cannot exceed 100 characters.'),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const subjectUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Subject name must have at least 2 characters.')
    .max(100, 'Subject name cannot exceed 100 characters.')
    .optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const unitCreateSchema = z.object({
  termId: z.string().trim().min(1, 'Term ID is required.'),
  title: z
    .string()
    .trim()
    .min(1, 'Unit title is required.')
    .max(200, 'Unit title cannot exceed 200 characters.'),
  description: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isDemo: z.boolean().optional(),
});

export const unitUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Unit title cannot be empty.')
    .max(200, 'Unit title cannot exceed 200 characters.')
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isDemo: z.boolean().optional(),
});

export const unitReorderSchema = z.object({
  termId: z.string().trim().min(1, 'Term ID is required.'),
  unitIds: z.array(z.string().trim().min(1)).min(1, 'At least one unit ID is required.'),
});

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  subject: z.string().trim().min(1).max(100).optional(),
  gradeLevel: z.string().trim().min(1).max(50).optional(),
  unitId: z.string().trim().min(1).max(100).optional(),
  position: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().max(600).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  sourceTitle: z.string().trim().max(500).nullable().optional(),
  sourceTranscript: z.string().max(200_000).nullable().optional(),
  sections: z.array(sectionSchema).max(100).optional(),
  vocabulary: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(200),
        definition: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(200)
    .optional(),
  checks: z.array(formativeCheckSchema).max(100).optional(),
  quizQuestions: z.array(questionSchema).max(100).optional(),
  videos: z.array(videoAttachmentSchema).max(20).optional(),
});

export const lessonReorderSchema = z.object({
  unitId: z.string().trim().min(1, 'Unit ID is required.'),
  lessonIds: z.array(z.string().trim().min(1)).min(1, 'At least one lesson ID is required.'),
});

export type LessonInput = z.infer<typeof lessonInputSchema>;
export type LessonCreateInput = z.infer<typeof lessonCreateSchema>;
export type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type SectionReorderInput = z.infer<typeof sectionReorderSchema>;
export type FormativeCheckInput = z.infer<typeof formativeCheckSchema>;
export type VideoAttachmentInput = z.infer<typeof videoAttachmentSchema>;
export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>;
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>;
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

