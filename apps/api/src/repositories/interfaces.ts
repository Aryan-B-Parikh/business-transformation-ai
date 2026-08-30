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
