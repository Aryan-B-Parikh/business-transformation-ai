-- Make requestId idempotency DB-enforced for quota ledger
-- requestId is nullable for legacy rows; enforce uniqueness only when not null
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_logs_org_request_unique" ON "ai_usage_logs"("orgId", "requestId") WHERE "requestId" IS NOT NULL;
