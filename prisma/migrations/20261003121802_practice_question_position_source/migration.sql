-- AlterTable
ALTER TABLE "PracticeQuestion" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quizQuestionId" TEXT;

-- CreateIndex
CREATE INDEX "PracticeQuestion_quizQuestionId_idx" ON "PracticeQuestion"("quizQuestionId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_sessionId_position_idx" ON "PracticeQuestion"("sessionId", "position");

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
