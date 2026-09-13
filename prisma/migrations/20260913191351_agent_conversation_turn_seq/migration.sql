-- DropIndex
DROP INDEX "AgentConversationTurn_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "AgentConversationTurn" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "AgentConversationTurn_userId_seq_idx" ON "AgentConversationTurn"("userId", "seq");
