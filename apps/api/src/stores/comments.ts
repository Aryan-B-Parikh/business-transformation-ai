/**
 * Artifact comments store — TASK-023
 * Mirrors artifact_comments table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export interface ArtifactComment {
  id: string;
  artifactId: string;
  orgId: string;
  authorId: string;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
}

const comments = new Map<string, ArtifactComment>();
const byArtifact = new Map<string, Set<string>>();

export function clearComments(): void {
  comments.clear();
  byArtifact.clear();
}

export function createComment(c: Omit<ArtifactComment, "id" | "createdAt">): ArtifactComment {
  const id = uuidv4();
  const created: ArtifactComment = { ...c, id, createdAt: new Date().toISOString() };
  comments.set(id, created);
  if (!byArtifact.has(c.artifactId)) byArtifact.set(c.artifactId, new Set());
  byArtifact.get(c.artifactId)!.add(id);
  return created;
}

export function listComments(artifactId: string, orgId: string): ArtifactComment[] {
  const ids = byArtifact.get(artifactId);
  if (!ids) return [];
  const out: ArtifactComment[] = [];
  for (const id of ids) {
    const r = comments.get(id);
    if (r && r.orgId === orgId) out.push(r);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getComment(id: string): ArtifactComment | undefined {
  return comments.get(id);
}
