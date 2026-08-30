import { Router, Response } from "express";
import { z } from "zod";
import { getRepositories } from "../repositories";
import { authenticate, AuthedRequest } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();
const transitionSchema = z.object({
  stage: z.enum([
    "idea", "discovery", "business_analysis", "solution_design", "architecture",
    "process_design", "ux_design", "data_design", "planning", "review", "approved", "implementation",
  ]),
  status: z.enum(["pending", "in_progress", "completed", "blocked"]),
  version: z.number().int().positive().optional(),
  reason: z.string().max(2000).optional(),
});

router.get(
  "/projects/:id/journey",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const project = await getRepositories().projects.findProjectById(orgId, projectId);
    if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    const stages = await getRepositories().transformation.getJourneyState(orgId, projectId);
    res.json({ project_id: projectId, stages });
  },
);

router.post(
  "/projects/:id/journey/transition",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  async (req: AuthedRequest, res: Response) => {
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid journey transition", details: parsed.error.flatten() } });
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const project = await getRepositories().projects.findProjectById(orgId, projectId);
    if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });

    try {
      const result = await getRepositories().transformation.transitionStage(
        orgId, projectId, parsed.data.stage, parsed.data.status, req.user!.userId, parsed.data.reason,
      );
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Journey transition failed";
      const status = /invalid|cannot jump|already|version|concurrency/i.test(message) ? 409 : 500;
      res.status(status).json({ error: { code: status === 409 ? "CONFLICT" : "INTERNAL_ERROR", message } });
    }
  },
);

export default router;
