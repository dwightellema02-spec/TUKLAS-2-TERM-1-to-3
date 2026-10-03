import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const transcriptAnalysisSchema = z.object({
  subject: boundedText(100),
  gradeLevel: boundedText(50),
  mainTopic: boundedText(200),
  subtopics: z.array(boundedText(200)).min(1).max(5),
  learningObjectives: z.array(boundedText(500)).min(1).max(5),
  keyConcepts: z.array(boundedText(500)).min(1).max(5),
  vocabulary: z.array(z.object({ term: boundedText(200), definition: boundedText(2_000) })).max(20),
  examplesFromSource: z.array(boundedText(1_000)).max(10),
  proceduresOrFormulas: z.array(boundedText(1_000)).max(10),
  possibleMisconceptions: z.array(boundedText(500)).max(10),
  estimatedGradeConfidence: z.enum(['high', 'medium', 'low']),
});

const lessonQuestionSchema = z.object({
  position: z.number().int().nonnegative(),
  question: boundedText(2_000),
  options: z.array(boundedText(500)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: boundedText(5_000),
  skill: z.string().trim().max(200).optional(),
});

export const generatedLessonSchema = z.object({
  title: boundedText(200),
  subject: boundedText(100),
  gradeLevel: boundedText(50),
  estimatedMinutes: z.number().int().positive().max(600),
  objectives: z.array(boundedText(500)).min(1).max(10),
  vocabulary: z.array(z.object({ term: boundedText(200), definition: boundedText(2_000) })).max(20),
  sections: z.array(z.object({
    position: z.number().int().nonnegative(),
    heading: boundedText(200),
    sourceExplanation: z.string().trim().max(20_000),
    aiExplanation: z.string().trim().max(20_000),
  })).min(1).max(10),
  checks: z.array(lessonQuestionSchema).min(1).max(10),
  commonMistakes: z.array(boundedText(500)).max(10),
  keyTakeaways: z.array(boundedText(500)).max(10),
  quiz: z.array(lessonQuestionSchema).min(1).max(20),
});

export const generatedPracticeQuestionSchema = z.object({
  type: z.literal('multiple_choice'),
  question: boundedText(2_000),
  options: z.array(boundedText(500)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: boundedText(5_000),
  skill: boundedText(200),
  learningObjective: boundedText(500),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
});

export const mistakeAnalysisSchema = z.object({
  understood: boundedText(1_000),
  misunderstood: boundedText(1_000),
  misconception: z.string().trim().max(1_000),
  simpleExplanation: boundedText(2_000),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: boundedText(2_000),
});

export type TranscriptAnalysis = z.infer<typeof transcriptAnalysisSchema>;
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;