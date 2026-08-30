CREATE TABLE IF NOT EXISTS "exports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "storage_key" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "exports_org_id_idx" ON "exports"("org_id");
CREATE INDEX IF NOT EXISTS "exports_project_id_idx" ON "exports"("project_id");
CREATE INDEX IF NOT EXISTS "exports_status_idx" ON "exports"("status");

ALTER TABLE "exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exports" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exports_tenant_isolation" ON "exports";
CREATE POLICY "exports_tenant_isolation" ON "exports"
  USING ("org_id"::text = current_setting('app.current_org_id', true))
  WITH CHECK ("org_id"::text = current_setting('app.current_org_id', true));
