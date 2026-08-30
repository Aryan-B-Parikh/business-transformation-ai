/**
 * Document store — in-memory mirror of documents + document_chunks tables
 * Tenant isolation enforced per 03_DATA_MODEL.md §216 and RLS
 */

import { v4 as uuidv4 } from "uuid";

export type DocType = "pdf" | "pptx" | "docx" | "sop" | "brd" | "other";
export type Parsed = "pending" | "parsed" | "failed";

export interface Document {
  id: string;
  projectId: string;
  orgId: string;
  filename: string;
  type: DocType;
  storageUrl: string;
  fileId: string; // internal storage id
  parsedStatus: Parsed;
  uploadedBy: string;
  createdAt: string;
}

const docs = new Map<string, Document>();
const byProject = new Map<string, Set<string>>(); // projectId -> docIds

export function clearDocuments(): void {
  docs.clear();
  byProject.clear();
}

export function createDocument(doc: Omit<Document, "id" | "createdAt"> & { id?: string }): Document {
  const id = doc.id || uuidv4();
  const created: Document = {
    ...doc,
    id,
    createdAt: new Date().toISOString(),
  };
  docs.set(id, created);
  if (!byProject.has(created.projectId)) byProject.set(created.projectId, new Set());
  byProject.get(created.projectId)!.add(id);
  return created;
}

export function getDocument(id: string): Document | undefined {
  return docs.get(id);
}

export function listDocuments(projectId: string, orgId: string): Document[] {
  const ids = byProject.get(projectId);
  if (!ids) return [];
  const out: Document[] = [];
  for (const id of ids) {
    const d = docs.get(id);
    if (d && d.orgId === orgId) out.push(d);
  }
  return out;
}

export function updateParsedStatus(id: string, status: Parsed): Document | undefined {
  const d = docs.get(id);
  if (!d) return undefined;
  d.parsedStatus = status;
  docs.set(id, d);
  return d;
}

export function deleteDocument(id: string): boolean {
  const d = docs.get(id);
  if (!d) return false;
  docs.delete(id);
  byProject.get(d.projectId)?.delete(id);
  return true;
}

export function getDocIdsForProject(projectId: string): Set<string> {
  return new Set(byProject.get(projectId) || []);
}

export function inferDocType(filename: string): DocType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".docx")) return "docx";
  // SOP/BRD are custom — infer from name contains sop/brd, else use extension
  if (lower.includes("sop")) return "sop";
  if (lower.includes("brd")) return "brd";
  return "other";
}
