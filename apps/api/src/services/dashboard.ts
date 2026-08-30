import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { getRepositories } from "../repositories";
/**
 * Versioned Multi-Dimensional Mathematical Dashboard & Maturity Model (Phase 10)
 * Replaces naive boolean heuristics with weighted dimensional scoring (0-100 scale & normalized 1-5 scale)
 */





import { DashboardMaturityModel } from "@bta/shared";

export interface DashboardScores {
  digitalMaturity: number; // 1-5
  aiReadiness: number; // 1-5
  automationOpportunity: number; // 1-5
  projectHealth: number; // 1-5
  implementationReadiness: number; // 1-5
  solutionQuality: number; // 1-5
}

export interface DetailedDashboardResponse {
  projectId: string;
  orgId: string;
  scores: DashboardScores;
  model: DashboardMaturityModel;
  counts: { artifacts: number; roadmapItems: number; estimates: number };
  generatedAt: string;
}

export async function computeVersionedDashboard(projectId: string, orgId: string): Promise<DetailedDashboardResponse> {
  const artifacts = await getRepositories().artifacts.listByProject(projectId, orgId);

  // Dimension 1: Process Maturity (20%)
  const hasBusinessAnalysis = artifacts.some((a) => a.type === "business_analysis");
  const hasWorkflow = artifacts.some((a) => a.type === "process_workflow" || a.type === "bpmn_diagram");
  const processScore = hasWorkflow ? 90 : hasBusinessAnalysis ? 70 : 40;

  // Dimension 2: Technology Maturity (20%)
  const hasHld = artifacts.some((a) => a.type === "architecture_hld");
  const hasLld = artifacts.some((a) => a.type === "architecture_lld");
  const techScore = hasHld && hasLld ? 95 : hasHld ? 75 : 45;

  // Dimension 3: Data Maturity (20%)
  const hasDataModel = artifacts.some((a) => a.type === "er_diagram" || a.type === "api_spec");
  const dataScore = hasDataModel ? 85 : 50;

  // Dimension 4: Automation Maturity (20%)
  const hasRecommendation = artifacts.some((a) => a.type === "recommendation");
  const autoScore = hasRecommendation && hasWorkflow ? 90 : hasRecommendation ? 75 : 45;

  // Dimension 5: Governance & Planning (20%)
  const hasRoadmap = artifacts.some((a) => a.type === "roadmap");
  const hasEffort = artifacts.some((a) => a.type === "effort_estimate");
  const governanceScore = hasRoadmap && hasEffort ? 90 : hasRoadmap ? 70 : 40;

  // Overall Digital Maturity = 20% each
  const overallMaturity =
    processScore * 0.2 +
    techScore * 0.2 +
    dataScore * 0.2 +
    autoScore * 0.2 +
    governanceScore * 0.2;

  const estimates = (await prisma.effortEstimate.findMany({ where: { orgId } })).filter((e) =>
    artifacts.some((a) => a.id === e.artifactId)
  );
  const highRiskRatio =
    estimates.length > 0
      ? estimates.filter((e) => e.riskLevel === "high").length / estimates.length
      : 0;

  const aiReadiness100 = (techScore * 0.5 + dataScore * 0.5);
  const automationOpportunity100 = (processScore * 0.6 + autoScore * 0.4);
  const projectHealth100 = Math.max(30, 100 - highRiskRatio * 50);
  const implementationReadiness100 = hasRoadmap && hasEffort ? 85 : hasRoadmap ? 65 : 45;
  const solutionQuality100 = Math.min(100, artifacts.length * 20 + 20);

  const model: DashboardMaturityModel = {
    formula_version: "v1.0",
    calculated_at: new Date().toISOString(),
    digital_maturity: {
      overall: Math.round(overallMaturity),
      dimensions: {
        process: { score: processScore, weight: 0.2, confidence: 0.9, evidence: ["BPMN/Workflows", "Analysis"] },
        technology: { score: techScore, weight: 0.2, confidence: 0.9, evidence: ["Architecture HLD/LLD"] },
        data: { score: dataScore, weight: 0.2, confidence: 0.85, evidence: ["ER / OpenAPI"] },
        automation: { score: autoScore, weight: 0.2, confidence: 0.85, evidence: ["AI Recommendations"] },
        governance: { score: governanceScore, weight: 0.2, confidence: 0.9, evidence: ["Roadmap & Estimates"] },
      },
    },
    ai_readiness: Math.round(aiReadiness100),
    automation_opportunity: Math.round(automationOpportunity100),
    project_health: Math.round(projectHealth100),
    implementation_readiness: Math.round(implementationReadiness100),
  };

  // Convert 0-100 scale to standard 1-5 star scale for backward API parity
  const to5Scale = (v: number) => Number((1 + (v / 100) * 4).toFixed(2));

  const scores: DashboardScores = {
    digitalMaturity: to5Scale(overallMaturity),
    aiReadiness: to5Scale(aiReadiness100),
    automationOpportunity: to5Scale(automationOpportunity100),
    projectHealth: to5Scale(projectHealth100),
    implementationReadiness: to5Scale(implementationReadiness100),
    solutionQuality: to5Scale(solutionQuality100),
  };

  let roadmapCount = 0;
  for (const a of artifacts.filter((a) => a.type === "roadmap")) {
    roadmapCount += await prisma.roadmapItem.count({ where: { artifactId: a.id, orgId } });
  }

  return {
    projectId,
    orgId,
    scores,
    model,
    counts: { artifacts: artifacts.length, roadmapItems: roadmapCount, estimates: estimates.length },
    generatedAt: new Date().toISOString(),
  };
}

export async function computeDashboard(projectId: string, orgId: string) {
  return await computeVersionedDashboard(projectId, orgId);
}

export async function captureSnapshot(projectId: string, orgId: string) {
  const dash = await computeVersionedDashboard(projectId, orgId);
  return await prisma.maturitySnapshot.create({
    data: {
      projectId,
      orgId,
      digitalMaturityScore: dash.scores.digitalMaturity,
      aiReadinessScore: dash.scores.aiReadiness,
      automationOpportunityScore: dash.scores.automationOpportunity,
    }
  });
}

export async function getDashboardHistory(projectId: string, orgId: string) {
  return await prisma.maturitySnapshot.findMany({ where: { projectId, orgId } });
}
