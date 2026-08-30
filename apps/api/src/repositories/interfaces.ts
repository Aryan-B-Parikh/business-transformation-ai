/**
 * Domain Aggregate Repository Interfaces
 * Encapsulates domain logic without leaking 1:1 raw table structures.
 */

import {
  ArtifactType,
  ArtifactStatus,
  ArtifactContent,
  UserRole,
  JourneyStage,
  JourneyStatus,
  DashboardMaturityModel,
} from "@bta/shared";

// ==========================================
// Project & Workspace Aggregate
// ==========================================
export interface WorkspaceEntity {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectEntity {
  id: string;
  org_id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  status: "active" | "archived";
  created_at: Date;
  updated_at: Date;
}

export interface ProjectMemberEntity {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  role: UserRole;
  created_at: Date;
}

export interface IProjectAggregateRepository {
  createWorkspace(orgId: string, data: { name: string; description?: string }): Promise<WorkspaceEntity>;
  findWorkspaceById(orgId: string, id: string): Promise<WorkspaceEntity | null>;
  listWorkspaces(orgId: string): Promise<WorkspaceEntity[]>;

  createProject(
    orgId: string,
    workspaceId: string,
    data: { name: string; description?: string }
  ): Promise<ProjectEntity>;
  findProjectById(orgId: string, id: string): Promise<ProjectEntity | null>;
  listProjectsByWorkspace(orgId: string, workspaceId: string): Promise<ProjectEntity[]>;

  addMember(orgId: string, projectId: string, userId: string, role: UserRole): Promise<ProjectMemberEntity>;
  listMembers(orgId: string, projectId: string): Promise<ProjectMemberEntity[]>;
}

// ==========================================
// Artifact Aggregate (with Versioning & Approvals)
// ==========================================
export interface ArtifactEntity {
  id: string;
  org_id: string;
  project_id: string;
  type: ArtifactType;
  title: string;
  content: ArtifactContent;
  status: ArtifactStatus;
  version: number;
  parent_id?: string | null;
  change_reason?: string | null;
  created_by?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ArtifactCommentEntity {
  id: string;
  org_id: string;
  artifact_id: string;
  user_id: string;
  content: string;
  status: "open" | "resolved";
  created_at: Date;
}

export interface IArtifactAggregateRepository {
  create(
    orgId: string,
    projectId: string,
    data: {
      type: ArtifactType;
      title: string;
      content: ArtifactContent;
      status?: ArtifactStatus;
      created_by?: string;
    }
  ): Promise<ArtifactEntity>;

  findById(orgId: string, id: string): Promise<ArtifactEntity | null>;
  listByProject(orgId: string, projectId: string): Promise<ArtifactEntity[]>;

  createVersion(
    orgId: string,
    id: string,
    updates: {
      content?: ArtifactContent;
      title?: string;
      change_reason?: string;
      created_by?: string;
      status?: ArtifactStatus;
    }
  ): Promise<ArtifactEntity>;

  updateStatus(orgId: string, id: string, status: ArtifactStatus): Promise<ArtifactEntity>;
  addComment(orgId: string, artifactId: string, userId: string, content: string): Promise<ArtifactCommentEntity>;
  listComments(orgId: string, artifactId: string): Promise<ArtifactCommentEntity[]>;
}

// ==========================================
// Transformation & Journey Aggregate
// ==========================================
export interface JourneyStageEntity {
  id: string;
  org_id: string;
  project_id: string;
  stage: JourneyStage;
  status: JourneyStatus;
  entered_at: Date;
  completed_at?: Date | null;
  completed_by?: string | null;
  blocked_reason?: string | null;
  stage_version: number;
}

export interface ITransformationAggregateRepository {
  getJourneyState(orgId: string, projectId: string): Promise<JourneyStageEntity[]>;
  transitionStage(
    orgId: string,
    projectId: string,
    stage: JourneyStage,
    status: JourneyStatus,
    userId?: string,
    blockedReason?: string
  ): Promise<JourneyStageEntity>;

