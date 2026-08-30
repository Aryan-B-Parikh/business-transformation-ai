/**
 * Org routes — TASK-005 (partial) per 04_API_SPEC.md
 * GET /orgs/me
 * GET /orgs/:orgId/users
 * POST /orgs/:orgId/users
 * PATCH /orgs/:orgId/users/:userId
 */

import { Router, Response } from "express";
import { listUsersByOrg, findUserById } from "../auth/users";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// GET /orgs/me — requires auth, returns org derived from JWT (tenant isolation)
router.get("/orgs/me", authenticate, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  res.json({ id: user.orgId, name: `Org ${user.orgId.slice(0, 8)}`, plan: "standard" });
});

// GET /orgs/:orgId/users — only allow if :orgId matches JWT orgId AND role allowed
router.get(
  "/orgs/:orgId/users",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  (req: AuthedRequest, res: Response) => {
    const jwtOrg = req.user!.orgId;
    const paramOrg = String(req.params.orgId);
    if (paramOrg !== jwtOrg) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
      return;
    }
    const users = listUsersByOrg(jwtOrg).map((u) => ({
      id: u.id,
      orgId: u.orgId,
      email: u.email,
      name: u.name,
      role: u.role,
    }));
    res.json({ users });
  }
);

// POST /orgs/:orgId/users — invite (mock)
router.post(
  "/orgs/:orgId/users",
  authenticate,
  authorize("org_admin", "workspace_admin"),
  (req: AuthedRequest, res: Response) => {
    const jwtOrg = req.user!.orgId;
    const paramOrg = String(req.params.orgId);
    if (paramOrg !== jwtOrg) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
      return;
    }
    const { email, name, role } = req.body || {};
    if (!email || !role) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "email and role required" } });
      return;
    }
    // Mock creation — echo
    res.status(201).json({ id: `new_${Date.now()}`, orgId: jwtOrg, email, name: name || "", role });
  }
);

// PATCH /orgs/:orgId/users/:userId — role change, org_admin only
router.patch(
  "/orgs/:orgId/users/:userId",
  authenticate,
  authorize("org_admin"),
  (req: AuthedRequest, res: Response) => {
    const jwtOrg = req.user!.orgId;
    const paramOrg = String(req.params.orgId);
    if (paramOrg !== jwtOrg) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
      return;
    }
    const target = findUserById(String(req.params.userId));
    if (!target || target.orgId !== jwtOrg) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    const { role } = req.body || {};
    if (!role) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "role required" } });
      return;
    }
    // Mock update
    res.json({ ...target, role, orgId: jwtOrg });
  }
);

export default router;
