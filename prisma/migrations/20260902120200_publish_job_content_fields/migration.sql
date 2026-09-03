-- AlterTable
ALTER TABLE "PublishJob"
  ADD COLUMN "postGroupId" TEXT,
  ADD COLUMN "caption" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "title" TEXT,
  ADD COLUMN "mentions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isExplicit" BOOLEAN,
  ADD COLUMN "contentWarnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "tiktokPrivacyLevel" TEXT,
  ADD COLUMN "tiktokAllowComment" BOOLEAN,
  ADD COLUMN "tiktokAllowDuet" BOOLEAN,
  ADD COLUMN "tiktokAllowStitch" BOOLEAN,
  ADD COLUMN "tiktokConsentAt" TIMESTAMP(3);

-- Backfill: every existing job becomes its own single-record group
UPDATE "PublishJob" SET "postGroupId" = "id" WHERE "postGroupId" IS NULL;

-- AlterTable
ALTER TABLE "PublishJob" ALTER COLUMN "postGroupId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "PublishJob_postGroupId_idx" ON "PublishJob"("postGroupId");
