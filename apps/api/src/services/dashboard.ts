/**
 * Dashboard service — TASK-022
 * GET /projects/:id/dashboard (+ history), computing maturity/readiness/health scores from artifacts + estimates
 */

import { listArtifacts } from "../stores/artifacts";
import { getAllEffortEstimates } from "../stores/effortEstimates";
import { createMaturitySnapshot, listMaturitySnapshots } from "../stores/maturitySnapshots";
import { listRoadmapItems } from "../stores/roadmapItems";

export interface DashboardScores {
  digitalMaturity: number; // 1-5
  aiReadiness: number; // 1-5
  automationOpportunity: number; // 1-5
  projectHealth: number; // 1-5
  implementationReadiness: number; // 1-5
  solutionQuality: number; // 1-5
}

export interface DashboardResponse {
  projectId: string;
  orgId: string;
  scores: DashboardScores;
  counts: { artifacts: number; roadmapItems: number; estimates: number };
  generatedAt: string;
}

export function computeDashboard(projectId: string, orgId: string): DashboardResponse {
  const artifacts = listArtifacts(projectId, orgId);
  // Base scores from artifact counts and maturity
  const hasBusinessAnalysis = artifacts.some((a) => a.type === "business_analysis");
  const hasArchitecture = artifacts.some((a) => a.type === "architecture_hld" || a.type === "architecture_lld");
  const hasRoadmap = artifacts.some((a) => a.type === "roadmap");
  const hasEffort = artifacts.some((a) => a.type === "effort_estimate");

  // Retrieve roadmap items for this project's artifacts
  const roadmapCount = artifacts
    .filter((a) => a.type === "roadmap")
    .reduce((s, a) => s + listRoadmapItems(a.id, orgId).length, 0);
  const estimates = getAllEffortEstimates(orgId).filter((e) => artifacts.some((a) => a.id === e.artifactId));
  const avgRisk = estimates.length ? estimates.filter((e) => e.riskLevel === "high").length / estimates.length : 0;

  const digitalMaturity = hasBusinessAnalysis ? (hasArchitecture ? 3.5 : 3.0) : 2.5;
  const aiReadiness = hasBusinessAnalysis ? 3.2 : 2.0;
  const automationOpportunity = hasBusinessAnalysis ? 3.8 : 2.5;
  const projectHealth = hasRoadmap ? Math.max(2, 5 - avgRisk * 2) : 3.0;
  const implementationReadiness = hasRoadmap && hasEffort ? 4.0 : hasRoadmap ? 3.5 : 2.5;
  const solutionQuality = artifacts.length >= 3 ? 4.0 : artifacts.length >= 1 ? 3.0 : 2.0;

  const scores: DashboardScores = {
    digitalMaturity: Number(digitalMaturity.toFixed(2)),
    aiReadiness: Number(aiReadiness.toFixed(2)),
    automationOpportunity: Number(automationOpportunity.toFixed(2)),
    projectHealth: Number(projectHealth.toFixed(2)),
    implementationReadiness: Number(implementationReadiness.toFixed(2)),
    solutionQuality: Number(solutionQuality.toFixed(2)),
  };

  return {
    projectId,
    orgId,
    scores,
    counts: { artifacts: artifacts.length, roadmapItems: roadmapCount, estimates: estimates.length },
    generatedAt: new Date().toISOString(),
  };
}

export function captureSnapshot(projectId: string, orgId: string): ReturnType<typeof createMaturitySnapshot> {
  const dash = computeDashboard(projectId, orgId);
  return createMaturitySnapshot({
    projectId,
    orgId,
    digitalMaturityScore: dash.scores.digitalMaturity,
    aiReadinessScore: dash.scores.aiReadiness,
    automationOpportunityScore: dash.scores.automationOpportunity,
  });
}

export function getDashboardHistory(projectId: string, orgId: string): ReturnType<typeof listMaturitySnapshots> {
  return listMaturitySnapshots(projectId, orgId);
}
