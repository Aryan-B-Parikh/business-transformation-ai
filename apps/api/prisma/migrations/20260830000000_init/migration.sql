-- Migration: 20260830000000_init
-- Creates all tables from 03_DATA_MODEL.md with pgvector support
-- RLS policies are applied in the follow-up 20260830000001_rls migration

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums
CREATE TYPE "OrgPlan" AS ENUM ('trial', 'standard', 'enterprise');
CREATE TYPE "UserRole" AS ENUM ('org_admin', 'workspace_admin', 'contributor', 'reviewer', 'viewer');
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'contributor', 'reviewer', 'viewer');
CREATE TYPE "DocumentType" AS ENUM ('pdf', 'pptx', 'docx', 'sop', 'brd', 'other');
CREATE TYPE "ParsedStatus" AS ENUM ('pending', 'parsed', 'failed');
CREATE TYPE "MessageRole" AS ENUM ('user', 'ai');
CREATE TYPE "ArtifactType" AS ENUM ('recommendation', 'business_analysis', 'architecture_hld', 'architecture_lld', 'process_workflow', 'bpmn_diagram', 'wireframe', 'er_diagram', 'api_spec', 'roadmap', 'effort_estimate', 'dashboard_snapshot');
CREATE TYPE "ArtifactStatus" AS ENUM ('draft', 'in_review', 'approved');
CREATE TYPE "GeneratedBy" AS ENUM ('ai', 'user', 'hybrid');
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected', 'changes_requested');
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- Organizations (no org_id — tenant root)
CREATE TABLE "organizations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "plan" "OrgPlan" NOT NULL DEFAULT 'trial',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "sso_provider" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("org_id", "email")
);
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- Workspaces
CREATE TABLE "workspaces" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "workspaces_org_id_idx" ON "workspaces"("org_id");

-- Projects
CREATE TABLE "projects" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- Project members (with org_id for RLS — see 03_DATA_MODEL.md §216 note)
CREATE TABLE "project_members" (
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "ProjectMemberRole" NOT NULL,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  PRIMARY KEY ("project_id", "user_id")
);
CREATE INDEX "project_members_org_id_idx" ON "project_members"("org_id");
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- Documents
CREATE TABLE "documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "filename" TEXT NOT NULL,
  "type" "DocumentType" NOT NULL,
  "storage_url" TEXT NOT NULL,
  "parsed_status" "ParsedStatus" NOT NULL DEFAULT 'pending',
  "uploaded_by" UUID NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "documents_org_id_idx" ON "documents"("org_id");
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- Document chunks (vector embeddings)
CREATE TABLE "document_chunks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "chunk_text" TEXT NOT NULL,
  "embedding" vector(1536),
  "page_ref" INTEGER
);
CREATE INDEX "document_chunks_org_id_idx" ON "document_chunks"("org_id");
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");
-- Vector similarity index (IVFFlat — requires data; optional for fresh DB)
-- CREATE INDEX "document_chunks_embedding_idx" ON "document_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Conversations
CREATE TABLE "conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "started_by" UUID NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "conversations_org_id_idx" ON "conversations"("org_id");
CREATE INDEX "conversations_project_id_idx" ON "conversations"("project_id");

-- Conversation messages
CREATE TABLE "conversation_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "conversation_messages_org_id_idx" ON "conversation_messages"("org_id");
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages"("conversation_id");

-- Artifacts
CREATE TABLE "artifacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type" "ArtifactType" NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'draft',
  "content" JSONB NOT NULL,
  "diagram_url" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "parent_artifact_id" UUID REFERENCES "artifacts"("id"),
  "generated_by" "GeneratedBy" NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "artifacts_no_auto_approve" CHECK (NOT ("generated_by" = 'ai' AND "status" = 'approved'))
);
CREATE INDEX "artifacts_org_id_idx" ON "artifacts"("org_id");
CREATE INDEX "artifacts_project_id_idx" ON "artifacts"("project_id");
CREATE INDEX "artifacts_type_idx" ON "artifacts"("type");
CREATE INDEX "artifacts_parent_artifact_id_idx" ON "artifacts"("parent_artifact_id");

-- Artifact comments
CREATE TABLE "artifact_comments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" UUID NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id"),
  "parent_comment_id" UUID REFERENCES "artifact_comments"("id"),
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "artifact_comments_org_id_idx" ON "artifact_comments"("org_id");
CREATE INDEX "artifact_comments_artifact_id_idx" ON "artifact_comments"("artifact_id");

-- Artifact approvals
CREATE TABLE "artifact_approvals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" UUID NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "approver_id" UUID NOT NULL REFERENCES "users"("id"),
  "decision" "ApprovalDecision" NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "artifact_approvals_org_id_idx" ON "artifact_approvals"("org_id");
CREATE INDEX "artifact_approvals_artifact_id_idx" ON "artifact_approvals"("artifact_id");

-- Roadmap items
CREATE TABLE "roadmap_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" UUID NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "start_estimate" DATE NOT NULL,
  "end_estimate" DATE NOT NULL,
  "dependencies" UUID[] NOT NULL DEFAULT '{}',
  CONSTRAINT "roadmap_no_circular_self" CHECK ("id" != ALL("dependencies"))
);
CREATE INDEX "roadmap_items_org_id_idx" ON "roadmap_items"("org_id");
CREATE INDEX "roadmap_items_artifact_id_idx" ON "roadmap_items"("artifact_id");

-- Effort estimates
CREATE TABLE "effort_estimates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" UUID NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "item_name" TEXT NOT NULL,
  "effort_hours" DECIMAL(10,2) NOT NULL,
  "cost_estimate" DECIMAL(12,2) NOT NULL,
  "risk_level" "RiskLevel" NOT NULL
);
CREATE INDEX "effort_estimates_org_id_idx" ON "effort_estimates"("org_id");
CREATE INDEX "effort_estimates_artifact_id_idx" ON "effort_estimates"("artifact_id");

-- Maturity snapshots
CREATE TABLE "maturity_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "digital_maturity_score" DECIMAL(5,2) NOT NULL,
  "ai_readiness_score" DECIMAL(5,2) NOT NULL,
  "automation_opportunity_score" DECIMAL(5,2) NOT NULL,
  "captured_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "maturity_snapshots_org_id_idx" ON "maturity_snapshots"("org_id");
CREATE INDEX "maturity_snapshots_project_id_idx" ON "maturity_snapshots"("project_id");

-- Audit logs
CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "actor_id" UUID NOT NULL REFERENCES "users"("id"),
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" UUID NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AI model configs
CREATE TABLE "ai_model_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "module" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model_name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE ("org_id", "module")
);
CREATE INDEX "ai_model_configs_org_id_idx" ON "ai_model_configs"("org_id");

-- Notifications
CREATE TABLE "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "notifications_org_id_idx" ON "notifications"("org_id");
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
