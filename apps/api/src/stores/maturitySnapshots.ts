/**
 * Maturity snapshots store — TASK-022 Dashboard history
 * Mirrors maturity_snapshots table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export interface MaturitySnapshot {
  id: string;
  projectId: string;
  orgId: string;
  digitalMaturityScore: number;
  aiReadinessScore: number;
  automationOpportunityScore: number;
  capturedAt: string;
}

const snapshots = new Map<string, MaturitySnapshot>();
const byProject = new Map<string, Set<string>>();

export function clearMaturitySnapshots(): void {
  snapshots.clear();
  byProject.clear();
}

export function createMaturitySnapshot(s: Omit<MaturitySnapshot, "id" | "capturedAt"> & { capturedAt?: string }): MaturitySnapshot {
  const id = uuidv4();
  const created: MaturitySnapshot = {
    ...s,
    id,
    capturedAt: s.capturedAt || new Date().toISOString(),
  };
  snapshots.set(id, created);
  if (!byProject.has(s.projectId)) byProject.set(s.projectId, new Set());
  byProject.get(s.projectId)!.add(id);
  return created;
}

export function listMaturitySnapshots(projectId: string, orgId: string): MaturitySnapshot[] {
  const ids = byProject.get(projectId);
  if (!ids) return [];
  const out: MaturitySnapshot[] = [];
  for (const id of ids) {
    const r = snapshots.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function getLatestSnapshot(projectId: string, orgId: string): MaturitySnapshot | undefined {
  const list = listMaturitySnapshots(projectId, orgId);
  return list[list.length - 1];
}
