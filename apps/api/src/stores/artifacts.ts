/**
 * Artifact store — TASK-011 + generic for Epic 3/4
 * Mirrors artifacts table (03_DATA_MODEL.md) with versioning via parent_artifact_id
 */

import { v4 as uuidv4 } from "uuid";

export type ArtifactType =
  | "recommendation"
  | "business_analysis"
  | "architecture_hld"
  | "architecture_lld"
  | "process_workflow"
  | "bpmn_diagram"
  | "wireframe"
  | "er_diagram"
  | "api_spec"
  | "roadmap"
  | "effort_estimate"
  | "dashboard_snapshot";
export type ArtifactStatus = "draft" | "in_review" | "approved";
export type GeneratedBy = "ai" | "user" | "hybrid";

export interface Artifact {
  id: string;
  projectId: string;
  orgId: string;
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  content: Record<string, unknown>;
  diagramUrl: string | null;
  version: number;
  parentArtifactId: string | null;
  generatedBy: GeneratedBy;
  createdBy: string;
  createdAt: string;
}

const artifacts = new Map<string, Artifact>();
const byProject = new Map<string, Set<string>>(); // projectId -> artifact ids

export function clearArtifacts(): void {
  artifacts.clear();
  byProject.clear();
}

export function createArtifact(a: Omit<Artifact, "id" | "createdAt" | "version"> & { version?: number }): Artifact {
  const art: Artifact = {
    ...a,
    id: uuidv4(),
    version: a.version ?? 1,
    createdAt: new Date().toISOString(),
  };
  // Advisory-only guard: AI cannot auto-approve
  if (art.generatedBy === "ai" && art.status === "approved") {
    throw new Error("AI-generated artifact cannot be auto-approved; human review required");
  }
  artifacts.set(art.id, art);
  if (!byProject.has(art.projectId)) byProject.set(art.projectId, new Set());
  byProject.get(art.projectId)!.add(art.id);
  return art;
}

export function getArtifact(id: string): Artifact | undefined {
  return artifacts.get(id);
}

export function listArtifacts(projectId: string, orgId: string, filters?: { type?: string; status?: string }): Artifact[] {
  const ids = byProject.get(projectId);
  if (!ids) return [];
  const out: Artifact[] = [];
  for (const id of ids) {
    const a = artifacts.get(id);
    if (!a || a.orgId !== orgId) continue;
    if (filters?.type && a.type !== filters.type) continue;
    if (filters?.status && a.status !== filters.status) continue;
    out.push(a);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getArtifactVersions(artifactId: string, orgId: string): Artifact[] {
  const root = artifacts.get(artifactId);
  if (!root || root.orgId !== orgId) return [];
  // Walk parent chain + children to get version history
  const all = [...artifacts.values()].filter((a) => a.orgId === orgId);
  // Build chain from root backwards via parentArtifactId
  const chain: Artifact[] = [];
  const cur: Artifact | undefined = root;
  while (cur) {
    chain.push(cur);
    // Find child that has parent = cur.id (for forward history)
    // For version chain, we need to find all linked via parentArtifactId
    // Simpler: find all artifacts where id === cur.id or parent chain leads to root
    break; // we handle below
  }
  // For version retrieval, spec says GET /artifacts/:id/versions — return all versions where they share lineage
  // We consider lineage as artifacts where they have same root ancestor or are the root
  // To keep simple, return all artifacts with same projectId+type+title lineage where parent chain includes root
  // Real implementation would traverse parentArtifactId graph; here we collect by walking from root forwards
  const versions: Artifact[] = [root];
  const queue = [root.id];
  const visited = new Set<string>([root.id]);
  while (queue.length) {
    const pid = queue.shift()!;
    for (const a of all) {
      if (a.parentArtifactId === pid && !visited.has(a.id)) {
        visited.add(a.id);
        versions.push(a);
        queue.push(a.id);
      }
    }
  }
  // Also walk backwards to find ancestors of root
  let p = root.parentArtifactId;
  while (p) {
    const parent = artifacts.get(p);
    if (!parent || parent.orgId !== orgId) break;
    versions.unshift(parent);
    p = parent.parentArtifactId;
  }
  return versions.sort((a, b) => a.version - b.version);
}

export function createNewVersion(parentId: string, updates: Partial<Artifact> & { content?: Record<string, unknown>; createdBy: string }): Artifact {
  const parent = artifacts.get(parentId);
  if (!parent) throw new Error("Parent artifact not found");
  const newArt: Artifact = {
    ...parent,
    ...updates,
    id: uuidv4(),
    parentArtifactId: parentId,
    version: parent.version + 1,
    createdAt: new Date().toISOString(),
    status: "draft" as ArtifactStatus, // new versions always draft per advisory-only
  };
  artifacts.set(newArt.id, newArt);
  byProject.get(parent.projectId)!.add(newArt.id);
  return newArt;
}
