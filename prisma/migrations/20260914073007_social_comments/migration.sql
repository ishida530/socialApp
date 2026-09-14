-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'REPLIED', 'IGNORED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramReplyingToCommentId" TEXT;

-- CreateTable
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publishJobId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedReply" TEXT,
    "telegramChatId" TEXT,
    "telegramMessageId" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialComment_userId_status_idx" ON "SocialComment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SocialComment_publishJobId_externalCommentId_key" ON "SocialComment"("publishJobId", "externalCommentId");

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
