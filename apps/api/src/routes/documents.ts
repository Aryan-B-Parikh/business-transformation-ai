import { Router, Response } from "express";
import multer from "multer";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { processDocument, embed } from "../services/documentParser";
import { storeFile, getMemoryFile, generateSignedUrl } from "../services/storage";


const router = Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE }, fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(file.mimetype)) });
function error(res: Response, status: number, code: string, message: string) { return res.status(status).json({ error: { code, message } }); }
function fileType(filename: string) { const ext = filename.toLowerCase().split(".").pop(); return ext === "pdf" || ext === "docx" || ext === "pptx" ? ext : "other"; }

router.post("/projects/:id/documents", authenticate, authorize("org_admin", "workspace_admin", "contributor"), upload.single("file"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId, projectId = String(req.params.id);
  if (!(await getRepositories().projects.findProjectById(orgId, projectId))) return error(res, 404, "NOT_FOUND", "Project not found");
  const file = req.file; if (!file) return error(res, 400, "BAD_REQUEST", "A supported file is required");
  const filename = file.originalname || "document";
  const stored = await storeFile(orgId, file.buffer, filename, file.mimetype);
  const doc = await getRepositories().documents.createDocument(orgId, projectId, { filename, docType: fileType(filename), fileSize: file.size, storageKey: stored.storageUrl, ...( { uploadedBy: req.user!.userId } as Record<string, unknown> ) } as any);
  const run = async () => {
    try {
      const chunks = await processDocument({ documentId: doc.id, orgId, buffer: file.buffer, filename });
      await getRepositories().documents.addChunks(orgId, doc.id, chunks.map((c, i) => ({ chunkIndex: i, content: c.chunkText, pageNumber: c.pageRef ?? undefined, embedding: c.embedding })));
      await getRepositories().documents.updateParsedStatus(orgId, doc.id, "parsed");
    } catch (e) {
      console.error(`Document processing failed [${doc.id}]`, e);
      await getRepositories().documents.updateParsedStatus(orgId, doc.id, "failed").catch(() => undefined);
    }
  };
  if (req.query.sync === "true" || process.env.NODE_ENV === "test") await run(); else void run();
  return res.status(201).json({ ...doc, storageUrl: stored.storageUrl, signedUrl: await generateSignedUrl(doc.id, orgId, stored.storageUrl) });
});

router.get("/projects/:id/documents", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId, projectId = String(req.params.id);
  if (!(await getRepositories().projects.findProjectById(orgId, projectId))) return error(res, 404, "NOT_FOUND", "Project not found");
  const docs = await getRepositories().documents.listDocumentsByProject(orgId, projectId);
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1), pageSize = Math.max(1, Math.min(100, Number.parseInt(String(req.query.page_size || "20"), 10) || 20));
  const data = await Promise.all(docs.slice((page - 1) * pageSize, page * pageSize).map(async d => ({ ...d, signedUrl: await generateSignedUrl(d.id, orgId, d.storage_key || "") })));
  return res.json({ data, page, page_size: pageSize, total: docs.length });
});

router.get("/documents/:id", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId, doc = await getRepositories().documents.findDocumentById(orgId, String(req.params.id));
  if (!doc) return error(res, 404, "NOT_FOUND", "Document not found");
  return res.json({ ...doc, signedUrl: await generateSignedUrl(doc.id, orgId, doc.storage_key || "") });
});

router.delete("/documents/:id", authenticate, authorize("org_admin", "workspace_admin", "contributor"), async (req: AuthedRequest, res: Response) => {
  const doc = await getRepositories().documents.findDocumentById(req.user!.orgId, String(req.params.id));
  if (!doc) return error(res, 404, "NOT_FOUND", "Document not found");
  return error(res, 501, "NOT_IMPLEMENTED", "Document deletion requires an object-store delete operation");
});

router.get("/documents/:id/status", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const doc = await getRepositories().documents.findDocumentById(req.user!.orgId, String(req.params.id));
  if (!doc) return error(res, 404, "NOT_FOUND", "Document not found");
  return res.json({ id: doc.id, parsedStatus: doc.parsedStatus });
});

router.get("/documents/:id/file", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId, doc = await getRepositories().documents.findDocumentById(orgId, String(req.params.id));
  if (!doc) return error(res, 404, "NOT_FOUND", "Document not found");
  if (doc.storage_key?.startsWith("s3://")) return res.redirect(307, await generateSignedUrl(doc.id, orgId, doc.storage_key));
  if (process.env.NODE_ENV === "production") return error(res, 503, "STORAGE_UNAVAILABLE", "Object storage is unavailable");
  const match = doc.storage_key?.match(/^memory:\/\/documents\/([^/]+)/), file = match ? getMemoryFile(match[1]!) : undefined;
  if (!file) return error(res, 404, "NOT_FOUND", "File not found in test storage");
  res.setHeader("Content-Type", file.mimetype || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/"/g, "")}"`);
  return res.send(file.buffer);
});

router.post("/projects/:id/rag/search", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId, projectId = String(req.params.id);
  if (!(await getRepositories().projects.findProjectById(orgId, projectId))) return error(res, 404, "NOT_FOUND", "Project not found");
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "", k = Math.max(1, Math.min(20, Number(req.body?.k) || 5));
  if (!query) return error(res, 400, "BAD_REQUEST", "query required");
  const results = await getRepositories().documents.searchSimilarChunks(orgId, projectId, embed(query), k);
  return res.json({ query, k, results: results.map(r => ({ id: r.id, documentId: r.documentId, orgId: r.orgId, chunkText: r.content, pageRef: r.page_number, score: r.score })), total: results.length });
});
export default router;

