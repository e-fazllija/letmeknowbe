-- CreateTable
CREATE TABLE "ReportAuditor" (
    "reportId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAuditor_pkey" PRIMARY KEY ("reportId","auditorId")
);

-- CreateIndex
CREATE INDEX "ReportAuditor_auditorId_reportId_idx" ON "ReportAuditor"("auditorId", "reportId");

-- CreateIndex
CREATE INDEX "ReportAuditor_reportId_idx" ON "ReportAuditor"("reportId");

-- AddForeignKey
ALTER TABLE "ReportAuditor" ADD CONSTRAINT "ReportAuditor_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAuditor" ADD CONSTRAINT "ReportAuditor_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "InternalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
