-- CreateTable
CREATE TABLE "AccountGrowthSnapshot" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountGrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountGrowthSnapshot_socialAccountId_fetchedAt_idx" ON "AccountGrowthSnapshot"("socialAccountId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "AccountGrowthSnapshot" ADD CONSTRAINT "AccountGrowthSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
