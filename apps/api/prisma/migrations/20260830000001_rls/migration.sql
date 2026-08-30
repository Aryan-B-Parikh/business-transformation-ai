-- Migration: 20260830000001_rls
-- Row-Level Security policies keyed on org_id (03_DATA_MODEL.md §216, 02_TECHNICAL_ARCHITECTURE.md §5)
-- Tenant context is set via: SET LOCAL app.current_org_id = '<uuid>'
-- Each query must set this; without it, RLS returns zero rows (DoD for TASK-002)

-- Helper function (optional) to retrieve current org_id safely
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Enable RLS and create tenant_isolation policy on every table that carries org_id
-- Organizations is intentionally excluded — it has no org_id

-- Users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

-- Workspaces
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workspaces";
CREATE POLICY tenant_isolation ON "workspaces"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;

-- Projects
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "projects";
CREATE POLICY tenant_isolation ON "projects"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;

-- Project members
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "project_members";
CREATE POLICY tenant_isolation ON "project_members"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;

-- Documents
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "documents";
CREATE POLICY tenant_isolation ON "documents"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;

-- Document chunks (vector store namespace per tenant — 02 §5)
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "document_chunks";
CREATE POLICY tenant_isolation ON "document_chunks"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "document_chunks" FORCE ROW LEVEL SECURITY;

-- Conversations
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;

-- Conversation messages
ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversation_messages";
CREATE POLICY tenant_isolation ON "conversation_messages"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "conversation_messages" FORCE ROW LEVEL SECURITY;

-- Artifacts
ALTER TABLE "artifacts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "artifacts";
CREATE POLICY tenant_isolation ON "artifacts"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "artifacts" FORCE ROW LEVEL SECURITY;

-- Artifact comments
ALTER TABLE "artifact_comments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "artifact_comments";
CREATE POLICY tenant_isolation ON "artifact_comments"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "artifact_comments" FORCE ROW LEVEL SECURITY;

-- Artifact approvals
ALTER TABLE "artifact_approvals" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "artifact_approvals";
CREATE POLICY tenant_isolation ON "artifact_approvals"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "artifact_approvals" FORCE ROW LEVEL SECURITY;

-- Roadmap items
ALTER TABLE "roadmap_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "roadmap_items";
CREATE POLICY tenant_isolation ON "roadmap_items"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "roadmap_items" FORCE ROW LEVEL SECURITY;

-- Effort estimates
ALTER TABLE "effort_estimates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "effort_estimates";
CREATE POLICY tenant_isolation ON "effort_estimates"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "effort_estimates" FORCE ROW LEVEL SECURITY;

-- Maturity snapshots
ALTER TABLE "maturity_snapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "maturity_snapshots";
CREATE POLICY tenant_isolation ON "maturity_snapshots"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "maturity_snapshots" FORCE ROW LEVEL SECURITY;

-- Audit logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- AI model configs
ALTER TABLE "ai_model_configs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ai_model_configs";
CREATE POLICY tenant_isolation ON "ai_model_configs"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "ai_model_configs" FORCE ROW LEVEL SECURITY;

-- Notifications
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON "notifications"
  USING ("org_id" = current_org_id())
  WITH CHECK ("org_id" = current_org_id());
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

-- Grant minimal privileges to app role (create if not exists; idempotent)
-- The application should connect as bta_app (non-superuser) so RLS is enforced
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bta_app') THEN
    CREATE ROLE bta_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO bta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bta_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO bta_app;
