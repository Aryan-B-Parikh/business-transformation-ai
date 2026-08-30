/**
 * RBAC middleware — TASK-004
 * Enforces roles per endpoint per 02_TECHNICAL_ARCHITECTURE.md §5 and 04_API_SPEC.md.
 * Roles: org_admin, workspace_admin, contributor, reviewer, viewer
 *
 * DoD: Test matrix covering each role × each protected endpoint (allow/deny) passes.
 */

import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

export type UserRole = "org_admin" | "workspace_admin" | "contributor" | "reviewer" | "viewer";

// Role hierarchy not used for checks — explicit allow lists per endpoint keep least privilege
export const ALL_ROLES: UserRole[] = ["org_admin", "workspace_admin", "contributor", "reviewer", "viewer"];

/**
 * Returns 403 if user's role not in allowedRoles.
 * Assumes authenticate has run first (req.user present); otherwise 401.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
      return;
    }
    const role = req.user.role as UserRole;
    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Role '${role}' not allowed for this resource. Allowed: ${allowedRoles.join(", ")}`,
        },
      });
      return;
    }
    next();
  };
}

/**
 * Workspace / Project CRUD RBAC maps per TASK-005
 * These are the canonical allow-lists used by routes and by rbac.test.ts matrix
 */
export const RBAC = {
  // Workspaces
  listWorkspaces: ALL_ROLES, // any authenticated user can list
  createWorkspace: ["org_admin", "workspace_admin", "contributor"] as UserRole[],
  getWorkspace: ALL_ROLES,
  createProject: ["org_admin", "workspace_admin", "contributor"] as UserRole[],
  // Projects
  getProject: ALL_ROLES,
  updateProject: ["org_admin", "workspace_admin", "contributor"] as UserRole[],
  deleteProject: ["org_admin", "workspace_admin"] as UserRole[],
  addProjectMember: ["org_admin", "workspace_admin"] as UserRole[],
  // Orgs / Users
  getOwnOrg: ALL_ROLES,
  listOrgUsers: ["org_admin", "workspace_admin"] as UserRole[],
  inviteUser: ["org_admin", "workspace_admin"] as UserRole[],
  changeUserRole: ["org_admin"] as UserRole[],
} as const;

/** Helper: check if role is allowed for a given action */
export function isAllowed(role: UserRole, action: keyof typeof RBAC): boolean {
  return (RBAC[action] as readonly string[]).includes(role);
}
