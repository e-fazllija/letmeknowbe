-- Attachment pipeline: enum + columns on ReportAttachment
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttachmentStatus') THEN
    CREATE TYPE "AttachmentStatus" AS ENUM ('UPLOADED','SCANNING','CLEAN','INFECTED');
  END IF;
END $$;

ALTER TABLE "ReportAttachment"
  ADD COLUMN IF NOT EXISTS "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS "etag" TEXT,
  ADD COLUMN IF NOT EXISTS "finalKey" TEXT,
  ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "virusName" TEXT;

-- Ensure existing rows have a status
UPDATE "ReportAttachment" SET "status" = 'UPLOADED' WHERE "status" IS NULL;

