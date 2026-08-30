/**
 * Admin routes — TASK-028
 * GET /admin/orgs/:orgId/usage
 * GET /admin/orgs/:orgId/audit-logs
 * GET /admin/orgs/:orgId/ai-models
 * PATCH /admin/orgs/:orgId/ai-models/:module
 * GET /admin/system/health
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { listAiModelConfigs, updateAiModelConfig } from "../stores/aiModelConfigs";
import { listArtifacts } from "../stores/artifacts";
import { listAuditLogs } from "../stores/auditLogs";
import { projects, workspaces } from "./workspaces";

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
  (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin can view usage" } });
      return;
    }
    // Mock usage metrics: count artifacts, workspaces, etc.
    const wsCount = [...workspaces.values()].filter((w) => w.orgId === orgId).length;
    const projCount = [...projects.values()].filter((p) => p.orgId === orgId).length;
    let artCount = 0;
    for (const p of projects.values()) if (p.orgId === orgId) artCount += listArtifacts(p.id, orgId).length;
    res.json({ orgId, workspaces: wsCount, projects: projCount, artifacts: artCount, period: "30d" });
  }
);

// GET /admin/orgs/:orgId/audit-logs?actor=&action=&from=&to=
router.get(
  "/admin/orgs/:orgId/audit-logs",
  authenticate,
  authorize("org_admin"),
  (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin can view audit logs" } });
      return;
    }
    const actor = typeof req.query.actor === "string" ? req.query.actor : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const logs = listAuditLogs(orgId, { actor, action, from, to });
    res.json({ data: logs, total: logs.length });
  }
);

// GET /admin/orgs/:orgId/ai-models
router.get(
  "/admin/orgs/:orgId/ai-models",
  authenticate,
  authorize("org_admin"),
  (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin" } });
      return;
    }
    const configs = listAiModelConfigs(orgId);
    res.json({ data: configs });
  }
);

// PATCH /admin/orgs/:orgId/ai-models/:module
router.patch(
  "/admin/orgs/:orgId/ai-models/:module",
  authenticate,
  authorize("org_admin"),
  (req: AuthedRequest, res: Response) => {
    const orgId = String(req.params.orgId);
    const mod = String(req.params.module);
    if (!isOrgAdmin(req, orgId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only org_admin" } });
      return;
    }
    const updates = req.body as Partial<{ provider: string; modelName: string; enabled: boolean }>;
    const updated = updateAiModelConfig(orgId, mod, updates as unknown as Partial<import("../stores/aiModelConfigs").AiModelConfig>);
    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Model config not found" } });
      return;
    }
    res.json(updated);
  }
);

// GET /admin/system/health
router.get(
  "/admin/system/health",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  (req: AuthedRequest, res: Response) => {
    // No org check, just health
    res.json({ status: "ok", version: "0.1.0", uptime: process.uptime(), checks: { db: "ok", vector: "ok", storage: "ok" } });
  }
);

export default router;
