-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "mediaType" "MediaType" NOT NULL DEFAULT 'VIDEO';
