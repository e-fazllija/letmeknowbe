-- Add AUDITOR role to enum (PostgreSQL enum alter)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'UserRole' AND e.enumlabel = 'AUDITOR') THEN
    ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AUDITOR';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create ReportAccessLog table if not exists
CREATE TABLE IF NOT EXISTS "ReportAccessLog" (
  "id" TEXT PRIMARY KEY,
  "reportId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ip" TEXT,
  "ua" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportAccessLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReportAccessLog_reportId_createdAt_idx" ON "ReportAccessLog" ("reportId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportAccessLog_userId_createdAt_idx" ON "ReportAccessLog" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportAccessLog_clientId_createdAt_idx" ON "ReportAccessLog" ("clientId", "createdAt");

-- Triggers for append-only trail
-- Block UPDATE/DELETE on ReportStatusHistory
CREATE OR REPLACE FUNCTION prevent_mod_status_history() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ReportStatusHistory is append-only';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER status_history_no_update BEFORE UPDATE ON "ReportStatusHistory" FOR EACH ROW EXECUTE FUNCTION prevent_mod_status_history();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER status_history_no_delete BEFORE DELETE ON "ReportStatusHistory" FOR EACH ROW EXECUTE FUNCTION prevent_mod_status_history();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Block DELETE and non-INTERNAL UPDATE on ReportMessage
CREATE OR REPLACE FUNCTION restrict_message_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ReportMessage delete not allowed';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."visibility" <> 'INTERNAL' THEN
      RAISE EXCEPTION 'Only INTERNAL messages can be updated';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER report_message_no_delete BEFORE DELETE ON "ReportMessage" FOR EACH ROW EXECUTE FUNCTION restrict_message_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER report_message_restrict_update BEFORE UPDATE ON "ReportMessage" FOR EACH ROW EXECUTE FUNCTION restrict_message_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
