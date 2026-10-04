-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "state" JSONB;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "action" TEXT,
ADD COLUMN     "strategy" TEXT;

