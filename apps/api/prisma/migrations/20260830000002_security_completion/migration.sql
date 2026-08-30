-- Security completion migration.
-- Adds RLS to tenant-owned tables introduced after the initial RLS migration.

-- Create Types and Tables that were missing in init
CREATE TYPE "JourneyStage" AS ENUM ('idea', 'discovery', 'business_analysis', 'solution_design', 'architecture', 'process_design', 'ux_design', 'data_design', 'planning', 'review', 'approved', 'implementation');

CREATE TABLE "transformation_journeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "current_stage" "JourneyStage" NOT NULL DEFAULT 'idea',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "entered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "actor" UUID NOT NULL,
    CONSTRAINT "transformation_journeys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journey_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journey_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "from_stage" "JourneyStage",
    "to_stage" "JourneyStage" NOT NULL,
    "actor" UUID NOT NULL,
    "reason" TEXT,
    "revision" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journey_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transformation_journeys_project_id_key" ON "transformation_journeys"("project_id");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

CREATE INDEX "transformation_journeys_org_id_idx" ON "transformation_journeys"("org_id");
CREATE INDEX "journey_transitions_org_id_idx" ON "journey_transitions"("org_id");
CREATE INDEX "journey_transitions_journey_id_idx" ON "journey_transitions"("journey_id");
CREATE INDEX "refresh_tokens_org_id_idx" ON "refresh_tokens"("org_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

ALTER TABLE "transformation_journeys" ADD CONSTRAINT "transformation_journeys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journey_transitions" ADD CONSTRAINT "journey_transitions_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "transformation_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "refresh_tokens";
CREATE POLICY tenant_isolation ON "refresh_tokens"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "transformation_journeys", "journey_transitions", "refresh_tokens" TO bta_app;
