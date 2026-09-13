-- CreateTable
CREATE TABLE "AgentConversationTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentConversationTurn_userId_createdAt_idx" ON "AgentConversationTurn"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentConversationTurn" ADD CONSTRAINT "AgentConversationTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
