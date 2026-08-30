/**
 * AI Orchestration internal routes — TASK-010,011,012
 * POST /ai/v1/discovery/ask
 * POST /ai/v1/business-analysis/generate
 * POST /ai/v1/consultant/validate-idea
 * These are internal-facing (02 §2.2) but documented in 04_API_SPEC.md
 * We mount under both /api/v1/ai/v1 and /ai/v1 for compat
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { generateArchitecture, validateArchitectureContent } from "../services/architectureAgent";
import { generateBusinessAnalysis, validateBusinessAnalysisContent } from "../services/businessAnalysis";
import { validateIdea } from "../services/consultant";
import { generateDataModel, validateDataModeling } from "../services/dataModelingAgent";
import { isValidSvg, renderToSvg } from "../services/diagramRenderer";
import { discoveryAsk } from "../services/discoveryAgent";
import { getChunksByProject } from "../services/documentParser";
import { generateEstimation, validateEstimationContent } from "../services/estimationAgent";
import { generateRoadmap, validateRoadmapContent } from "../services/plannerAgent";
import { generateProcess, validateBpmnJson } from "../services/processAgent";
import { generateUx, validateUx } from "../services/uxAgent";
import { getConversation, getMessages } from "../stores/conversations";
import { getDocIdsForProject } from "../stores/documents";
import { projects } from "./workspaces";

const router = Router();

// POST /ai/v1/discovery/ask
router.post("/ai/v1/discovery/ask", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const body = req.body as { conversationHistory?: { role: string; content: string }[]; conversationId?: string; projectId?: string; query?: string };
  let history = body.conversationHistory || [];
  let ragContext: string[] | undefined;
  let projectId = body.projectId;

  // If conversationId provided, load history from store
  if (body.conversationId) {
    const conv = getConversation(String(body.conversationId));
    if (conv && conv.orgId === orgId) {
      history = getMessages(conv.id, orgId).map((m) => ({ role: m.role, content: m.content }));
      projectId = conv.projectId;
      const docIds = getDocIdsForProject(projectId!);
      if (docIds.size > 0) {
        const chunks = getChunksByProject(projectId!, orgId, docIds);
        ragContext = chunks.slice(0, 3).map((c) => c.chunkText);
      }
    }
  } else if (body.query) {
    // Single query as user message
    history = [{ role: "user", content: String(body.query) }];
  }

  // If projectId provided, attach RAG
  if (projectId && !ragContext) {
    const docIds = getDocIdsForProject(projectId);
    if (docIds.size > 0) {
      const chunks = getChunksByProject(projectId, orgId, docIds);
      ragContext = chunks.slice(0, 3).map((c) => c.chunkText);
    }
  }

  const lang = (req as unknown as { lang?: string }).lang || (req.query.lang as string | undefined) || req.headers["accept-language"]?.split(",")[0]?.split(";")[0]?.trim() || "en";
  const result = discoveryAsk({ conversationHistory: history as { role: "user" | "ai"; content: string }[], ragContext, projectId, orgId, lang });
  res.json(result);
});

// POST /ai/v1/business-analysis/generate
router.post("/ai/v1/business-analysis/generate", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; conversationId?: string; documentIds?: string[] };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }

  let conversationHistory: { role: string; content: string }[] | undefined;
  if (body.conversationId) {
    const conv = getConversation(String(body.conversationId));
    if (conv && conv.orgId === orgId) conversationHistory = getMessages(conv.id, orgId).map((m) => ({ role: m.role, content: m.content }));
  }

  let documentExcerpts: string[] | undefined;
  if (body.documentIds && Array.isArray(body.documentIds)) {
    // Collect excerpts from chunks for those docs
    const docIds = getDocIdsForProject(projectId);
    const chunks = getChunksByProject(projectId, orgId, docIds).filter((c) => body.documentIds!.includes(c.documentId));
    documentExcerpts = chunks.slice(0, 5).map((c) => c.chunkText);
    if (!documentExcerpts.length) {
      // fallback to all project chunks
      const all = getChunksByProject(projectId, orgId, docIds);
      documentExcerpts = all.slice(0, 3).map((c) => c.chunkText);
    }
  }

  const { artifactId, content } = generateBusinessAnalysis({ projectId, orgId, conversationHistory, documentExcerpts, createdBy: userId });
  const validation = validateBusinessAnalysisContent(content);
  res.status(201).json({ artifactId, type: "business_analysis", status: "draft", content, validation, generatedBy: "ai" });
});

// POST /ai/v1/consultant/validate-idea
router.post("/ai/v1/consultant/validate-idea", authenticate, (req: AuthedRequest, res: Response) => {
  const body = req.body as { idea?: string; context?: { industry?: string; constraints?: string[] } };
  if (!body.idea || typeof body.idea !== "string") {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "idea required" } });
    return;
  }
  const lang = (req as unknown as { lang?: string }).lang || (req.query.lang as string | undefined) || req.headers["accept-language"]?.split(",")[0]?.split(";")[0]?.trim() || "en";
  const result = validateIdea({ idea: body.idea, context: body.context, lang });
  res.json(result);
});

// POST /ai/v1/architecture/generate — TASK-014
router.post("/ai/v1/architecture/generate", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; type?: string; params?: { cloud_preference?: string; compliance?: string[] } };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  const type = (body.type as "architecture_hld" | "architecture_lld") || "architecture_hld";
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content } = generateArchitecture({ projectId, orgId, type, params: body.params, createdBy: userId });
  const validation = validateArchitectureContent(content);
  res.status(201).json({ artifactId, type, status: "draft", content, validation, generatedBy: "ai" });
});

// POST /ai/v1/process/generate-workflow — TASK-015
router.post("/ai/v1/process/generate-workflow", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; params?: { processName?: string } };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content } = generateProcess({ projectId, orgId, createdBy: userId, params: body.params });
  const validation = validateBpmnJson(content);
  res.status(201).json({ artifactId, type: "process_workflow", status: "draft", content, validation, generatedBy: "ai" });
});

// POST /ai/v1/data-model/generate — TASK-016
router.post("/ai/v1/data-model/generate", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; params?: { domain?: string } };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content } = generateDataModel({ projectId, orgId, createdBy: userId, params: body.params });
  const validation = validateDataModeling(content);
  res.status(201).json({ artifactId, type: "er_diagram", status: "draft", content, validation, generatedBy: "ai" });
});

// POST /ai/v1/ux/generate-wireframes — TASK-017
router.post("/ai/v1/ux/generate-wireframes", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; params?: { appType?: string } };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content } = generateUx({ projectId, orgId, createdBy: userId, params: body.params });
  const validation = validateUx(content);
  res.status(201).json({ artifactId, type: "wireframe", status: "draft", content, validation, generatedBy: "ai" });
});

// POST /ai/v1/diagram/render — TASK-018
router.post("/ai/v1/diagram/render", authenticate, (req: AuthedRequest, res: Response) => {
  const body = req.body as { diagramSpec?: { nodes: { id: string; label: string; type?: string }[]; edges: { from: string; to: string; label?: string }[] } };
  if (!body.diagramSpec || !Array.isArray(body.diagramSpec.nodes)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "diagramSpec required" } });
    return;
  }
  try {
    const svg = renderToSvg(body.diagramSpec);
    if (!isValidSvg(svg)) throw new Error("Generated SVG invalid");
    res.json({ svg, valid: true });
  } catch (e) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: (e as Error).message } });
  }
});

// POST /ai/v1/planning/generate-roadmap — TASK-020
router.post("/ai/v1/planning/generate-roadmap", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; params?: { horizonMonths?: number } };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content, roadmapItemIds } = generateRoadmap({ projectId, orgId, createdBy: userId, params: body.params });
  const validation = validateRoadmapContent(content);
  res.status(201).json({ artifactId, type: "roadmap", status: "draft", content, validation, roadmapItemIds, generatedBy: "ai" });
});

// POST /ai/v1/planning/estimate — TASK-021
router.post("/ai/v1/planning/estimate", authenticate, (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const userId = req.user!.userId;
  const body = req.body as { projectId?: string; scope?: string[]; artifactId?: string };
  const projectId = body.projectId ? String(body.projectId) : undefined;
  if (!projectId) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "projectId required" } });
    return;
  }
  const proj = projects.get(projectId);
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { artifactId, content, estimateIds } = generateEstimation({ projectId, orgId, createdBy: userId, scope: body.scope, artifactId: body.artifactId });
  const validation = validateEstimationContent(content);
  res.status(201).json({ artifactId, type: "effort_estimate", status: "draft", content, validation, estimateIds, generatedBy: "ai" });
});

export default router;
