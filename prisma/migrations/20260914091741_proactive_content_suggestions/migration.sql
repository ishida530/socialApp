-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'TEXT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastContentSuggestionSentAt" TIMESTAMP(3);
