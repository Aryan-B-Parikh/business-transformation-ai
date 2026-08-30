/**
 * Conversation routes — TASK-009
 * POST /projects/:id/conversations, GET /conversations/:id,
 * POST /conversations/:id/messages, GET /conversations/:id/messages
 * Message send triggers AI Orchestrator (discovery agent) and stores AI reply per DoD
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { discoveryAsk } from "../services/discoveryAgent";
import { getChunksByProject } from "../services/documentParser";
import { addMessage, createConversation, getConversation, getMessages, getConversationWithMessages } from "../stores/conversations";
import { getDocIdsForProject } from "../stores/documents";
import { projects } from "./workspaces";

const router = Router();

// POST /projects/:id/conversations
router.post(
  "/projects/:id/conversations",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const projectId = String(req.params.id);
    const proj = projects.get(projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const conv = createConversation(projectId, orgId, userId);
    res.status(201).json(conv);
  }
);

// GET /conversations/:id
router.get(
  "/conversations/:id",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = getConversationWithMessages(String(req.params.id), orgId);
    if (!conv) {
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
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = getConversation(String(req.params.id));
    if (!conv || conv.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      return;
    }
    const msgs = getMessages(conv.id, orgId);
    res.json({ data: msgs });
  }
);

// POST /conversations/:id/messages — send user message, returns AI reply (persisted)
router.post(
  "/conversations/:id/messages",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const conv = getConversation(String(req.params.id));
    if (!conv || conv.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      return;
    }
    const { content } = (req.body || {}) as { content?: string };
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "content required" } });
      return;
    }
    const userMsg = addMessage(conv.id, orgId, "user", content.trim());

    // Trigger AI Orchestrator — discovery agent with RAG context
    // Collect RAG chunks for project if any
    const docIds = getDocIdsForProject(conv.projectId);
    let ragContext: string[] | undefined;
    if (docIds.size > 0) {
      const chunks = getChunksByProject(conv.projectId, orgId, docIds);
      ragContext = chunks.slice(0, 3).map((c) => c.chunkText);
    }

    const history = getMessages(conv.id, orgId).map((m) => ({ role: m.role as "user" | "ai", content: m.content }));
    const lang = (req as unknown as { lang?: string }).lang || (req.query.lang as string | undefined) || req.headers["accept-language"]?.split(",")[0]?.split(";")[0]?.trim() || "en";
    const aiResult = discoveryAsk({ conversationHistory: history, ragContext, projectId: conv.projectId, orgId, lang });

    let aiContent: string;
    if (aiResult.type === "question") aiContent = aiResult.question;
    else aiContent = `Summary: ${aiResult.summary}\nStructured: ${JSON.stringify(aiResult.structured)}`;

    const aiMsg = addMessage(conv.id, orgId, "ai", aiContent);

    res.status(201).json({ userMessage: userMsg, aiMessage: aiMsg, aiResult });
  }
);

export default router;
