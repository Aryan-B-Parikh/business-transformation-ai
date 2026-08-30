import { PrismaClient } from "@prisma/client";
import { ITransformationAggregateRepository, JourneyStageEntity } from "../interfaces";
import { JourneyStage, JourneyStatus, DashboardMaturityModel } from "@bta/shared";
import { withTenant, assertTenant } from "../../db/tenant";

const STAGES: JourneyStage[] = [
  "idea", "discovery", "business_analysis", "solution_design", "architecture",
  "process_design", "ux_design", "data_design", "planning", "review", "approved", "implementation",
];

export class PostgresTransformationAggregateRepository implements ITransformationAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getJourneyState(orgId: string, projectId: string): Promise<JourneyStageEntity[]> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as PrismaClient;
      const journey = await p.transformationJourney.findFirst({
        where: { projectId, orgId },
        include: { transitions: { orderBy: { revision: "asc" } } },
      });
      if (!journey) return [];
      return journey.transitions.map((t) => ({
        id: t.id,
        orgId,
        projectId,
        stage: t.toStage as JourneyStage,
        status: t.toStage === journey.currentStage
          ? (journey.status === "blocked" ? "blocked" : journey.currentStage === "implementation" ? "in_progress" : "in_progress")
          : "completed",
        entered_at: t.timestamp,
        completed_at: t.toStage === journey.currentStage ? null : t.timestamp,
        completed_by: t.toStage === journey.currentStage ? null : t.actor,
        blocked_reason: null,
        stage_version: t.revision,
      }));
    });
  }

  async transitionStage(
    orgId: string,
    projectId: string,
    stage: JourneyStage,
    status: JourneyStatus,
    userId?: string,
    blockedReason?: string,
  ): Promise<JourneyStageEntity> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as PrismaClient;
      let journey = await p.transformationJourney.findFirst({ where: { projectId, orgId } });
      if (!journey) {
        if (!userId) throw new Error("actor required to initialize journey");
        journey = await p.transformationJourney.create({
          data: { projectId, orgId, currentStage: "idea", actor: userId, version: 1 },
        });
        await p.journeyTransition.create({
          data: { journeyId: journey.id, orgId, fromStage: null, toStage: "idea", actor: userId, reason: "Journey initialized", revision: 1 },
        });
      }

      const current = STAGES.indexOf(journey.currentStage as JourneyStage);
      const target = STAGES.indexOf(stage);
      if (target < 0) throw new Error("Invalid journey stage");
      if (target > current + 1) throw new Error(`Invalid transition: cannot jump from ${journey.currentStage} to ${stage}`);
      if (target === current && stage !== journey.currentStage) throw new Error("Invalid journey transition");

      const nextVersion = journey.version + 1;
      const updated = await p.transformationJourney.update({
        where: { id: journey.id },
        data: {
          currentStage: stage,
          status: status === "blocked" ? "blocked" : "active",
          version: nextVersion,
          actor: userId ?? journey.actor,
          enteredAt: new Date(),
          completedAt: stage === "implementation" && status === "completed" ? new Date() : null,
        },
      });
      await p.journeyTransition.create({
        data: {
          journeyId: journey.id,
          orgId,
          fromStage: journey.currentStage,
          toStage: stage,
          actor: userId ?? journey.actor,
          reason: blockedReason ?? (status === "blocked" ? "Stage blocked" : undefined),
          revision: nextVersion,
        },
      });
      return {
        id: updated.id,
        orgId,
        projectId,
        stage,
        status,
        entered_at: updated.enteredAt,
        completed_at: status === "completed" ? new Date() : null,
        completed_by: userId ?? null,
        blocked_reason: blockedReason ?? null,
        stage_version: nextVersion,
      };
    });
  }

  async saveMaturitySnapshot(orgId: string, projectId: string, snapshot: DashboardMaturityModel): Promise<void> {
    assertTenant(orgId);
    await withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as PrismaClient;
      await p.maturitySnapshot.create({
        data: {
          projectId,
          orgId,
          digitalMaturityScore: snapshot.digital_maturity.overall,
          aiReadinessScore: snapshot.ai_readiness,
          automationOpportunityScore: snapshot.automation_opportunity,
        },
      });
    });
  }

  async getLatestMaturity(orgId: string, projectId: string): Promise<DashboardMaturityModel | null> {
    assertTenant(orgId);
    return withTenant(this.prisma as never, orgId, async (tx: unknown) => {
      const p = tx as PrismaClient;
      const snap = await p.maturitySnapshot.findFirst({
        where: { projectId, orgId },
        orderBy: { capturedAt: "desc" },
      });
      if (!snap) return null;
      const score = Number(snap.digitalMaturityScore);
      const dimension = (s: number) => ({ score: s, weight: 0.2, confidence: 0.5, evidence: [] as string[] });
      return {
        formula_version: "v1.0",
        calculated_at: snap.capturedAt.toISOString(),
        digital_maturity: {
          overall: score,
          dimensions: {
            process: dimension(score), technology: dimension(score), data: dimension(score),
            automation: dimension(score), governance: dimension(score),
          },
        },
        ai_readiness: Number(snap.aiReadinessScore),
        automation_opportunity: Number(snap.automationOpportunityScore),
        project_health: score,
        implementation_readiness: score,
      };
    });
  }
}
