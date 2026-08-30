/**
 * Effort estimates store — TASK-021
 * Mirrors effort_estimates table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export type RiskLevel = "low" | "medium" | "high";

export interface EffortEstimate {
  id: string;
  artifactId: string;
  orgId: string;
  itemName: string;
  effortHours: number;
  costEstimate: number;
  riskLevel: RiskLevel;
}

const estimates = new Map<string, EffortEstimate>();
const byArtifact = new Map<string, Set<string>>();

export function clearEffortEstimates(): void {
  estimates.clear();
  byArtifact.clear();
}

export function createEffortEstimate(e: Omit<EffortEstimate, "id">): EffortEstimate {
  const id = uuidv4();
  if (e.effortHours <= 0) throw new Error("effortHours must be >0");
  if (e.costEstimate < 0) throw new Error("costEstimate must be >=0");
  if (!["low", "medium", "high"].includes(e.riskLevel)) throw new Error("Invalid riskLevel");
  const created: EffortEstimate = { ...e, id };
  estimates.set(id, created);
  if (!byArtifact.has(e.artifactId)) byArtifact.set(e.artifactId, new Set());
  byArtifact.get(e.artifactId)!.add(id);
  return created;
}

export function listEffortEstimates(artifactId: string, orgId: string): EffortEstimate[] {
  const ids = byArtifact.get(artifactId);
  if (!ids) return [];
  const out: EffortEstimate[] = [];
  for (const id of ids) {
    const r = estimates.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out;
}

export function listEffortEstimatesByProject(projectId: string, orgId: string, artifactIds: Set<string>): EffortEstimate[] {
  const out: EffortEstimate[] = [];
  for (const aId of artifactIds) out.push(...listEffortEstimates(aId, orgId));
  return out;
}

export function getAllEffortEstimates(orgId: string): EffortEstimate[] {
  return [...estimates.values()].filter((e) => e.orgId === orgId);
}
