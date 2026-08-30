/**
 * Webhook routes — TASK-027
 * Outbound webhook config per workspace
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { PrismaClient } from "@prisma/client";
import { getRepositories } from "../repositories";

const prisma = new PrismaClient();

const router = Router();

// POST /workspaces/:id/webhooks — configure webhook
router.post(
  "/workspaces/:id/webhooks",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const workspaceId = String(req.params.id);
    // Verify workspace exists and belongs to org
    const ws = await getRepositories().projects.findWorkspaceById(orgId, workspaceId);
    if (!ws || ws.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
      return;
    }
    const { url, events } = req.body as { url?: string; events?: string[] };
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "valid url required" } });
      return;
    }
    const evts = events && Array.isArray(events) && events.length > 0 ? events : ["artifact.approved", "artifact.created"];
    const cfg = await prisma.webhookConfig.create({
      data: { workspaceId, orgId, url, events: evts }
    });
    res.status(201).json(cfg);
  }
);

// GET /workspaces/:id/webhooks
router.get(
  "/workspaces/:id/webhooks",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const workspaceId = String(req.params.id);
    const ws = await getRepositories().projects.findWorkspaceById(orgId, workspaceId);
    if (!ws || ws.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
      return;
    }
    const list = await prisma.webhookConfig.findMany({ where: { workspaceId, orgId } });
    res.json({ data: list });
  }
);

// POST /workspaces/:id/webhooks/:webhookId/trigger — manual trigger for tests (simulates artifact event)
router.post(
  "/workspaces/:id/webhooks/:webhookId/trigger",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const workspaceId = String(req.params.id);
    const webhookId = String(req.params.webhookId);
    const { event, payload } = req.body as { event?: string; payload?: Record<string, unknown> };
    const cfg = await prisma.webhookConfig.findUnique({ where: { id: webhookId } });
    if (!cfg || cfg.orgId !== orgId || cfg.workspaceId !== workspaceId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Webhook not found" } });
      return;
    }
    // mock sync delivery for test
    const outbox = await getRepositories().webhooks.queueOutboxEvent(orgId, event || "artifact.approved", workspaceId, payload || { test: true });
    res.json({ deliveries: [outbox] });
  }
);

// GET /webhooks/deliveries — for tests to verify webhook was called
router.get(
  "/webhooks/deliveries",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const all = await prisma.outboxEvent.findMany({ where: { orgId } });
    res.json({ data: all });
  }
);

export default router;
