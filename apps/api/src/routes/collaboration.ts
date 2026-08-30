/**
 * Collaboration routes — TASK-023, TASK-026
 * Comments, approvals, notifications, activity log
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { createApproval } from "../stores/approvals";
import { getArtifact } from "../stores/artifacts";
import { createAuditLog, listAuditLogs } from "../stores/auditLogs";
import { createComment, listComments } from "../stores/comments";
import { createNotification, listNotifications, listNotificationsByOrg, markRead } from "../stores/notifications";
import { triggerWebhooks } from "../stores/webhooks";
import { projects } from "./workspaces";

const router = Router();

// POST /artifacts/:id/comments
router.post(
  "/artifacts/:id/comments",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const artifactId = String(req.params.id);
    const art = getArtifact(artifactId);
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const { content, parent_comment_id } = req.body as { content?: string; parent_comment_id?: string };
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "content required" } });
      return;
    }
    const comment = createComment({
      artifactId,
      orgId,
      authorId: userId,
      parentCommentId: parent_comment_id || null,
      content: content.trim(),
    });
    // Audit log
    createAuditLog({ orgId, actorId: userId, action: "artifact.comment", targetType: "artifact", targetId: artifactId, metadata: { commentId: comment.id } });
    // Notifications: notify artifact creator and project members (simplified: notify creator)
    if (art.createdBy !== userId) {
      createNotification({ orgId, userId: art.createdBy, type: "comment", payload: { artifactId, commentId: comment.id, authorId: userId, content: comment.content } });
    }
    // Activity: also create notification for org (for feed)
    res.status(201).json(comment);
  }
);

// GET /artifacts/:id/comments
router.get(
  "/artifacts/:id/comments",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const artifactId = String(req.params.id);
    const art = getArtifact(artifactId);
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const comments = listComments(artifactId, orgId);
    res.json({ data: comments });
  }
);

// POST /artifacts/:id/approve — TASK-023 approval
router.post(
  "/artifacts/:id/approve",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer"),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const artifactId = String(req.params.id);
    const art = getArtifact(artifactId);
    if (!art || art.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found" } });
      return;
    }
    const { decision, comment } = req.body as { decision?: string; comment?: string };
    if (!decision || !["approved", "rejected", "changes_requested"].includes(decision)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "decision must be approved|rejected|changes_requested" } });
      return;
    }
    const approval = createApproval({
      artifactId,
      orgId,
      approverId: userId,
      decision: decision as "approved" | "rejected" | "changes_requested",
      comment: comment || null,
    });
    // Audit log
    createAuditLog({ orgId, actorId: userId, action: "artifact.approve", targetType: "artifact", targetId: artifactId, metadata: { decision, approvalId: approval.id } });
    // Notification to creator
    if (art.createdBy !== userId) {
      createNotification({ orgId, userId: art.createdBy, type: "approval", payload: { artifactId, decision, approverId: userId } });
    }
    // Trigger webhooks for artifact approved/rejected (TASK-027)
    try {
      const proj = projects.get(art.projectId);
      if (proj) {
        const event = decision === "approved" ? "artifact.approved" : `artifact.${decision}`;
        triggerWebhooks(proj.workspaceId, orgId, event, { artifactId, decision, projectId: art.projectId, orgId });
      }
    } catch {
      // ignore webhook errors
    }
    res.status(201).json(approval);
  }
);

// GET /notifications
router.get(
  "/notifications",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const userId = req.user!.userId;
    const orgId = req.user!.orgId;
    const notifs = listNotifications(userId, orgId);
    res.json({ data: notifs });
  }
);

// PATCH /notifications/:id/read
router.patch(
  "/notifications/:id/read",
  authenticate,
  authorize("org_admin", "workspace_admin", "contributor", "reviewer", "viewer"),
  (req: AuthedRequest, res: Response) => {
    const userId = req.user!.userId;
    const nid = String(req.params.id);
    const updated = markRead(nid, userId);
    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
      return;
    }
    res.json(updated);
  }
);

// GET /projects/:id/activity — activity feed (audit logs + comments)
router.get(
  "/projects/:id/activity",
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
    // For simplicity, return recent notifications for org as activity
    // In real, would aggregate audit_logs + comments
    const notifs = listNotificationsByOrg(orgId).slice(0, 20);
    const logs = listAuditLogs(orgId).slice(0, 20);
    res.json({
      data: [...notifs.map((n) => ({ kind: "notification", ...n })), ...logs.map((l) => ({ kind: "audit", ...l }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  }
);

export default router;
