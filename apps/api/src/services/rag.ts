/**
 * RAG retrieval service — TASK-008
 * Given project_id + query, return top-k relevant document_chunks
 * (vector cosine similarity, tenant-scoped, namespace per tenant 02 §5)
 *
 * DoD: Unit test with seeded chunks returns expected top-k ordering;
 *      cross-tenant leakage test proves isolation.
 */

import { cosineSimilarity, embed, getChunksByProject, DocumentChunk } from "./documentParser";

export interface RagChunkResult {
  id: string;
  documentId: string;
  orgId: string;
  chunkText: string;
  pageRef: number | null;
  score: number;
}

/**
 * Retrieve top-k chunks for a query within a project.
 * - Only chunks whose document belongs to projectId and whose orgId matches are considered.
 * - Sorted by cosine similarity descending.
 * - Tenant isolation: if orgId mismatched, zero results.
 */
export function retrieveRag(params: {
  projectId: string;
  orgId: string;
  query: string;
  k?: number;
  /** Map of documentId -> chunks for lookup; pass all docIds that belong to project */
  docIdsForProject: Set<string>;
}): RagChunkResult[] {
  const { projectId, orgId, query, k = 5, docIdsForProject } = params;
  if (!projectId || !orgId || !query) throw new Error("projectId, orgId, query required");
  if (!docIdsForProject.has) throw new Error("docIdsForProject must be a Set");
  // Tenant check: if docIds set is empty, return []
  if (docIdsForProject.size === 0) return [];

  const queryVec = embed(query);
  const candidates = getChunksByProject(projectId, orgId, docIdsForProject);
  if (candidates.length === 0) return [];

  const scored: RagChunkResult[] = candidates.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    orgId: c.orgId,
    chunkText: c.chunkText,
    pageRef: c.pageRef,
    score: cosineSimilarity(queryVec, c.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(k, 20)));
}

export function ragTenantIsolationCheck(allChunks: DocumentChunk[], queryOrg: string): boolean {
  // Returns true if no chunk from other org leaked
  return allChunks.every((c) => c.orgId === queryOrg);
}
