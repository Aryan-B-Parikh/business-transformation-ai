/**
 * Artifact routes — TASK-019 + Epic 3/4
 * Generic artifact viewer/editor per PRD §6 (editable, regenerable, versioned)
 * Implements per 04_API_SPEC.md § Artifacts
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { generateArchitecture } from "../services/architectureAgent";
import { generateBusinessAnalysis } from "../services/businessAnalysis";
import { generateDataModel } from "../services/dataModelingAgent";
import { renderToSvg, isValidSvg } from "../services/diagramRenderer";
import { generateProcess } from "../services/processAgent";
import { generateUx } from "../services/uxAgent";
import { createArtifact, getArtifact, listArtifacts, getArtifactVersions, createNewVersion } from "../stores/artifacts";
import { projects } from "./workspaces";

const router = Router();

// GET /projects/:id/artifacts?type=&status=
router.get(
  "/projects/:id/artifacts",
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
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const data = listArtifacts(projectId, orgId, { type, status });
    // Add diagram rendering check
    const withDiagram = data.map((a) => {
      const content = a.content as { diagramSpec?: { nodes: unknown[]; edges: unknown[] } };
      let diagramValid: boolean | undefined;
      if (content.diagramSpec) {
        try {
          const svg = renderToSvg(content.diagramSpec as { nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] });
          diagramValid = isValidSvg(svg);
        } catch {
          diagramValid = false;
        }
      }
      return { ...a, diagramValid };
    });
    res.json({ data: withDiagram });
  }
);

// POST /projects/:id/artifacts/generate — unified generate endpoint
router.post(
  "/projects/:id/artifacts/generate",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const { type, params, source_conversation_id, source_document_ids } = req.body as {
      type: string;
      params?: Record<string, unknown>;
      source_conversation_id?: string;
      source_document_ids?: string[];
    };
    if (!type) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "type required" } });
      return;
    }

    try {
      let result: { artifactId: string; content: unknown };
      switch (type) {
        case "business_analysis": {
          const r = generateBusinessAnalysis({ projectId, orgId, createdBy: userId });
          result = { artifactId: r.artifactId, content: r.content };
          break;
        }
        case "architecture_hld":
        case "architecture_lld": {
          const r = generateArchitecture({ projectId, orgId, type: type as "architecture_hld" | "architecture_lld", params: params as { cloud_preference?: string; compliance?: string[] }, createdBy: userId });
          result = { artifactId: r.artifactId, content: r.content };
          break;
        }
        case "process_workflow":
        case "bpmn_diagram": {
          const r = generateProcess({ projectId, orgId, createdBy: userId, params: params as { processName?: string } });
          result = { artifactId: r.artifactId, content: r.content };
          break;
        }
        case "wireframe": {
          const r = generateUx({ projectId, orgId, createdBy: userId, params: params as { appType?: string } });
          result = { artifactId: r.artifactId, content: r.content };
          break;
        }
        case "er_diagram":
        case "api_spec": {
          const r = generateDataModel({ projectId, orgId, createdBy: userId, params: params as { domain?: string } });
          result = { artifactId: r.artifactId, content: r.content };
          break;
        }
        default: {
          // Generic fallback — create a simple recommendation artifact
          const art = createArtifact({
            projectId,
            orgId,
            type: type as never,
            title: `${type} — ${projectId.slice(0, 8)}`,
            status: "draft",
            content: { generated: true, params, source_conversation_id, source_document_ids },
            diagramUrl: null,
            parentArtifactId: null,
            generatedBy: "ai",
            createdBy: userId,
          });
          result = { artifactId: art.id, content: art.content };
          break;
        }
      }
      const artifact = getArtifact(result.artifactId)!;
      res.status(201).json(artifact);
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// GET /artifacts/:id
router.get(
  "/artifacts/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const art = getArtifact(String(req.params.id));
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    res.json(art);
  }
);

// GET /artifacts/:id/versions
router.get(
  "/artifacts/:id/versions",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const versions = getArtifactVersions(String(req.params.id), orgId);
    if (versions.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    res.json({ data: versions });
  }
);

// POST /artifacts/:id/regenerate — creates new version with feedback
router.post(
  "/artifacts/:id/regenerate",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const art = getArtifact(String(req.params.id));
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const { feedback } = (req.body || {}) as { feedback?: string };
    const newArt = createNewVersion(art.id, {
      content: { ...(art.content as object), feedback: feedback || "regenerated", regeneratedAt: new Date().toISOString() } as Record<string, unknown>,
      createdBy: userId,
    });
    res.status(201).json(newArt);
  }
);

// PATCH /artifacts/:id — manual edit, creates new version
router.patch(
  "/artifacts/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const art = getArtifact(String(req.params.id));
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const updates = req.body as Partial<{ title: string; content: Record<string, unknown> }>;
    const newArt = createNewVersion(art.id, {
      title: updates.title || art.title,
      content: updates.content || (art.content as Record<string, unknown>),
      createdBy: userId,
    });
    res.json(newArt);
  }
);

// Diagram render endpoint for artifact viewer
router.post(
  "/artifacts/:id/render",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const art = getArtifact(String(req.params.id));
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const content = art.content as { diagramSpec?: { nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] } };
    if (!content.diagramSpec) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Artifact has no diagramSpec" } });
      return;
    }
    try {
      const svg = renderToSvg(content.diagramSpec);
      res.json({ svg, valid: isValidSvg(svg) });
    } catch (e) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: (e as Error).message } });
    }
  }
);

export default router;
