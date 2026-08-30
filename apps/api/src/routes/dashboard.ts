/**
 * Dashboard routes — TASK-022
 * GET /projects/:id/dashboard (+ history), computing maturity/readiness/health scores from artifacts + estimates
 */

import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { computeDashboard, captureSnapshot, getDashboardHistory } from "../services/dashboard";


const router = Router();

// GET /projects/:id/dashboard
router.get(
  "/projects/:id/dashboard",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const proj = await getRepositories().projects.findProjectById(orgId, projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const dashboard = await computeDashboard(projectId, orgId);
    // Capture snapshot for history (idempotent per request, but we create one)
    const snapshot = await captureSnapshot(projectId, orgId);
    res.json({ ...dashboard, snapshotId: snapshot.id });
  }
);

// GET /projects/:id/dashboard/history
router.get(
  "/projects/:id/dashboard/history",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const proj = await getRepositories().projects.findProjectById(orgId, projectId);
    if (!proj || proj.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const history = await getDashboardHistory(projectId, orgId);
    res.json({ data: history, total: history.length });
  }
);

export default router;
