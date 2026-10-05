-- CreateTable
CREATE TABLE "ReplyReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyReport_createdAt_idx" ON "ReplyReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyReport_messageId_studentId_key" ON "ReplyReport"("messageId", "studentId");

-- AddForeignKey
ALTER TABLE "ReplyReport" ADD CONSTRAINT "ReplyReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyReport" ADD CONSTRAINT "ReplyReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

