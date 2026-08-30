/**
 * Roadmap items store — TASK-020
 * Mirrors roadmap_items table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export interface RoadmapItem {
  id: string;
  artifactId: string;
  orgId: string;
  title: string;
  phase: string;
  startEstimate: string; // ISO date
  endEstimate: string;
  dependencies: string[]; // other roadmap_item ids
}

const items = new Map<string, RoadmapItem>();
const byArtifact = new Map<string, Set<string>>();

export function clearRoadmapItems(): void {
  items.clear();
  byArtifact.clear();
}

export function createRoadmapItem(item: Omit<RoadmapItem, "id">): RoadmapItem {
  const id = uuidv4();
  const created: RoadmapItem = { ...item, id };
  // Validate no self-dependency
  if (created.dependencies.includes(created.id)) throw new Error("Circular dependency: self");
  // Validate no circular via DFS
  if (hasCycle(created, [...items.values()])) throw new Error("Circular dependency detected");
  items.set(id, created);
  if (!byArtifact.has(created.artifactId)) byArtifact.set(created.artifactId, new Set());
  byArtifact.get(created.artifactId)!.add(id);
  return created;
}

export function listRoadmapItems(artifactId: string, orgId: string): RoadmapItem[] {
  const ids = byArtifact.get(artifactId);
  if (!ids) return [];
  const out: RoadmapItem[] = [];
  for (const id of ids) {
    const r = items.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out.sort((a, b) => a.startEstimate.localeCompare(b.startEstimate));
}

export function listRoadmapItemsByProject(projectId: string, orgId: string, artifactIdsForProject: Set<string>): RoadmapItem[] {
  const out: RoadmapItem[] = [];
  for (const aId of artifactIdsForProject) {
    out.push(...listRoadmapItems(aId, orgId));
  }
  // Filter by project via artifact? We need artifact's projectId, but we don't have projectId in roadmapItems.
  // For now, assume artifactIdsForProject already filters correctly.
  return out;
}

export function getRoadmapItem(id: string): RoadmapItem | undefined {
  return items.get(id);
}

export function getAllRoadmapItems(orgId: string): RoadmapItem[] {
  return [...items.values()].filter((r) => r.orgId === orgId);
}

function hasCycle(newItem: RoadmapItem, existing: RoadmapItem[]): boolean {
  // Build adjacency list including new item
  const all = [...existing, newItem];
  const adj = new Map<string, string[]>();
  for (const r of all) adj.set(r.id, [...r.dependencies]);
  // DFS cycle detection
  const visited = new Set<string>();
  const recStack = new Set<string>();
  function dfs(node: string): boolean {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    recStack.add(node);
    for (const dep of adj.get(node) || []) {
      if (dfs(dep)) return true;
    }
    recStack.delete(node);
    return false;
  }
  for (const r of all) if (dfs(r.id)) return true;
  return false;
}

export function validateNoCycles(orgId: string): boolean {
  const orgItems = getAllRoadmapItems(orgId);
  const adj = new Map<string, string[]>();
  for (const r of orgItems) adj.set(r.id, [...r.dependencies]);
  const visited = new Set<string>();
  const recStack = new Set<string>();
  function dfs(node: string): boolean {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    recStack.add(node);
    for (const dep of adj.get(node) || []) if (dfs(dep)) return true;
    recStack.delete(node);
    return false;
  }
  for (const r of orgItems) if (dfs(r.id)) return false;
  return true;
}
