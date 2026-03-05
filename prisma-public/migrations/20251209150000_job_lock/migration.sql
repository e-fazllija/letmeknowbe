-- Create job_lock table for global job locking (SLA/retention)
CREATE TABLE "job_lock" (
    "jobName" TEXT NOT NULL PRIMARY KEY,
    "lockedUntil" TIMESTAMP(3),
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default rows for known jobs (idempotent)
INSERT INTO "job_lock" ("jobName", "lockedUntil", "owner", "createdAt", "updatedAt")
VALUES
  ('SLA_REMINDER', NULL, NULL, NOW(), NOW()),
  ('RETENTION_PURGE', NULL, NULL, NOW(), NOW())
ON CONFLICT ("jobName") DO NOTHING;
