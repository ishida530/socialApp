-- Meta Data Deletion Request callback: app-scoped Facebook user ID of the person who connected the Page / Instagram account.
ALTER TABLE "SocialAccount" ADD COLUMN "metaUserId" TEXT;

CREATE INDEX "SocialAccount_metaUserId_idx" ON "SocialAccount"("metaUserId");
