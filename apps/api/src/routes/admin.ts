/**
 * Admin routes — TASK-028
 * GET /admin/orgs/:orgId/usage
 * GET /admin/orgs/:orgId/audit-logs
 * GET /admin/orgs/:orgId/ai-models
 * PATCH /admin/orgs/:orgId/ai-models/:module
 * GET /admin/system/health
 */

import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();


const router = Router();

// Helper: admin check (org_admin only)
function isOrgAdmin(req: AuthedRequest, orgId: string): boolean {
  return req.user!.orgId === orgId && req.user!.role === "org_admin";
}

// GET /admin/orgs/:orgId/usage
router.get(
  "/admin/orgs/:orgId/usage",
  authenticate,
  authorize("org_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin can view usage" } });
      return;
    }
    // Mock usage metrics: count artifacts, workspaces, etc.
    const wss = await getRepositories().projects.listWorkspaces(orgId);
    const wsCount = wss.length;
    let projCount = 0;
    let artCount = 0;
    for (const w of wss) {
      const projs = await getRepositories().projects.listProjectsByWorkspace(orgId, w.id);
      projCount += projs.length;
      for (const p of projs) {
        artCount += await prisma.artifact.count({ where: { orgId, projectId: p.id } });
      }
    }
    res.json({ orgId, workspaces: wsCount, projects: projCount, artifacts: artCount, period: "30d" });
  }
);

// GET /admin/orgs/:orgId/audit-logs?actor=&action=&from=&to=
router.get(
  "/admin/orgs/:orgId/audit-logs",
  authenticate,
  authorize("org_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin can view audit logs" } });
      return;
    }
    const actor = typeof req.query.actor === "string" ? req.query.actor : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;

    const where: any = { orgId };
    if (actor) where.actorId = actor;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ data: logs, total: logs.length });
  }
);

// GET /admin/orgs/:orgId/ai-models
router.get(
  "/admin/orgs/:orgId/ai-models",
  authenticate,
  authorize("org_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin" } });
      return;
    }
    const configs = await prisma.aiModelConfig.findMany({ where: { orgId } });
    res.json({ data: configs });
  }
);

// PATCH /admin/orgs/:orgId/ai-models/:module
router.patch(
  "/admin/orgs/:orgId/ai-models/:module",
  authenticate,
  authorize("org_admin"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    const mod = String(req.params.module);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin" } });
      return;
    }
    const updates = req.body as Partial<{ provider: string; modelName: string; enabled: boolean }>;
    try {
      const updated = await prisma.aiModelConfig.update({
        where: { orgId_module: { orgId, module: mod } },
        data: updates
      });
      res.json(updated);
    } catch (e) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Model config not found" } });
      return;
    }
  }
);

// GET /admin/system/health
router.get(
  "/admin/system/health",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  async (req: AuthedRequest, res: Response) => {
    // No org check, just health
    res.json({ status: "ok", version: "0.1.0", uptime: process.uptime(), checks: { db: "ok", vector: "ok", storage: "ok" } });
  }
);

export default router;
