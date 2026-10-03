-- CreateTable
CREATE TABLE "LessonCheckAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "selectedIndex" INTEGER,
    "answerText" TEXT,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonCheckAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonCheckAttempt_studentId_lessonId_correct_idx" ON "LessonCheckAttempt"("studentId", "lessonId", "correct");

-- CreateIndex
CREATE INDEX "LessonCheckAttempt_checkId_idx" ON "LessonCheckAttempt"("checkId");

-- AddForeignKey
ALTER TABLE "LessonCheckAttempt" ADD CONSTRAINT "LessonCheckAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCheckAttempt" ADD CONSTRAINT "LessonCheckAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCheckAttempt" ADD CONSTRAINT "LessonCheckAttempt_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "LessonCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
