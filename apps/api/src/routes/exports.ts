import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { prisma } from "../db/client";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { generateBinaryExport } from "../services/export";
import { storeExport, generateSignedUrl } from "../services/storage";
import { PostgresExportRepository } from "../services/export/exportRepository";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const ALLOWED_FORMATS = ["pdf", "docx", "xlsx", "pptx"] as const;
type ExportFormat = (typeof ALLOWED_FORMATS)[number];
const isFormat = (v: unknown): v is ExportFormat => typeof v === "string" && (ALLOWED_FORMATS as readonly string[]).includes(v);
const mime: Record<ExportFormat, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
const exportRepo = new PostgresExportRepository(prisma);

async function persistExport(orgId: string, projectId: string, artifactId: string | null, format: ExportFormat, content: Buffer) {
  const id = uuidv4();
  const record = await exportRepo.create({ id, orgId, projectId, format, status: "queued" });
  try {
    const stored = await storeExport(orgId, content, `export-${id}.${format}`, mime[format]);
    await exportRepo.complete(record.id, stored.storageUrl);
    return { id: record.id, downloadUrl: `/api/v1/exports/${record.id}/download`, format };
  } catch (error) {
    await exportRepo.fail(record.id, error instanceof Error ? error.message : "Export storage failed");
    throw error;
  }
}

router.post("/artifacts/:id/export", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId; const artifactId = String(req.params.id); const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
  const format = req.body?.format; if (!isFormat(format)) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
  const content = await generateBinaryExport(format, `Artifact Export (${artifactId})`, { orgId, artifactId }, art.content as Record<string, unknown>);
  const result = await persistExport(orgId, art.projectId, artifactId, format, content);
  return res.status(201).json({ exportId: result.id, downloadUrl: result.downloadUrl, format: result.format });
});

router.post("/projects/:id/export-bundle", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId; const projectId = String(req.params.id);
  if (!(await getRepositories().projects.findProjectById(orgId, projectId))) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
  const ids = req.body?.artifact_ids ?? req.body?.artifactIds; const format = req.body?.format;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some((id: unknown) => typeof id !== "string")) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "artifact_ids must contain 1-100 artifact IDs" } });
  if (!isFormat(format)) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
  const contents: Record<string, unknown>[] = [];
  for (const aid of ids as string[]) { const art = await getRepositories().artifacts.findById(orgId, aid); if (!art || art.projectId !== projectId) return res.status(404).json({ error: { code: "NOT_FOUND", message: `Artifact ${aid} not found` } }); contents.push(art.content as Record<string, unknown>); }
  const content = await generateBinaryExport(format, `Project Transformation Bundle (${projectId})`, { orgId, projectId }, contents);
  const result = await persistExport(orgId, projectId, null, format, content);
  return res.status(201).json({ exportId: result.id, downloadUrl: result.downloadUrl, format: result.format });
});

router.get("/exports/:id/download", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const exp = await exportRepo.getById(String(req.params.id), req.user!.orgId);
  if (!exp || exp.status !== "completed" || !exp.storageKey) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Export not found" } });
  if (exp.storageKey.startsWith("s3://")) return res.redirect(302, await generateSignedUrl(exp.id, req.user!.orgId, exp.storageKey));
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Export object is not available" } });
});

export default router;
