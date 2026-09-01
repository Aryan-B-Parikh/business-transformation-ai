/**
 * Shared RAG grounding utility for all AI transformation engines.
 * Per P0-2: every agent must call retrieveRag(orgId, projectId, query, k=5)
 * and persist evidence/citations in the artifact content.
 */

import { retrieveRag, RagChunkResult } from "./rag";
import { getRepositories } from "../repositories";

export interface GroundedCitation {
  documentId: string;
  chunkId: string;
  page: number | null;
  snippet: string;
  relevance: number;
}

export interface RAGGroundingContext {
  query: string;
  citations: GroundedCitation[];
  contextBlock: string;
}

/**
 * Retrieve RAG context for a given project + query.
 * Returns structured citations and a context block ready to inject into LLM prompts.
 */
export async function getGroundingContext(
  orgId: string,
  projectId: string,
  query: string,
  k: number = 5
): Promise<RAGGroundingContext> {
  if (!orgId || !projectId || !query) {
    return { query, citations: [], contextBlock: "" };
  }

  try {
    const docs = await getRepositories().documents.listDocumentsByProject(orgId, projectId);
    const docIdsForProject = new Set<string>(docs.map((d: { id: string }) => d.id));
    const results: RagChunkResult[] = retrieveRag({
      projectId,
      orgId,
      query,
      k,
      docIdsForProject,
    });

    const citations: GroundedCitation[] = results.map((r) => ({
      documentId: r.documentId,
      chunkId: r.id,
      page: r.pageRef,
      snippet: r.chunkText.slice(0, 300),
      relevance: Number(r.score.toFixed(4)),
    }));

    const contextBlock = results.length > 0
      ? "\n\n=== Retrieved Context (RAG) ===\n" +
        results.map((r, i) =>
          `[${i + 1}] (doc:${r.documentId} chunk:${r.id} score:${r.score.toFixed(3)} page:${r.pageRef ?? "n/a"})\n${r.chunkText}`
        ).join("\n\n")
      : "";

    return { query, citations, contextBlock };
  } catch {
    return { query, citations: [], contextBlock: "" };
  }
}

/**
 * Record user feedback (accept/reject/edit) to audit_logs for RAG feedback loop.
 */
export async function recordArtifactFeedback(
  orgId: string,
  actorId: string,
  artifactId: string,
  action: "accept" | "reject" | "edit",
  promptVersion: string,
  model: string,
  notes?: string
): Promise<void> {
  try {
    await getRepositories().governance.recordAuditLog(
      orgId,
      actorId,
      "artifact.feedback",
      "artifact",
      artifactId,
      { action, promptVersion, model, notes: notes ?? null, timestamp: new Date().toISOString() }
    );
  } catch {
    // best-effort
  }
}
