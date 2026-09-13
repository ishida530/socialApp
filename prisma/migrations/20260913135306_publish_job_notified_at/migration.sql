-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PublishJob_status_notifiedAt_idx" ON "PublishJob"("status", "notifiedAt");
