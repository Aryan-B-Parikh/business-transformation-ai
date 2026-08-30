/**
 * Export routes — TASK-025
 * POST /artifacts/:id/export {format} -> download URL
 * POST /projects/:id/export-bundle {artifact_ids[], format} -> combined export
 * GET /exports/:id/download — serves file
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { getArtifact } from "../stores/artifacts";
import { createExport, createBundle, getExport } from "../stores/exports";
import { projects } from "./workspaces";

const router = Router();

const ALLOWED_FORMATS = ["pdf", "docx", "xlsx", "pptx"] as const;

// POST /artifacts/:id/export
router.post(
  "/artifacts/:id/export",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const artifactId = String(req.params.id);
    const art = getArtifact(artifactId);
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const { format } = req.body as { format?: string };
    if (!format || !ALLOWED_FORMATS.includes(format as (typeof ALLOWED_FORMATS)[number])) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
      return;
    }
    const exp = await createExport(artifactId, orgId, format as (typeof ALLOWED_FORMATS)[number], art.content as Record<string, unknown>);
    res.status(201).json({ exportId: exp.id, downloadUrl: exp.downloadUrl, format: exp.format });
  }
);

// POST /projects/:id/export-bundle
router.post(
  "/projects/:id/export-bundle",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const { artifact_ids, artifactIds, format } = req.body as { artifact_ids?: string[]; artifactIds?: string[]; format?: string };
    const ids = artifact_ids || artifactIds;
    const fmt = format as (typeof ALLOWED_FORMATS)[number];
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "artifact_ids required" } });
      return;
    }
    if (!fmt || !ALLOWED_FORMATS.includes(fmt)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: `format must be one of ${ALLOWED_FORMATS.join(", ")}` } });
      return;
    }
    // Validate all artifacts belong to project/org
    const contents: Record<string, unknown>[] = [];
    for (const aid of ids) {
      const art = getArtifact(aid);
      if (!art || art.orgId !== orgId || art.projectId !== projectId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: `Artifact ${aid} not found` } });
        return;
      }
      contents.push(art.content as Record<string, unknown>);
    }
    const exp = await createBundle(projectId, ids, orgId, fmt, contents);
    res.status(201).json({ exportId: exp.id, downloadUrl: exp.downloadUrl, format: exp.format });
  }
);

// GET /exports/:id/download
router.get(
  "/exports/:id/download",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const exp = getExport(String(req.params.id));
    if (!exp || exp.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Export not found" } });
      return;
    }
    // Set content type based on format
    const mime: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    res.setHeader("Content-Type", mime[exp.format] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="export-${exp.id}.${exp.format}"`);
    res.send(exp.content);
  }
);

export default router;
