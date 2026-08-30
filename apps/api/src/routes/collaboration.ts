import { Router, Response } from "express";
import { getRepositories } from "../repositories";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { getArtifact } from "../stores/artifacts";
import { triggerWebhooks } from "../stores/webhooks";

const router = Router();

// POST /artifacts/:id/comments
router.post(
  "/artifacts/:id/comments",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const userId = req.user!.userId;
      const artifactId = String(req.params.id);
      
      const art = getArtifact(artifactId);
      if (!art || art.orgId !== orgId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
        return;
      }
      
      const { content, parentCommentId } = req.body as { content?: string; parentCommentId?: string };
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "content required" } });
        return;
      }

      const comment = await getRepositories().artifacts.addComment(orgId, artifactId, userId, content.trim());
      
      await getRepositories().governance.recordAuditLog(orgId, userId, "artifact.comment", "artifact", artifactId, { commentId: comment.id });

      // Notifications: notify artifact creator
      if (art.createdBy !== userId && art.createdBy) {
        await getRepositories().collaboration.createNotification(orgId, art.createdBy, "comment", `New comment on artifact ${artifactId}`);
      }

      // Mentions Notification
      const mentions = content.match(/@([a-zA-Z0-9_-]+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const username = mention.slice(1);
          await getRepositories().collaboration.createNotification(orgId, username, "mention", `You were mentioned in artifact ${artifactId}`);
        }
      }

      res.status(201).json(comment);
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// GET /artifacts/:id/comments
router.get(
  "/artifacts/:id/comments",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const artifactId = String(req.params.id);
      
      const art = getArtifact(artifactId);
      if (!art || art.orgId !== orgId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
        return;
      }
      
      const comments = await getRepositories().artifacts.listComments(orgId, artifactId);
      res.json({ data: comments });
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// POST /artifacts/:id/review (Move to in_review state)
router.post(
  "/artifacts/:id/review",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const artifactId = String(req.params.id);
      
      const art = getArtifact(artifactId);
      if (!art || art.orgId !== orgId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
        return;
      }
      
      if (art.status !== "draft") {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Only draft artifacts can be moved to in_review" } });
        return;
      }

      art.status = "in_review";
      res.status(200).json(art);
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// POST /artifacts/:id/approve — TASK-023 approval & State Machine
router.post(
  "/artifacts/:id/approve",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const userId = req.user!.userId;
      const artifactId = String(req.params.id);
      
      const art = getArtifact(artifactId);
      if (!art || art.orgId !== orgId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
        return;
      }
      
      if (art.status !== "in_review") {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Only in_review artifacts can receive approval decisions" } });
        return;
      }
      
      const { decision, comment } = req.body as { decision?: string; comment?: string };
      if (!decision || !["approved", "rejected", "changes_requested"].includes(decision)) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "decision must be approved|rejected|changes_requested" } });
        return;
      }
      
      const approval = await getRepositories().collaboration.recordApproval(orgId, artifactId, userId, decision as "approved" | "rejected" | "changes_requested", comment);
      
      // Update state machine
      if (decision === "approved") {
        art.status = "approved";
      } else {
        art.status = "draft";
      }

      await getRepositories().governance.recordAuditLog(orgId, userId, "artifact.approve", "artifact", artifactId, { decision, approvalId: approval.id });
      
      if (art.createdBy !== userId && art.createdBy) {
        await getRepositories().collaboration.createNotification(orgId, art.createdBy, "approval", `Artifact ${artifactId} was ${decision}`);
      }
      
      try {
        const proj = await getRepositories().projects.findProjectById(orgId, art.projectId);
        if (proj) {
          const event = decision === "approved" ? "artifact.approved" : `artifact.${decision}`;
          triggerWebhooks(proj.workspaceId, orgId, event, { artifactId, decision, projectId: art.projectId, orgId });
        }
      } catch {
        // ignore webhook errors
      }
      
      res.status(201).json(approval);
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// GET /notifications
router.get(
  "/notifications",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const orgId = req.user!.orgId;
      const notifs = await getRepositories().collaboration.listNotifications(orgId, userId);
      res.json({ data: notifs });
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// PATCH /notifications/:id/read
router.patch(
  "/notifications/:id/read",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const nid = String(req.params.id);
      const updated = await getRepositories().collaboration.markNotificationRead(orgId, nid);
      res.json(updated);
    } catch (e) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
    }
  }
);

// GET /projects/:id/activity — activity feed (audit logs + notifications)
router.get(
  "/projects/:id/activity",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const projectId = String(req.params.id);
      const proj = await getRepositories().projects.findProjectById(orgId, projectId);
      
      if (!proj || proj.orgId !== orgId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
        return;
      }
      
      const logs = await getRepositories().governance.listAuditLogs(orgId, 20);
      res.json({
        data: logs.map((l) => ({ kind: "audit", ...l }))
      });
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

export default router;
