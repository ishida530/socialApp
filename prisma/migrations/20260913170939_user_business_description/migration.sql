-- AlterTable
ALTER TABLE "User" ADD COLUMN     "businessDescription" TEXT,
ADD COLUMN     "telegramAwaitingBusinessDescription" BOOLEAN NOT NULL DEFAULT false;
