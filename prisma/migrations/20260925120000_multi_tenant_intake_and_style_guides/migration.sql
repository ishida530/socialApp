-- Per-account writing rules per platform + brand hashtag
ALTER TABLE "User" ADD COLUMN     "brandHashtag" TEXT,
ADD COLUMN     "platformStyleGuides" JSONB;

-- External intake idempotency is now scoped per account, not global
DROP INDEX "Video_sourceRef_key";

-- CreateIndex
CREATE UNIQUE INDEX "Video_userId_sourceRef_key" ON "Video"("userId", "sourceRef");

-- Per-account API keys for server-to-server integrations
CREATE TABLE "IntegrationKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationKey_keyHash_key" ON "IntegrationKey"("keyHash");

-- CreateIndex
CREATE INDEX "IntegrationKey_userId_idx" ON "IntegrationKey"("userId");

-- AddForeignKey
ALTER TABLE "IntegrationKey" ADD CONSTRAINT "IntegrationKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
