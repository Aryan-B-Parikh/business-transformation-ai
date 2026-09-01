-- Make request_id idempotency DB-enforced for quota ledger.
-- request_id is nullable for legacy rows; enforce uniqueness only when not null.
-- Existing migrations use snake_case database column names even though Prisma
-- exposes requestId/orgId in the client API.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_logs_org_request_unique"
  ON "ai_usage_logs"("org_id", "request_id")
  WHERE "request_id" IS NOT NULL;
