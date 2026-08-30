import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { createExport, createBundle, getExport } from "../stores/exports";

const router = Router();
const ALLOWED_FORMATS = ["pdf", "docx", "xlsx", "pptx"] as const;
type ExportFormat = (typeof ALLOWED_FORMATS)[number];
const isFormat = (value: unknown): value is ExportFormat => typeof value === "string" && (ALLOWED_FORMATS as readonly string[]).includes(value);
const mime: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

router.post("/artifacts/:id/export", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId; const artifactId = String(req.params.id);
  const art = await getRepositories().artifacts.findById(orgId, artifactId);
  if (!art) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
  const format = req.body?.format;
  if (!isFormat(format)) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
  const exp = await createExport(artifactId, orgId, format, art.content as Record<string, unknown>);
  return res.status(201).json({ exportId: exp.id, downloadUrl: exp.downloadUrl, format: exp.format });
});

router.post("/projects/:id/export-bundle", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId; const projectId = String(req.params.id);
  if (!(await getRepositories().projects.findProjectById(orgId, projectId))) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
  const ids = req.body?.artifact_ids ?? req.body?.artifactIds; const format = req.body?.format;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((id: unknown) => typeof id !== "string")) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "artifact_ids must contain 1-100 artifact IDs" } });
  if (!isFormat(format)) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
  const contents: Record<string, unknown>[] = [];
  for (const aid of ids as string[]) {
    const art = await getRepositories().artifacts.findById(orgId, aid);
    if (!art || art.projectId !== projectId) return res.status(404).json({ error: { code: "NOT_FOUND", message: `Artifact ${aid} not found` } });
    contents.push(art.content as Record<string, unknown>);
  }
  const exp = await createBundle(projectId, ids as string[], orgId, format, contents);
  return res.status(201).json({ exportId: exp.id, downloadUrl: exp.downloadUrl, format: exp.format });
});

router.get("/exports/:id/download", authenticate, authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"), async (req: AuthedRequest, res: Response) => {
  const exp = getExport(String(req.params.id));
  if (!exp || exp.orgId !== req.user!.orgId) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Export not found" } });
  res.setHeader("Content-Type", mime[exp.format]);
  res.setHeader("Content-Disposition", `attachment; filename="export-${exp.id}.${exp.format}"`);
  return res.send(exp.content);
});

export default router;