  saveMaturitySnapshot(
    orgId: string,
    projectId: string,
    snapshot: DashboardMaturityModel
  ): Promise<void>;
  getLatestMaturity(orgId: string, projectId: string): Promise<DashboardMaturityModel | null>;
}

// ==========================================
// Document Aggregate
// ==========================================
export interface DocumentEntity {
  id: string;
  org_id: string;
  project_id: string;
  filename: string;
  doc_type: string;
  file_size: number;
  parsed_status: "pending" | "parsed" | "failed";
  storage_key?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentChunkEntity {
  id: string;
  org_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page_number?: number | null;
  embedding?: number[] | null;
  created_at: Date;
}

export interface IDocumentAggregateRepository {
  createDocument(
    orgId: string,
    projectId: string,
    data: { filename: string; docType: string; fileSize: number; storageKey?: string }
  ): Promise<DocumentEntity>;
  findDocumentById(orgId: string, id: string): Promise<DocumentEntity | null>;
  listDocumentsByProject(orgId: string, projectId: string): Promise<DocumentEntity[]>;
  updateParsedStatus(orgId: string, id: string, status: "pending" | "parsed" | "failed"): Promise<DocumentEntity>;
  addChunks(orgId: string, documentId: string, chunks: Array<{ chunkIndex: number; content: string; pageNumber?: number; embedding?: number[] }>): Promise<DocumentChunkEntity[]>;
  searchSimilarChunks(orgId: string, projectId: string, queryEmbedding: number[], topK: number): Promise<Array<DocumentChunkEntity & { score: number }>>;
}

// ==========================================
// Collaboration & Approvals Aggregate
// ==========================================
export interface ArtifactApprovalEntity {
  id: string;
  org_id: string;
  artifact_id: string;
  user_id: string;
  status: "approved" | "rejected" | "changes_requested";
  comment?: string | null;
  created_at: Date;
}

export interface NotificationEntity {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: Date;
}

export interface ICollaborationAggregateRepository {
  recordApproval(orgId: string, artifactId: string, userId: string, status: "approved" | "rejected" | "changes_requested", comment?: string): Promise<ArtifactApprovalEntity>;
  listApprovals(orgId: string, artifactId: string): Promise<ArtifactApprovalEntity[]>;
  createNotification(orgId: string, userId: string, title: string, body: string): Promise<NotificationEntity>;
  listNotifications(orgId: string, userId: string): Promise<NotificationEntity[]>;
  markNotificationRead(orgId: string, id: string): Promise<NotificationEntity>;
}

// ==========================================
// Webhook & Outbox Aggregate
// ==========================================
export interface WebhookConfigEntity {
  id: string;
  org_id: string;
  workspace_id: string;
  url: string;
  events: string[];
  secret?: string | null;
  created_at: Date;
}

export interface OutboxEventEntity {
  id: string;
  org_id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed" | "dead_letter";
  attempt_count: number;
  next_retry_at?: Date | null;
  last_error?: string | null;
  created_at: Date;
}

export interface IWebhookAggregateRepository {
  createConfig(orgId: string, workspaceId: string, data: { url: string; events: string[]; secret?: string }): Promise<WebhookConfigEntity>;
  listConfigs(orgId: string, workspaceId: string): Promise<WebhookConfigEntity[]>;
  findConfigById(orgId: string, id: string): Promise<WebhookConfigEntity | null>;
  queueOutboxEvent(orgId: string, eventType: string, aggregateId: string, payload: Record<string, unknown>): Promise<OutboxEventEntity>;
  listPendingOutboxEvents(limit?: number): Promise<OutboxEventEntity[]>;
  markOutboxEventResult(id: string, status: "delivered" | "failed" | "dead_letter", error?: string): Promise<void>;
}

// ==========================================
// Governance & Audit Aggregate
// ==========================================
export interface AuditLogEntity {
  id: string;
  org_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  created_at: Date;
}

export interface AIModelConfigEntity {
  id: string;
  org_id: string;
  module: string;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
  created_at: Date;
}

export interface IGovernanceAggregateRepository {
  recordAuditLog(orgId: string, actorId: string, action: string, resourceType: string, resourceId: string, details: Record<string, unknown>): Promise<AuditLogEntity>;
  listAuditLogs(orgId: string, limit?: number): Promise<AuditLogEntity[]>;
  setAIModelConfig(orgId: string, module: string, config: { provider: string; model: string; temperature: number; max_tokens: number; enabled: boolean }): Promise<AIModelConfigEntity>;
  getAIModelConfig(orgId: string, module: string): Promise<AIModelConfigEntity | null>;
}

