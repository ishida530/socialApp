-- CreateTable
CREATE TABLE "ClaudeUsageLog" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_createdAt_idx" ON "ClaudeUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_scope_createdAt_idx" ON "ClaudeUsageLog"("scope", "createdAt");
