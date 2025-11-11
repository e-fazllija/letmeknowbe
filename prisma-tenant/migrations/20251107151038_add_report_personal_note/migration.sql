-- CreateTable
CREATE TABLE "ReportPersonalNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPersonalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportPersonalNote_clientId_reportId_userId_idx" ON "ReportPersonalNote"("clientId", "reportId", "userId");

-- CreateIndex
CREATE INDEX "ReportPersonalNote_reportId_idx" ON "ReportPersonalNote"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPersonalNote_reportId_userId_key" ON "ReportPersonalNote"("reportId", "userId");

-- AddForeignKey
ALTER TABLE "ReportPersonalNote" ADD CONSTRAINT "ReportPersonalNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPersonalNote" ADD CONSTRAINT "ReportPersonalNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
