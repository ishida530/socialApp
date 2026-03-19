-- Add editable tags column for videos
ALTER TABLE "Video"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[];

UPDATE "Video"
SET "tags" = ARRAY[]::TEXT[]
WHERE "tags" IS NULL;

ALTER TABLE "Video"
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Video"
  ALTER COLUMN "tags" SET NOT NULL;
