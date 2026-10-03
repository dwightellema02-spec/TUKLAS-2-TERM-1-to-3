-- CreateTable
CREATE TABLE "LessonDocument" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "charCount" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonDocument_lessonId_isActive_idx" ON "LessonDocument"("lessonId", "isActive");

-- CreateIndex
CREATE INDEX "DocumentChunk_lessonId_idx" ON "DocumentChunk"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_position_key" ON "DocumentChunk"("documentId", "position");

-- AddForeignKey
ALTER TABLE "LessonDocument" ADD CONSTRAINT "LessonDocument_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonDocument" ADD CONSTRAINT "LessonDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LessonDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

