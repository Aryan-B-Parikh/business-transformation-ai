-- Security completion migration.
-- Adds RLS to tenant-owned tables introduced after the initial RLS migration.

ALTER TABLE "transformation_journeys" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "transformation_journeys";
CREATE POLICY tenant_isolation ON "transformation_journeys"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "transformation_journeys" FORCE ROW LEVEL SECURITY;

ALTER TABLE "journey_transitions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "journey_transitions";
CREATE POLICY tenant_isolation ON "journey_transitions"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "journey_transitions" FORCE ROW LEVEL SECURITY;

-- Refresh tokens are tenant-owned through their user relation. Add org_id so
-- isolation is enforced directly and does not depend on joins.
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "org_id" UUID;
UPDATE "refresh_tokens" rt SET "org_id" = u."org_id"
FROM "users" u WHERE u."id" = rt."user_id" AND rt."org_id" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "org_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "refresh_tokens_org_id_idx" ON "refresh_tokens"("org_id");
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "refresh_tokens";
CREATE POLICY tenant_isolation ON "refresh_tokens"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "transformation_journeys", "journey_transitions", "refresh_tokens" TO bta_app;
