/**
 * Artifact approvals store — TASK-023
 * Mirrors artifact_approvals table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export type ApprovalDecision = "approved" | "rejected" | "changes_requested";

export interface ArtifactApproval {
  id: string;
  artifactId: string;
  orgId: string;
  approverId: string;
  decision: ApprovalDecision;
  comment: string | null;
  createdAt: string;
}

const approvals = new Map<string, ArtifactApproval>();
const byArtifact = new Map<string, Set<string>>();

export function clearApprovals(): void {
  approvals.clear();
  byArtifact.clear();
}

export function createApproval(a: Omit<ArtifactApproval, "id" | "createdAt">): ArtifactApproval {
  const id = uuidv4();
  const created: ArtifactApproval = { ...a, id, createdAt: new Date().toISOString() };
  approvals.set(id, created);
  if (!byArtifact.has(a.artifactId)) byArtifact.set(a.artifactId, new Set());
  byArtifact.get(a.artifactId)!.add(id);
  return created;
}

export function listApprovals(artifactId: string, orgId: string): ArtifactApproval[] {
  const ids = byArtifact.get(artifactId);
  if (!ids) return [];
  const out: ArtifactApproval[] = [];
  for (const id of ids) {
    const r = approvals.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getApproval(id: string): ArtifactApproval | undefined {
  return approvals.get(id);
}
