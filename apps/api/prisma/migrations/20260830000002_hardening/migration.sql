-- Production hardening additions not represented by Prisma models because webhook delivery is raw-SQL backed.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "webhook_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE, "url" TEXT NOT NULL,
  "events" JSONB NOT NULL DEFAULT '[]'::jsonb, "secret" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_configs_org_workspace_idx ON "webhook_configs"("org_id","workspace_id");
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL, "aggregate_id" UUID NOT NULL, "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "last_error" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON "outbox_events"("status","next_retry_at");
CREATE INDEX IF NOT EXISTS outbox_org_idx ON "outbox_events"("org_id");
ALTER TABLE "webhook_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "webhook_configs";
CREATE POLICY tenant_isolation ON "webhook_configs" USING ("org_id"=current_org_id()) WITH CHECK ("org_id"=current_org_id());
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "outbox_events";
CREATE POLICY tenant_isolation ON "outbox_events" USING ("org_id"=current_org_id()) WITH CHECK ("org_id"=current_org_id());
