/**
 * In-Memory Domain Aggregate Repositories (Isolated for unit testing)
 */

import {
  IProjectAggregateRepository,
  IArtifactAggregateRepository,
  ITransformationAggregateRepository,
  IDocumentAggregateRepository,
  ICollaborationAggregateRepository,
  IWebhookAggregateRepository,
  IGovernanceAggregateRepository,
  WorkspaceEntity,
  ProjectEntity,
  ProjectMemberEntity,
  ArtifactEntity,
  ArtifactCommentEntity,
  JourneyStageEntity,
  DocumentEntity,
  DocumentChunkEntity,
  ArtifactApprovalEntity,
  NotificationEntity,
  WebhookConfigEntity,
  OutboxEventEntity,
  AuditLogEntity,
  AIModelConfigEntity,
} from "../interfaces";
import {
  ArtifactType,
  ArtifactStatus,
  ArtifactContent,
  UserRole,
  JourneyStage,
  JourneyStatus,
  DashboardMaturityModel,
  requireOrgId,
} from "@bta/shared";
import crypto from "crypto";

export class MemoryProjectRepository implements IProjectAggregateRepository {
  private workspaces = new Map<string, WorkspaceEntity>();
  private projects = new Map<string, ProjectEntity>();
  private members = new Map<string, ProjectMemberEntity>();

  async createWorkspace(orgId: string, data: { name: string; description?: string }): Promise<WorkspaceEntity> {
    requireOrgId(orgId);
    const ws: WorkspaceEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      name: data.name,
      description: data.description ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.workspaces.set(ws.id, ws);
    return ws;
  }

  async findWorkspaceById(orgId: string, id: string): Promise<WorkspaceEntity | null> {
    requireOrgId(orgId);
    const ws = this.workspaces.get(id);
    if (!ws || ws.org_id !== orgId) return null;
    return ws;
  }

  async listWorkspaces(orgId: string): Promise<WorkspaceEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.workspaces.values()).filter((w) => w.org_id === orgId);
  }

  async createProject(
    orgId: string,
    workspaceId: string,
    data: { name: string; description?: string }
  ): Promise<ProjectEntity> {
    requireOrgId(orgId);
    const prj: ProjectEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      workspace_id: workspaceId,
      name: data.name,
      description: data.description ?? null,
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.projects.set(prj.id, prj);
    return prj;
  }

  async findProjectById(orgId: string, id: string): Promise<ProjectEntity | null> {
    requireOrgId(orgId);
    const prj = this.projects.get(id);
    if (!prj || prj.org_id !== orgId) return null;
    return prj;
  }

  async listProjectsByWorkspace(orgId: string, workspaceId: string): Promise<ProjectEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.projects.values()).filter(
      (p) => p.org_id === orgId && p.workspace_id === workspaceId
    );
  }

  async addMember(orgId: string, projectId: string, userId: string, role: UserRole): Promise<ProjectMemberEntity> {
    requireOrgId(orgId);
    const mem: ProjectMemberEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      project_id: projectId,
      user_id: userId,
      role,
      created_at: new Date(),
    };
    this.members.set(mem.id, mem);
    return mem;
  }

  async listMembers(orgId: string, projectId: string): Promise<ProjectMemberEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.members.values()).filter(
      (m) => m.org_id === orgId && m.project_id === projectId
    );
  }
}

export class MemoryArtifactRepository implements IArtifactAggregateRepository {
  private artifacts = new Map<string, ArtifactEntity>();
  private comments = new Map<string, ArtifactCommentEntity>();

  async create(
    orgId: string,
    projectId: string,
    data: {
      type: ArtifactType;
      title: string;
      content: ArtifactContent;
      status?: ArtifactStatus;
      created_by?: string;
    }
  ): Promise<ArtifactEntity> {
    requireOrgId(orgId);
    const art: ArtifactEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      project_id: projectId,
      type: data.type,
      title: data.title,
      content: data.content,
      status: data.status ?? "draft",
      version: 1,
      created_by: data.created_by ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.artifacts.set(art.id, art);
    return art;
  }

