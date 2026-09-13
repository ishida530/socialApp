-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "excludedFromPublish" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "lastMetaPostFormat" TEXT,
ADD COLUMN     "lastTiktokAllowComment" BOOLEAN,
ADD COLUMN     "lastTiktokAllowDuet" BOOLEAN,
ADD COLUMN     "lastTiktokAllowStitch" BOOLEAN,
ADD COLUMN     "lastTiktokPrivacyLevel" TEXT;
