-- AlterTable: AI quality fields (nullable, no backfill - older drafts simply have no note/AI copy)
ALTER TABLE "PublishJob" ADD COLUMN IF NOT EXISTS "sourceNote" TEXT;
ALTER TABLE "PublishJob" ADD COLUMN IF NOT EXISTS "aiCaption" TEXT;