  async findById(orgId: string, id: string): Promise<ArtifactEntity | null> {
    requireOrgId(orgId);
    const art = this.artifacts.get(id);
    if (!art || art.org_id !== orgId) return null;
    return art;
  }

  async listByProject(orgId: string, projectId: string): Promise<ArtifactEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.artifacts.values()).filter(
      (a) => a.org_id === orgId && a.project_id === projectId
    );
  }

  async createVersion(
    orgId: string,
    id: string,
    updates: {
      content?: ArtifactContent;
      title?: string;
      change_reason?: string;
      created_by?: string;
      status?: ArtifactStatus;
    }
  ): Promise<ArtifactEntity> {
    requireOrgId(orgId);
    const current = await this.findById(orgId, id);
    if (!current) throw new Error("Artifact not found");

    const newVersion: ArtifactEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      project_id: current.project_id,
      type: current.type,
      title: updates.title ?? current.title,
      content: updates.content ?? current.content,
      status: updates.status ?? "draft",
      version: current.version + 1,
      parent_id: current.id,
      change_reason: updates.change_reason ?? null,
      created_by: updates.created_by ?? current.created_by,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.artifacts.set(newVersion.id, newVersion);
    return newVersion;
  }

  async updateStatus(orgId: string, id: string, status: ArtifactStatus): Promise<ArtifactEntity> {
    requireOrgId(orgId);
    const current = await this.findById(orgId, id);
    if (!current) throw new Error("Artifact not found");
    current.status = status;
    current.updated_at = new Date();
    return current;
  }

  async addComment(orgId: string, artifactId: string, userId: string, content: string): Promise<ArtifactCommentEntity> {
    requireOrgId(orgId);
    const comment: ArtifactCommentEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      artifact_id: artifactId,
      user_id: userId,
      content,
      status: "open",
      created_at: new Date(),
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  async listComments(orgId: string, artifactId: string): Promise<ArtifactCommentEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.comments.values()).filter(
      (c) => c.org_id === orgId && c.artifact_id === artifactId
    );
  }
}

export class MemoryTransformationRepository implements ITransformationAggregateRepository {
  private stages = new Map<string, JourneyStageEntity>();
  private snapshots = new Map<string, DashboardMaturityModel>();

  async getJourneyState(orgId: string, projectId: string): Promise<JourneyStageEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.stages.values()).filter(
      (s) => s.org_id === orgId && s.project_id === projectId
    );
  }

  async transitionStage(
    orgId: string,
    projectId: string,
    stage: JourneyStage,
    status: JourneyStatus,
    userId?: string,
    blockedReason?: string
  ): Promise<JourneyStageEntity> {
    requireOrgId(orgId);
    const key = `${projectId}:${stage}`;
    const existing = this.stages.get(key);
    const entity: JourneyStageEntity = {
      id: existing?.id ?? crypto.randomUUID(),
      org_id: orgId,
      project_id: projectId,
      stage,
      status,
      entered_at: existing?.entered_at ?? new Date(),
      completed_at: status === "completed" ? new Date() : null,
      completed_by: userId ?? null,
      blocked_reason: blockedReason ?? null,
      stage_version: (existing?.stage_version ?? 0) + 1,
    };
    this.stages.set(key, entity);
    return entity;
  }

  async saveMaturitySnapshot(
    orgId: string,
    projectId: string,
    snapshot: DashboardMaturityModel
  ): Promise<void> {
    requireOrgId(orgId);
    this.snapshots.set(`${orgId}:${projectId}`, snapshot);
  }

  async getLatestMaturity(orgId: string, projectId: string): Promise<DashboardMaturityModel | null> {
    requireOrgId(orgId);
    return this.snapshots.get(`${orgId}:${projectId}`) ?? null;
  }
}

