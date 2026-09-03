-- Data migration: fold the dead "Draft" model into PublishJob(status=DRAFT).
-- Only rows with a video and a matching connected SocialAccount for the same
-- user+platform can be migrated 1:1 (Draft.videoId was nullable and had no
-- required link to a social account, unlike PublishJob). Anything else was
-- already unreachable (no endpoint ever turned a Draft into a real post).
INSERT INTO "PublishJob" (
  "id", "status", "postGroupId", "caption", "hashtags", "title", "mentions",
  "isExplicit", "contentWarnings", "tiktokPrivacyLevel", "tiktokAllowComment",
  "tiktokAllowDuet", "tiktokAllowStitch", "tiktokConsentAt", "scheduledFor",
  "publishedAt", "remotePostId", "remotePostUrl", "errorMessage",
  "createdAt", "updatedAt", "videoId", "socialAccountId"
)
SELECT
  d."id", 'DRAFT', d."id", d."caption", d."hashtags", NULL, ARRAY[]::TEXT[],
  NULL, ARRAY[]::TEXT[], NULL, NULL,
  NULL, NULL, NULL, COALESCE(d."scheduledFor", NOW()),
  NULL, NULL, NULL, NULL,
  d."createdAt", d."updatedAt", d."videoId", sa."id"
FROM "Draft" d
JOIN LATERAL (
  SELECT sa2."id"
  FROM "SocialAccount" sa2
  WHERE sa2."userId" = d."userId" AND sa2."platform" = d."platform"
  ORDER BY sa2."updatedAt" DESC, sa2."createdAt" DESC
  LIMIT 1
) sa ON TRUE
WHERE d."videoId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_userId_fkey";
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_videoId_fkey";

-- DropTable
DROP TABLE "Draft";
