-- CreateTable
CREATE TABLE "TwoFactorTrustedDevice" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "TwoFactorTrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorTrustedDevice_tokenHash_key" ON "TwoFactorTrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorTrustedDevice_userId_expiresAt_idx" ON "TwoFactorTrustedDevice"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "TwoFactorTrustedDevice" ADD CONSTRAINT "TwoFactorTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
