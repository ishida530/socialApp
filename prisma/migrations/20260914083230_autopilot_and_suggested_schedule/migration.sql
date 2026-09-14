-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "suggestedScheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false;