export class MemoryDocumentRepository implements IDocumentAggregateRepository {
  private documents = new Map<string, DocumentEntity>();
  private chunks = new Map<string, DocumentChunkEntity[]>();

  async createDocument(
    orgId: string,
    projectId: string,
    data: { filename: string; docType: string; fileSize: number; storageKey?: string }
  ): Promise<DocumentEntity> {
    requireOrgId(orgId);
    const doc: DocumentEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      project_id: projectId,
      filename: data.filename,
      doc_type: data.docType,
      file_size: data.fileSize,
      parsed_status: "pending",
      storage_key: data.storageKey ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.documents.set(doc.id, doc);
    return doc;
  }

  async findDocumentById(orgId: string, id: string): Promise<DocumentEntity | null> {
    requireOrgId(orgId);
    const doc = this.documents.get(id);
    if (!doc || doc.org_id !== orgId) return null;
    return doc;
  }

  async listDocumentsByProject(orgId: string, projectId: string): Promise<DocumentEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.documents.values()).filter(
      (d) => d.org_id === orgId && d.project_id === projectId
    );
  }

  async updateParsedStatus(orgId: string, id: string, status: "pending" | "parsed" | "failed"): Promise<DocumentEntity> {
    requireOrgId(orgId);
    const doc = await this.findDocumentById(orgId, id);
    if (!doc) throw new Error("Document not found");
    doc.parsed_status = status;
    doc.updated_at = new Date();
    return doc;
  }

  async addChunks(orgId: string, documentId: string, chunksData: Array<{ chunkIndex: number; content: string; pageNumber?: number; embedding?: number[] }>): Promise<DocumentChunkEntity[]> {
    requireOrgId(orgId);
    const entities: DocumentChunkEntity[] = chunksData.map((c) => ({
      id: crypto.randomUUID(),
      org_id: orgId,
      document_id: documentId,
      chunk_index: c.chunkIndex,
      content: c.content,
      page_number: c.pageNumber ?? null,
      embedding: c.embedding ?? null,
      created_at: new Date(),
    }));
    this.chunks.set(documentId, (this.chunks.get(documentId) || []).concat(entities));
    return entities;
  }

  async searchSimilarChunks(orgId: string, projectId: string, queryEmbedding: number[], topK: number): Promise<Array<DocumentChunkEntity & { score: number }>> {
    requireOrgId(orgId);
    const docs = await this.listDocumentsByProject(orgId, projectId);
    const allChunks: DocumentChunkEntity[] = [];
    for (const doc of docs) {
      const c = this.chunks.get(doc.id) || [];
      allChunks.push(...c);
    }
    return allChunks.slice(0, topK).map((c, i) => ({ ...c, score: 0.9 - i * 0.05 }));
  }
}

export class MemoryCollaborationRepository implements ICollaborationAggregateRepository {
  private approvals = new Map<string, ArtifactApprovalEntity>();
  private notifications = new Map<string, NotificationEntity>();

  async recordApproval(orgId: string, artifactId: string, userId: string, status: "approved" | "rejected" | "changes_requested", comment?: string): Promise<ArtifactApprovalEntity> {
    requireOrgId(orgId);
    const entity: ArtifactApprovalEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      artifact_id: artifactId,
      user_id: userId,
      status,
      comment: comment ?? null,
      created_at: new Date(),
    };
    this.approvals.set(entity.id, entity);
    return entity;
  }

  async listApprovals(orgId: string, artifactId: string): Promise<ArtifactApprovalEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.approvals.values()).filter((a) => a.org_id === orgId && a.artifact_id === artifactId);
  }

  async createNotification(orgId: string, userId: string, title: string, body: string): Promise<NotificationEntity> {
    requireOrgId(orgId);
    const notif: NotificationEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      user_id: userId,
      title,
      body,
      read: false,
      created_at: new Date(),
    };
    this.notifications.set(notif.id, notif);
    return notif;
  }

  async listNotifications(orgId: string, userId: string): Promise<NotificationEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.notifications.values()).filter((n) => n.org_id === orgId && n.user_id === userId);
  }

  async markNotificationRead(orgId: string, id: string): Promise<NotificationEntity> {
    requireOrgId(orgId);
    const notif = this.notifications.get(id);
    if (!notif || notif.org_id !== orgId) throw new Error("Notification not found");
    notif.read = true;
    return notif;
  }
}

