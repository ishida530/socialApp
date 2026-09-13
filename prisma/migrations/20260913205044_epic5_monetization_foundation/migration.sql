-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSponsorshipSignalSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Fan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fanId" TEXT,
    "product" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "recordedVia" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "FanSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workTitle" TEXT NOT NULL,
    "splits" JSONB NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "RoyaltyRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncPitch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workTitle" TEXT NOT NULL,
    "pitchedTo" TEXT NOT NULL,
    "rightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncPitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fan_userId_idx" ON "Fan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_userId_email_key" ON "Fan"("userId", "email");

-- CreateIndex
CREATE INDEX "Sale_userId_createdAt_idx" ON "Sale"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FanSubscription_userId_idx" ON "FanSubscription"("userId");

-- CreateIndex
CREATE INDEX "RoyaltyRegistration_userId_idx" ON "RoyaltyRegistration"("userId");

-- CreateIndex
CREATE INDEX "SyncPitch_userId_idx" ON "SyncPitch"("userId");

-- AddForeignKey
ALTER TABLE "Fan" ADD CONSTRAINT "Fan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanSubscription" ADD CONSTRAINT "FanSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanSubscription" ADD CONSTRAINT "FanSubscription_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyRegistration" ADD CONSTRAINT "RoyaltyRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncPitch" ADD CONSTRAINT "SyncPitch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
