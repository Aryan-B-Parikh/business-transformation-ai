/**
 * In-Memory Domain Aggregate Repositories (Strictly for isolated unit tests)
 */

import {
  IProjectAggregateRepository,
  IArtifactAggregateRepository,
  ITransformationAggregateRepository,
  WorkspaceEntity,
  ProjectEntity,
  ProjectMemberEntity,
  ArtifactEntity,
  ArtifactCommentEntity,
  JourneyStageEntity,
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
