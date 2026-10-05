-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "misconceptionTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

