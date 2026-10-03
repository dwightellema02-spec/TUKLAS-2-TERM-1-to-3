-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED');

-- CreateTable
CREATE TABLE "SkillMastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "status" "MasteryStatus" NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "recentAccuracy" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL,
    "masteryVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillMasteryHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "previousStatus" "MasteryStatus",
    "newStatus" "MasteryStatus" NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "masteryVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillMasteryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillMastery_skillId_status_idx" ON "SkillMastery"("skillId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SkillMastery_studentId_skillId_key" ON "SkillMastery"("studentId", "skillId");

-- CreateIndex
CREATE INDEX "SkillMasteryHistory_studentId_skillId_createdAt_idx" ON "SkillMasteryHistory"("studentId", "skillId", "createdAt");

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMasteryHistory" ADD CONSTRAINT "SkillMasteryHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMasteryHistory" ADD CONSTRAINT "SkillMasteryHistory_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
