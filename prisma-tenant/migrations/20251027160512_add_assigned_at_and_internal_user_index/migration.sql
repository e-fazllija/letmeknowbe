-- AlterTable
ALTER TABLE "WhistleReport" ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WhistleReport_internalUserId_idx" ON "WhistleReport"("internalUserId");
