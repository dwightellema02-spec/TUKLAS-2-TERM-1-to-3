-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "skill" TEXT,
    "explanation" TEXT,
    "learningObjective" TEXT,
    "difficulty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PracticeAnswer" ADD COLUMN "questionId" TEXT;

-- CreateIndex
CREATE INDEX "PracticeQuestion_sessionId_createdAt_idx" ON "PracticeQuestion"("sessionId", "createdAt");
CREATE UNIQUE INDEX "PracticeAnswer_questionId_key" ON "PracticeAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeAnswer" ADD CONSTRAINT "PracticeAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;