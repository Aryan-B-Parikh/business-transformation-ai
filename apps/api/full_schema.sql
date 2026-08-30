-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('trial', 'standard', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('org_admin', 'workspace_admin', 'contributor', 'reviewer', 'viewer');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'contributor', 'reviewer', 'viewer');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('pdf', 'pptx', 'docx', 'sop', 'brd', 'other');

-- CreateEnum
CREATE TYPE "ParsedStatus" AS ENUM ('pending', 'parsed', 'failed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'ai');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('recommendation', 'business_analysis', 'architecture_hld', 'architecture_lld', 'process_workflow', 'bpmn_diagram', 'wireframe', 'er_diagram', 'api_spec', 'roadmap', 'effort_estimate', 'dashboard_snapshot');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('draft', 'in_review', 'approved');

-- CreateEnum
CREATE TYPE "GeneratedBy" AS ENUM ('ai', 'user', 'hybrid');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected', 'changes_requested');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "JourneyStage" AS ENUM ('idea', 'discovery', 'business_analysis', 'solution_design', 'architecture', 'process_design', 'ux_design', 'data_design', 'planning', 'review', 'approved', 'implementation');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "max_projects" INTEGER NOT NULL DEFAULT 10,
    "max_users" INTEGER NOT NULL DEFAULT 50,
    "max_storage_mb" INTEGER NOT NULL DEFAULT 5000,
    "ai_token_quota" INTEGER NOT NULL DEFAULT 1000000,
    "ai_token_used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "sso_provider" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "org_id" UUID NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storage_url" TEXT NOT NULL,
    "parsed_status" "ParsedStatus" NOT NULL DEFAULT 'pending',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1536),
    "page_ref" INTEGER,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "started_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "diagram_url" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_artifact_id" UUID,
    "generated_by" "GeneratedBy" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_revision" INTEGER,
    "formula_version" TEXT,
    "prompt_version" TEXT,
    "model" TEXT,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "start_estimate" DATE NOT NULL,
    "end_estimate" DATE NOT NULL,
    "dependencies" UUID[],

    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "effort_estimates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "effort_hours" DECIMAL(10,2) NOT NULL,
    "cost_estimate" DECIMAL(12,2) NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,

    CONSTRAINT "effort_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maturity_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "digital_maturity_score" DECIMAL(5,2) NOT NULL,
    "ai_readiness_score" DECIMAL(5,2) NOT NULL,
    "automation_opportunity_score" DECIMAL(5,2) NOT NULL,
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maturity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ai_model_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "storage_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE INDEX "workspaces_org_id_idx" ON "workspaces"("org_id");

-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "project_members_org_id_idx" ON "project_members"("org_id");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "documents_org_id_idx" ON "documents"("org_id");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "document_chunks_org_id_idx" ON "document_chunks"("org_id");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- CreateIndex
CREATE INDEX "conversations_org_id_idx" ON "conversations"("org_id");

-- CreateIndex
CREATE INDEX "conversations_project_id_idx" ON "conversations"("project_id");

-- CreateIndex
CREATE INDEX "conversation_messages_org_id_idx" ON "conversation_messages"("org_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "artifacts_org_id_idx" ON "artifacts"("org_id");

-- CreateIndex
CREATE INDEX "artifacts_project_id_idx" ON "artifacts"("project_id");

-- CreateIndex
CREATE INDEX "artifacts_type_idx" ON "artifacts"("type");

-- CreateIndex
CREATE INDEX "artifacts_parent_artifact_id_idx" ON "artifacts"("parent_artifact_id");

-- CreateIndex
CREATE INDEX "artifact_comments_org_id_idx" ON "artifact_comments"("org_id");

-- CreateIndex
CREATE INDEX "artifact_comments_artifact_id_idx" ON "artifact_comments"("artifact_id");

-- CreateIndex
CREATE INDEX "artifact_approvals_org_id_idx" ON "artifact_approvals"("org_id");

-- CreateIndex
CREATE INDEX "artifact_approvals_artifact_id_idx" ON "artifact_approvals"("artifact_id");

-- CreateIndex
CREATE INDEX "roadmap_items_org_id_idx" ON "roadmap_items"("org_id");

-- CreateIndex
CREATE INDEX "roadmap_items_artifact_id_idx" ON "roadmap_items"("artifact_id");

-- CreateIndex
CREATE INDEX "effort_estimates_org_id_idx" ON "effort_estimates"("org_id");

-- CreateIndex
CREATE INDEX "effort_estimates_artifact_id_idx" ON "effort_estimates"("artifact_id");

-- CreateIndex
CREATE INDEX "maturity_snapshots_org_id_idx" ON "maturity_snapshots"("org_id");

-- CreateIndex
CREATE INDEX "maturity_snapshots_project_id_idx" ON "maturity_snapshots"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "transformation_journeys_project_id_key" ON "transformation_journeys"("project_id");

-- CreateIndex
CREATE INDEX "transformation_journeys_org_id_idx" ON "transformation_journeys"("org_id");

-- CreateIndex
CREATE INDEX "journey_transitions_org_id_idx" ON "journey_transitions"("org_id");

-- CreateIndex
CREATE INDEX "journey_transitions_journey_id_idx" ON "journey_transitions"("journey_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_org_id_idx" ON "refresh_tokens"("org_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "ai_model_configs_org_id_idx" ON "ai_model_configs"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_configs_org_id_module_key" ON "ai_model_configs"("org_id", "module");

-- CreateIndex
CREATE INDEX "notifications_org_id_idx" ON "notifications"("org_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "webhook_configs_org_id_idx" ON "webhook_configs"("org_id");

-- CreateIndex
CREATE INDEX "webhook_configs_workspace_id_idx" ON "webhook_configs"("workspace_id");

-- CreateIndex
CREATE INDEX "outbox_events_org_id_idx" ON "outbox_events"("org_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_idx" ON "outbox_events"("status");

-- CreateIndex
CREATE INDEX "exports_org_id_idx" ON "exports"("org_id");

-- CreateIndex
CREATE INDEX "exports_project_id_idx" ON "exports"("project_id");

-- CreateIndex
CREATE INDEX "exports_status_idx" ON "exports"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "artifact_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_approvals" ADD CONSTRAINT "artifact_approvals_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_approvals" ADD CONSTRAINT "artifact_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effort_estimates" ADD CONSTRAINT "effort_estimates_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maturity_snapshots" ADD CONSTRAINT "maturity_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_journeys" ADD CONSTRAINT "transformation_journeys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_transitions" ADD CONSTRAINT "journey_transitions_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "transformation_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

