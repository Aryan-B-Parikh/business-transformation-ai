/**
 * Conversation routes — TASK-009
 * POST /projects/:id/conversations, GET /conversations/:id,
 * POST /conversations/:id/messages, GET /conversations/:id/messages
 * Message send triggers AI Orchestrator (discovery agent) and stores AI reply per DoD
 */

import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { discoveryAsk } from "../services/discoveryAgent";
import { getChunksByProject } from "../services/documentParser";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const router = Router();

// POST /projects/:id/conversations
router.post(
  "/projects/:id/conversations",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const projectId = String(req.params.id);
    const proj = await getRepositories().projects.findProjectById(orgId, projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const conv = await prisma.conversation.create({ data: { projectId, orgId, startedBy: userId } });
    res.status(201).json(conv);
  }
);

// GET /conversations/:id
router.get(
  "/conversations/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = await prisma.conversation.findUnique({ where: { id: String(req.params.id) }, include: { messages: true } });
    if (!conv || conv.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      return;
    }
    res.json(conv);
  }
);

// GET /conversations/:id/messages
router.get(
  "/conversations/:id/messages",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = await prisma.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!conv || conv.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      return;
    }
    const msgs = await prisma.conversationMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
    res.json({ data: msgs });
  }
);

// POST /conversations/:id/messages — send user message, returns AI reply (persisted)
router.post(
  "/conversations/:id/messages",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = await prisma.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!conv || conv.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      return;
    }
    const { content } = (req.body || {}) as { content?: string };
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "content required" } });
      return;
    }
    const userMsg = await prisma.conversationMessage.create({ data: { conversationId: conv.id, orgId, role: "user", content: content.trim() }});

    // Trigger AI Orchestrator — discovery agent with RAG context
    // Collect RAG chunks for project if any
    const docIds = (await prisma.document.findMany({ where: { projectId: conv.projectId }, select: { id: true } })).map((d: any) => d.id);
    let ragContext: string[] | undefined;
    if (docIds.length > 0) {
      const chunks = await prisma.documentChunk.findMany({ where: { documentId: { in: docIds } }});
      ragContext = chunks.slice(0, 3).map((c: any) => c.chunkText);
    }

    const messages = await prisma.conversationMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
    const history = messages.map((m: any) => ({ role: m.role as "user" | "ai", content: m.content }));
    const lang = (req as unknown as { lang?: string }).lang || (req.query.lang as string | undefined) || req.headers["accept-language"]?.split(",")[0]?.split(";")[0]?.trim() || "en";
    const aiResult = await discoveryAsk({ conversationHistory: history, ragContext, projectId: conv.projectId, orgId, lang });

    let aiContent: string;
    if (aiResult.type === "question") aiContent = aiResult.question;
    else aiContent = `Summary: ${aiResult.summary}\nStructured: ${JSON.stringify(aiResult.structured)}`;

    const aiMsg = await prisma.conversationMessage.create({ data: { conversationId: conv.id, orgId, role: "ai", content: aiContent }});

    res.status(201).json({ userMessage: userMsg, aiMessage: aiMsg, aiResult });
  }
);

export default router;