export class MemoryWebhookRepository implements IWebhookAggregateRepository {
  private configs = new Map<string, WebhookConfigEntity>();
  private outbox = new Map<string, OutboxEventEntity>();

  async createConfig(orgId: string, workspaceId: string, data: { url: string; events: string[]; secret?: string }): Promise<WebhookConfigEntity> {
    requireOrgId(orgId);
    const cfg: WebhookConfigEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      workspace_id: workspaceId,
      url: data.url,
      events: data.events,
      secret: data.secret ?? null,
      created_at: new Date(),
    };
    this.configs.set(cfg.id, cfg);
    return cfg;
  }

  async listConfigs(orgId: string, workspaceId: string): Promise<WebhookConfigEntity[]> {
    requireOrgId(orgId);
    return Array.from(this.configs.values()).filter((c) => c.org_id === orgId && c.workspace_id === workspaceId);
  }

  async findConfigById(orgId: string, id: string): Promise<WebhookConfigEntity | null> {
    requireOrgId(orgId);
    const c = this.configs.get(id);
    if (!c || c.org_id !== orgId) return null;
    return c;
  }

  async queueOutboxEvent(orgId: string, eventType: string, aggregateId: string, payload: Record<string, unknown>): Promise<OutboxEventEntity> {
    requireOrgId(orgId);
    const evt: OutboxEventEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      event_type: eventType,
      aggregate_id: aggregateId,
      payload,
      status: "pending",
      attempt_count: 0,
      created_at: new Date(),
    };
    this.outbox.set(evt.id, evt);
    return evt;
  }

  async listPendingOutboxEvents(limit = 50): Promise<OutboxEventEntity[]> {
    return Array.from(this.outbox.values())
      .filter((e) => e.status === "pending")
      .slice(0, limit);
  }

  async markOutboxEventResult(id: string, status: "delivered" | "failed" | "dead_letter", error?: string): Promise<void> {
    const evt = this.outbox.get(id);
    if (!evt) return;
    evt.status = status;
    evt.attempt_count += 1;
    evt.last_error = error ?? null;
  }
}

export class MemoryGovernanceRepository implements IGovernanceAggregateRepository {
  private logs: AuditLogEntity[] = [];
  private aiConfigs = new Map<string, AIModelConfigEntity>();

  async recordAuditLog(orgId: string, actorId: string, action: string, resourceType: string, resourceId: string, details: Record<string, unknown>): Promise<AuditLogEntity> {
    requireOrgId(orgId);
    const log: AuditLogEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      created_at: new Date(),
    };
    this.logs.unshift(log);
    return log;
  }

  async listAuditLogs(orgId: string, limit = 100): Promise<AuditLogEntity[]> {
    requireOrgId(orgId);
    return this.logs.filter((l) => l.org_id === orgId).slice(0, limit);
  }

  async setAIModelConfig(orgId: string, module: string, config: { provider: string; model: string; temperature: number; max_tokens: number; enabled: boolean }): Promise<AIModelConfigEntity> {
    requireOrgId(orgId);
    const key = `${orgId}:${module}`;
    const entity: AIModelConfigEntity = {
      id: crypto.randomUUID(),
      org_id: orgId,
      module,
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      enabled: config.enabled,
      created_at: new Date(),
    };
    this.aiConfigs.set(key, entity);
    return entity;
  }

  async getAIModelConfig(orgId: string, module: string): Promise<AIModelConfigEntity | null> {
    requireOrgId(orgId);
    return this.aiConfigs.get(`${orgId}:${module}`) ?? null;
  }
}
