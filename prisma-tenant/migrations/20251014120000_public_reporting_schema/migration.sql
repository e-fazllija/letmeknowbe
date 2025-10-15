-- Enums
DO $$ BEGIN
  CREATE TYPE "ReporterPrivacy" AS ENUM ('ANONIMO', 'CONFIDENZIALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add value to ReportStatus
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ReportStatus' AND e.enumlabel = 'NEED_INFO'
  ) THEN
    ALTER TYPE "ReportStatus" ADD VALUE 'NEED_INFO';
  END IF;
END $$;

-- Tables: Department, Category, ReportAttachment
CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportAttachment" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportAttachment_pkey" PRIMARY KEY ("id")
);

-- Alter WhistleReport
ALTER TABLE "WhistleReport"
  ADD COLUMN IF NOT EXISTS "eventDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "privacy" "ReporterPrivacy" NOT NULL DEFAULT 'ANONIMO',
  ADD COLUMN IF NOT EXISTS "departmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "containsPIISuspected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ipHash" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "ua" TEXT,
  ADD COLUMN IF NOT EXISTS "retentionAt" TIMESTAMP(3);

-- Alter ReportMessage: add visibility
ALTER TABLE "ReportMessage"
  ADD COLUMN IF NOT EXISTS "visibility" "MessageVisibility" NOT NULL DEFAULT 'INTERNAL';

-- Indexes
CREATE INDEX IF NOT EXISTS "Department_clientId_active_sortOrder_idx" ON "Department"("clientId", "active", "sortOrder");
CREATE INDEX IF NOT EXISTS "Category_clientId_departmentId_active_sortOrder_idx" ON "Category"("clientId", "departmentId", "active", "sortOrder");
CREATE INDEX IF NOT EXISTS "ReportAttachment_reportId_idx" ON "ReportAttachment"("reportId");
CREATE INDEX IF NOT EXISTS "ReportMessage_reportId_createdAt_idx" ON "ReportMessage"("reportId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportMessage_reportId_visibility_idx" ON "ReportMessage"("reportId", "visibility");
CREATE INDEX IF NOT EXISTS "WhistleReport_clientId_publicCode_idx" ON "WhistleReport"("clientId", "publicCode");

-- FKs
DO $$ BEGIN
  ALTER TABLE "Category" ADD CONSTRAINT "Category_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhistleReport" ADD CONSTRAINT "WhistleReport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhistleReport" ADD CONSTRAINT "WhistleReport_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReportAttachment" ADD CONSTRAINT "ReportAttachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill (idempotente)
UPDATE "WhistleReport" SET "eventDate" = COALESCE("eventDate", "createdAt");
UPDATE "WhistleReport" SET "privacy" = 'ANONIMO' WHERE "privacy" IS NULL;
