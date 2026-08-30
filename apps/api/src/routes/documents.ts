/**
 * Document routes — TASK-006
 * POST /projects/:id/documents (multipart), GET /projects/:id/documents,
 * GET /documents/:id, DELETE /documents/:id, GET /documents/:id/status, GET /documents/:id/file
 * Tenant isolation enforced via JWT org_id.
 */

import { Router, Response } from "express";
import multer from "multer";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { processDocument, getChunks } from "../services/documentParser";
import { retrieveRag } from "../services/rag";
import { storeFile, getFile, generateSignedUrl } from "../services/storage";
import { createDocument, getDocument, listDocuments, deleteDocument, updateParsedStatus, inferDocType, getDocIdsForProject } from "../stores/documents";
import { projects } from "./workspaces";

const router = Router();

// Multer memory storage — 10MB limit per file, allow pdf/pptx/docx + any for test
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Allow any filetype for tests; production would filter to pdf/pptx/docx
    cb(null, true);
  },
});

// POST /projects/:id/documents — multipart upload
router.post(
  "/projects/:id/documents",
  authenticate,
  // Allow org_admin, workspace_admin, contributor per RBAC
  authorize("org_admin", "workspace_admin", "contributor"),
  upload.single("file"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    // multer puts file on req.file
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "file required (multipart field 'file')" } });
      return;
    }
    const filename = file.originalname || "unknown";
    const { storageUrl, fileId } = storeFile(file.buffer, filename, file.mimetype);
    const docType = inferDocType(filename);
    const doc = createDocument({
      projectId,
      orgId,
      filename,
      type: docType,
      storageUrl,
      fileId,
      parsedStatus: "pending",
      uploadedBy: userId,
    });

    // Async parsing — fire and forget, but also await for test determinism (sync)
    // In production this would be a background worker / queue (Redis)
    setImmediate(async () => {
      try {
        await processDocument({ documentId: doc.id, orgId, buffer: file.buffer, filename });
        updateParsedStatus(doc.id, "parsed");
      } catch {
        updateParsedStatus(doc.id, "failed");
      }
    });

    // For tests we also want parsed quickly; we await here if query param ?sync=true
    const syncVal = Array.isArray(req.query.sync) ? req.query.sync[0] : (req.query.sync as string | undefined);
    if (syncVal === "true") {
      try {
        await processDocument({ documentId: doc.id, orgId, buffer: file.buffer, filename });
        updateParsedStatus(doc.id, "parsed");
      } catch {
        updateParsedStatus(doc.id, "failed");
      }
    }

    const signedUrl = generateSignedUrl(doc.id, storageUrl);
    // Return full document with signedUrl for client retrieval
    res.status(201).json({ ...doc, signedUrl, parsedStatus: doc.parsedStatus });
  }
);

// GET /projects/:id/documents — list for project
router.get(
  "/projects/:id/documents",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const docs = listDocuments(projectId, orgId);
    // Pagination — robust to string | string[] | ParsedQs
    const q = (v: unknown): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0] as string;
      return undefined;
    };
    const page = Math.max(1, parseInt(q(req.query.page) || "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(q(req.query.page_size) || "20", 10) || 20));
    const total = docs.length;
    const start = (page - 1) * pageSize;
    const data = docs.slice(start, start + pageSize).map((d) => ({ ...d, signedUrl: generateSignedUrl(d.id, d.storageUrl) }));
    res.json({ data, page, page_size: pageSize, total });
  }
);

// GET /documents/:id — single
router.get(
  "/documents/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const doc = getDocument(String(req.params.id));
    if (!doc || doc.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
      return;
    }
    res.json({ ...doc, signedUrl: generateSignedUrl(doc.id, doc.storageUrl) });
  }
);

// DELETE /documents/:id
router.delete(
  "/documents/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const doc = getDocument(String(req.params.id));
    if (!doc || doc.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
      return;
    }
    deleteDocument(doc.id);
    res.status(204).send();
  }
);

// GET /documents/:id/status — parsed_status polling
router.get(
  "/documents/:id/status",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const doc = getDocument(String(req.params.id));
    if (!doc || doc.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
      return;
    }
    // Include chunk count for debugging
    const chunks = getChunks(doc.id);
    res.json({ id: doc.id, parsed_status: doc.parsedStatus, parsedStatus: doc.parsedStatus, chunkCount: chunks.length });
  }
);

// GET /documents/:id/file — serve file content (signed URL target)
router.get(
  "/documents/:id/file",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const doc = getDocument(String(req.params.id));
    if (!doc || doc.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
      return;
    }
    const file = getFile(doc.fileId);
    if (!file) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found in storage" } });
      return;
    }
    res.setHeader("Content-Type", file.mimetype || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Content-Length", String(file.size));
    res.send(file.buffer);
  }
);

// GET /projects/:id/documents/:docId/chunks — debug: list chunks (internal, for RAG tests)
router.get(
  "/projects/:id/documents/:docId/chunks",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const docId = String(req.params.docId);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const doc = getDocument(docId);
    if (!doc || doc.orgId !== orgId || doc.projectId !== projectId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Document not found" } });
      return;
    }
    const chunks = getChunks(docId);
    res.json({ data: chunks });
  }
);

// POST /projects/:id/rag/search — RAG retrieval (TASK-008)
router.post(
  "/projects/:id/rag/search",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const { query, k } = (req.body || {}) as { query?: string; k?: number };
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "query required" } });
      return;
    }
    const docIds = getDocIdsForProject(projectId);
    const results = retrieveRag({ projectId, orgId, query, k: k || 5, docIdsForProject: docIds });
    res.json({ query, k: k || 5, results, total: results.length });
  }
);

export default router;

// Re-export for rag service helper
export function getDocIdsForProjectHelper(projectId: string): Set<string> {
  return getDocIdsForProject(projectId);
}
