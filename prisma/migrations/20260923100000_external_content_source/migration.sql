-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "sourceKind" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Video_sourceRef_key" ON "Video"("sourceRef");
