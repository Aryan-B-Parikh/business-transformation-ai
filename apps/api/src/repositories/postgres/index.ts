/**
 * PostgreSQL Prisma-Backed Domain Aggregate Repositories
 * Uses transaction-scoped parameterized set_config('app.current_org_id', $1, true)
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
import { withTenant, assertTenant } from "../../db/tenant";

// Extended Prisma interface matching our DB client
export interface PrismaClientType {
  $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown>;
  workspace: {
    create: (args: unknown) => Promise<WorkspaceEntity>;
    findFirst: (args: unknown) => Promise<WorkspaceEntity | null>;
    findMany: (args: unknown) => Promise<WorkspaceEntity[]>;
  };
  project: {
    create: (args: unknown) => Promise<ProjectEntity>;
    findFirst: (args: unknown) => Promise<ProjectEntity | null>;
    findMany: (args: unknown) => Promise<ProjectEntity[]>;
  };
  projectMember: {
    create: (args: unknown) => Promise<ProjectMemberEntity>;
    findMany: (args: unknown) => Promise<ProjectMemberEntity[]>;
  };
  artifact: {
    create: (args: unknown) => Promise<ArtifactEntity>;
    findFirst: (args: unknown) => Promise<ArtifactEntity | null>;
    findMany: (args: unknown) => Promise<ArtifactEntity[]>;
    update: (args: unknown) => Promise<ArtifactEntity>;
  };
  artifactComment: {
    create: (args: unknown) => Promise<ArtifactCommentEntity>;
    findMany: (args: unknown) => Promise<ArtifactCommentEntity[]>;
  };
  maturitySnapshot: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<unknown>;
  };
}

export class PostgresProjectRepository implements IProjectAggregateRepository {
  constructor(private prisma: PrismaClientType) {}

  async createWorkspace(orgId: string, data: { name: string; description?: string }): Promise<WorkspaceEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.workspace.create({
        data: {
          org_id: orgId,
          name: data.name,
          description: data.description,
        },
      });
    });
  }

  async findWorkspaceById(orgId: string, id: string): Promise<WorkspaceEntity | null> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.workspace.findFirst({
        where: { id, org_id: orgId },
      });
    });
  }

  async listWorkspaces(orgId: string): Promise<WorkspaceEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.workspace.findMany({
        where: { org_id: orgId },
      });
    });
  }

  async createProject(
    orgId: string,
    workspaceId: string,
    data: { name: string; description?: string }
  ): Promise<ProjectEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.project.create({
        data: {
          org_id: orgId,
          workspace_id: workspaceId,
          name: data.name,
          description: data.description,
          status: "active",
        },
      });
    });
  }

  async findProjectById(orgId: string, id: string): Promise<ProjectEntity | null> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.project.findFirst({
        where: { id, org_id: orgId },
      });
    });
  }

  async listProjectsByWorkspace(orgId: string, workspaceId: string): Promise<ProjectEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.project.findMany({
        where: { org_id: orgId, workspace_id: workspaceId },
      });
    });
  }

  async addMember(orgId: string, projectId: string, userId: string, role: UserRole): Promise<ProjectMemberEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.projectMember.create({
        data: {
          org_id: orgId,
          project_id: projectId,
          user_id: userId,
          role,
        },
      });
    });
  }

  async listMembers(orgId: string, projectId: string): Promise<ProjectMemberEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.projectMember.findMany({
        where: { org_id: orgId, project_id: projectId },
      });
    });
  }
}

export class PostgresArtifactRepository implements IArtifactAggregateRepository {
  constructor(private prisma: PrismaClientType) {}

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
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifact.create({
        data: {
          org_id: orgId,
          project_id: projectId,
          type: data.type,
          title: data.title,
          content: data.content,
          status: data.status ?? "draft",
          version: 1,
          created_by: data.created_by,
        },
      });
    });
  }

  async findById(orgId: string, id: string): Promise<ArtifactEntity | null> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifact.findFirst({
        where: { id, org_id: orgId },
      });
    });
  }

  async listByProject(orgId: string, projectId: string): Promise<ArtifactEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifact.findMany({
        where: { org_id: orgId, project_id: projectId },
      });
    });
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
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      const current = await p.artifact.findFirst({ where: { id, org_id: orgId } });
      if (!current) throw new Error("Artifact not found");

      return p.artifact.create({
        data: {
          org_id: orgId,
          project_id: current.project_id,
          type: current.type,
          title: updates.title ?? current.title,
          content: updates.content ?? current.content,
          status: updates.status ?? "draft",
          version: current.version + 1,
          parent_id: current.id,
          change_reason: updates.change_reason,
          created_by: updates.created_by ?? current.created_by,
        },
      });
    });
  }

  async updateStatus(orgId: string, id: string, status: ArtifactStatus): Promise<ArtifactEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifact.update({
        where: { id },
        data: { status },
      });
    });
  }

  async addComment(orgId: string, artifactId: string, userId: string, content: string): Promise<ArtifactCommentEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifactComment.create({
        data: {
          org_id: orgId,
          artifact_id: artifactId,
          user_id: userId,
          content,
          status: "open",
        },
      });
    });
  }

  async listComments(orgId: string, artifactId: string): Promise<ArtifactCommentEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      return p.artifactComment.findMany({
        where: { org_id: orgId, artifact_id: artifactId },
      });
    });
  }
}

export class PostgresTransformationRepository implements ITransformationAggregateRepository {
  constructor(private prisma: PrismaClientType) {}

  async getJourneyState(orgId: string, projectId: string): Promise<JourneyStageEntity[]> {
    assertTenant(orgId);
    // Future expansion: persisted journey table query
    return [];
  }

  async transitionStage(
    orgId: string,
    projectId: string,
    stage: JourneyStage,
    status: JourneyStatus,
    userId?: string,
    blockedReason?: string
  ): Promise<JourneyStageEntity> {
    assertTenant(orgId);
    return {
      id: "stage-" + Date.now(),
      org_id: orgId,
      project_id: projectId,
      stage,
      status,
      entered_at: new Date(),
      completed_at: status === "completed" ? new Date() : null,
      completed_by: userId ?? null,
      blocked_reason: blockedReason ?? null,
      stage_version: 1,
    };
  }

  async saveMaturitySnapshot(
    orgId: string,
    projectId: string,
    snapshot: DashboardMaturityModel
  ): Promise<void> {
    assertTenant(orgId);
    await withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      await p.maturitySnapshot.create({
        data: {
          org_id: orgId,
          project_id: projectId,
          score: snapshot.digital_maturity.overall,
          dimensions: snapshot.digital_maturity.dimensions,
          model_version: snapshot.formula_version,
          snapshot_date: new Date(),
        },
      });
    });
  }

  async getLatestMaturity(orgId: string, projectId: string): Promise<DashboardMaturityModel | null> {
    assertTenant(orgId);
    return withTenant(this.prisma, orgId, async (tx: unknown) => {
      const p = tx as PrismaClientType;
      const snap = await p.maturitySnapshot.findFirst({
        where: { org_id: orgId, project_id: projectId },
      }) as { dimensions?: unknown; score?: number; model_version?: string } | null;
      if (!snap || !snap.dimensions) return null;
      return {
        formula_version: snap.model_version ?? "v1.0",
        calculated_at: new Date().toISOString(),
        digital_maturity: {
          overall: snap.score ?? 50,
          dimensions: snap.dimensions as DashboardMaturityModel["digital_maturity"]["dimensions"],
        },
        ai_readiness: 50,
        automation_opportunity: 50,
        project_health: 75,
        implementation_readiness: 60,
      };
    });
  }
}
