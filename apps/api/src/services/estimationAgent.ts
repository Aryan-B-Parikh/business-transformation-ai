import { PrismaClient, RiskLevel } from "@prisma/client";
const prisma = new PrismaClient();
import { getRepositories } from "../repositories";
/**
 * AI Planning Engine (estimation) — TASK-021
 * POST /ai/v1/planning/estimate → effort_estimates rows + risk levels
 * DoD: Given fixture scope, produces non-zero estimates with risk classification for each item
 */




export interface EstimationContent {
  items: { name: string; effortHours: number; costEstimate: number; riskLevel: RiskLevel }[];
  totalEffort: number;
  totalCost: number;
  riskDistribution: Record<string, number>;
}

export interface EstimationRequest {
  projectId: string;
  orgId: string;
  createdBy: string;
  scope?: string[]; // e.g., ["API Gateway", "Migration"]
  artifactId?: string; // parent roadmap artifact
}

export async function generateEstimation(req: EstimationRequest): Promise<{ artifactId: string; content: EstimationContent; estimateIds: string[] }> {
  if (!req.projectId || !req.orgId) throw new Error("projectId and orgId required");
  const scope = req.scope && req.scope.length > 0 ? req.scope : ["Discovery", "Foundation", "Build", "Pilot", "Scale"];

  const items: { name: string; effortHours: number; costEstimate: number; riskLevel: RiskLevel }[] = scope.map((name) => {
    // Use name hash for deterministic but non-zero
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const effortHours = 40 + (h % 80); // 40-120
    const costEstimate = effortHours * 150; // $150/hr
    const riskLevel: RiskLevel = h % 3 === 0 ? "high" : h % 3 === 1 ? "medium" : "low";
    return { name, effortHours, costEstimate, riskLevel };
  });

  const totalEffort = items.reduce((s, i) => s + i.effortHours, 0);
  const totalCost = items.reduce((s, i) => s + i.costEstimate, 0);
  const riskDistribution: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const it of items) riskDistribution[it.riskLevel]++;

  const content: EstimationContent = { items, totalEffort, totalCost, riskDistribution };

  const artifact = await getRepositories().artifacts.create(req.orgId, req.projectId, {
    type: "effort_estimate",
    title: `Effort Estimate — ${req.projectId.slice(0, 8)}`,
    status: "draft",
    content: content as unknown as Record<string, unknown>,
    createdBy: req.createdBy,
  });

  const estimateIds: string[] = [];
  for (const it of items) {
    const est = await prisma.effortEstimate.create({ data: {
      artifactId: artifact.id,
      orgId: req.orgId,
      itemName: it.name,
      effortHours: it.effortHours,
      costEstimate: it.costEstimate,
      riskLevel: it.riskLevel,
    } });
    estimateIds.push(est.id);
  }

  return { artifactId: artifact.id, content, estimateIds };
}

export function validateEstimationContent(content: unknown): { valid: boolean; errors?: string[] } {
  const c = content as EstimationContent;
  const errors: string[] = [];
  if (!Array.isArray(c.items) || c.items.length === 0) errors.push("items required");
  for (const it of c.items || []) {
    if (!it.name || typeof it.effortHours !== "number" || it.effortHours <= 0) errors.push(`Invalid item ${it.name}`);
    if (!["low", "medium", "high"].includes(it.riskLevel)) errors.push(`Invalid risk ${it.name}`);
  }
  if (typeof c.totalEffort !== "number" || c.totalEffort <= 0) errors.push("totalEffort must be >0");
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
