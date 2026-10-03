-- CreateEnum QuestionType
DO $$ BEGIN
  CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERIC');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum AIRequestType
DO $$ BEGIN
  CREATE TYPE "AIRequestType" AS ENUM ('TUTOR', 'QUESTION_GENERATION', 'MISTAKE_ANALYSIS', 'LESSON_DRAFT', 'TRANSCRIPT_ANALYSIS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum LessonContentKind
DO $$ BEGIN
  CREATE TYPE "LessonContentKind" AS ENUM ('EXPLANATION', 'EXAMPLE', 'CALLOUT', 'SUMMARY', 'TEXT', 'VIDEO', 'IMAGE', 'DOCUMENT', 'INTERACTIVE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum LessonContentKind
ALTER TYPE "LessonContentKind" ADD VALUE IF NOT EXISTS 'TEXT';
ALTER TYPE "LessonContentKind" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "LessonContentKind" ADD VALUE IF NOT EXISTS 'IMAGE';
ALTER TYPE "LessonContentKind" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "LessonContentKind" ADD VALUE IF NOT EXISTS 'INTERACTIVE';

-- CreateEnum LessonProgressStatus
DO $$ BEGIN
  CREATE TYPE "LessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_PRACTICE', 'MASTERED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum LessonProgressStatus
ALTER TYPE "LessonProgressStatus" ADD VALUE IF NOT EXISTS 'NEEDS_PRACTICE';
ALTER TYPE "LessonProgressStatus" ADD VALUE IF NOT EXISTS 'MASTERED';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Lesson
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "description" TEXT;

-- AlterTable LessonContent
ALTER TABLE "LessonContent" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- AlterTable LessonSource
ALTER TABLE "LessonSource" ADD COLUMN IF NOT EXISTS "videoId" TEXT,
ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT,
ADD COLUMN IF NOT EXISTS "channelTitle" TEXT,
ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Assessment
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
ADD COLUMN IF NOT EXISTS "timeLimitMinutes" INTEGER,
ADD COLUMN IF NOT EXISTS "status" "LessonStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable LessonProgress
ALTER TABLE "LessonProgress" ADD COLUMN IF NOT EXISTS "latestScore" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "bestScore" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "practiceAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "assessmentAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable QuizQuestion
ALTER TABLE "QuizQuestion" ADD COLUMN IF NOT EXISTS "questionType" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS "correctAnswer" TEXT;

-- AlterTable PracticeQuestion
ALTER TABLE "PracticeQuestion" ADD COLUMN IF NOT EXISTS "questionType" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
ADD COLUMN IF NOT EXISTS "correctAnswer" TEXT;

-- AlterTable QuizAttempt
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "passed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable StudentProfile
CREATE TABLE IF NOT EXISTS "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentNumber" TEXT,
    "gradeLevel" TEXT,
    "section" TEXT,
    "schoolName" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable TeacherProfile
CREATE TABLE IF NOT EXISTS "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "title" TEXT,
    "specialization" TEXT,
    "schoolName" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable AssessmentAnswer
CREATE TABLE IF NOT EXISTS "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndex" INTEGER,
    "textAnswer" TEXT,
    "numericAnswer" DOUBLE PRECISION,
    "isCorrect" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable MistakeRecord
CREATE TABLE IF NOT EXISTS "MistakeRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "questionId" TEXT,
    "assessmentAttemptId" TEXT,
    "practiceSessionId" TEXT,
    "submittedAnswer" TEXT NOT NULL,
    "correctReference" TEXT,
    "category" TEXT,
    "analysis" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MistakeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable AIInteraction
CREATE TABLE IF NOT EXISTS "AIInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT,
    "requestType" "AIRequestType" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_questionId_key" ON "AssessmentAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_idx" ON "AssessmentAnswer"("attemptId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAnswer_questionId_idx" ON "AssessmentAnswer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MistakeRecord_studentId_lessonId_idx" ON "MistakeRecord"("studentId", "lessonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MistakeRecord_studentId_resolved_idx" ON "MistakeRecord"("studentId", "resolved");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIInteraction_userId_requestType_idx" ON "AIInteraction"("userId", "requestType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AIInteraction_userId_createdAt_idx" ON "AIInteraction"("userId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MistakeRecord" ADD CONSTRAINT "MistakeRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MistakeRecord" ADD CONSTRAINT "MistakeRecord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MistakeRecord" ADD CONSTRAINT "MistakeRecord_assessmentAttemptId_fkey" FOREIGN KEY ("assessmentAttemptId") REFERENCES "QuizAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MistakeRecord" ADD CONSTRAINT "MistakeRecord_practiceSessionId_fkey" FOREIGN KEY ("practiceSessionId") REFERENCES "PracticeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AIInteraction" ADD CONSTRAINT "AIInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AIInteraction" ADD CONSTRAINT "AIInteraction_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
