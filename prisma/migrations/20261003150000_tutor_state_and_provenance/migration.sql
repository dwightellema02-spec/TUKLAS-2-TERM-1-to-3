-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "hintLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "practiceQuestionId" TEXT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "intent" TEXT,
ADD COLUMN     "rung" INTEGER,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "ChatConversation_practiceQuestionId_idx" ON "ChatConversation"("practiceQuestionId");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_practiceQuestionId_fkey" FOREIGN KEY ("practiceQuestionId") REFERENCES "PracticeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

