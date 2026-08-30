/**
 * Workspace & Project routes — TASK-005
 * Implements per 04_API_SPEC.md Workspaces & Projects section
 * Tenant isolation: org_id always from JWT, never from client (02 §5)
 */

import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize, RBAC } from "../middleware/rbac";

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  orgId: string;
  name: string;
  status: "active" | "archived";
  createdAt: string;
  members: { projectId: string; userId: string; role: string; orgId: string }[];
}

// In-memory stores — deterministic for tests; production would use Prisma with RLS
const workspaces = new Map<string, Workspace>();
const projects = new Map<string, Project>();

export function clearStores(): void {
  workspaces.clear();
  projects.clear();
}

export function seedWorkspace(ws: Workspace): void {
  workspaces.set(ws.id, ws);
}

export function seedProject(p: Project): void {
  projects.set(p.id, p);
}

function q(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] as string;
  return v as string | undefined;
}

function paginate<T>(items: T[], req: AuthedRequest): { data: T[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, parseInt(q(req.query.page) || "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, parseInt(q(req.query.page_size) || q((req.query as Record<string, unknown>).pageSize) || "20", 10) || 20)
  );
  const total = items.length;
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, page, pageSize, total };
}

const router = Router();

// ── Workspaces ────────────────────────────────────────────────────────

// GET /workspaces — list for current org
router.get("/workspaces", authenticate, authorize(...RBAC.listWorkspaces), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const all = [...workspaces.values()].filter((w) => w.orgId === orgId);
  const { data, page, pageSize, total } = paginate(all, req);
  res.json({ data, page, page_size: pageSize, total });
});

// POST /workspaces — create
router.post("/workspaces", authenticate, authorize(...RBAC.createWorkspace), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const { name } = req.body || {};
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "name required (min 2 chars)" } });
    return;
  }
  const ws: Workspace = {
    id: uuidv4(),
    orgId,
    name: name.trim(),
    createdBy: req.user!.userId,
    createdAt: new Date().toISOString(),
  };
  workspaces.set(ws.id, ws);
  res.status(201).json(ws);
});

// GET /workspaces/:id
router.get("/workspaces/:id", authenticate, authorize(...RBAC.getWorkspace), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const ws = workspaces.get(String(req.params.id));
  if (!ws || ws.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
    return;
  }
  res.json(ws);
});

// POST /workspaces/:id/projects — create project in workspace
router.post(
  "/workspaces/:id/projects",
  authenticate,
  authorize(...RBAC.createProject),
  (req: AuthedRequest, res: Response) => {
    const orgId = req.user!.orgId;
    const ws = workspaces.get(String(req.params.id));
    if (!ws || ws.orgId !== orgId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
      return;
    }
    const { name, status } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "name required" } });
      return;
    }
    const project: Project = {
      id: uuidv4(),
      workspaceId: ws.id,
      orgId,
      name: name.trim(),
      status: status === "archived" ? "archived" : "active",
      createdAt: new Date().toISOString(),
      members: [],
    };
    projects.set(project.id, project);
    res.status(201).json(project);
  }
);

// ── Projects ──────────────────────────────────────────────────────────

// GET /projects/:id
router.get("/projects/:id", authenticate, authorize(...RBAC.getProject), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const proj = projects.get(String(req.params.id));
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  res.json(proj);
});

// PATCH /projects/:id
router.patch("/projects/:id", authenticate, authorize(...RBAC.updateProject), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const proj = projects.get(String(req.params.id));
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { name, status } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "name must be >=2 chars" } });
      return;
    }
    proj.name = name.trim();
  }
  if (status !== undefined) {
    if (!["active", "archived"].includes(status)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "status must be active|archived" } });
      return;
    }
    proj.status = status;
  }
  projects.set(proj.id, proj);
  res.json(proj);
});

// DELETE /projects/:id
router.delete("/projects/:id", authenticate, authorize(...RBAC.deleteProject), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const proj = projects.get(String(req.params.id));
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  projects.delete(proj.id);
  res.status(204).send();
});

// POST /projects/:id/members
router.post("/projects/:id/members", authenticate, authorize(...RBAC.addProjectMember), (req: AuthedRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const proj = projects.get(String(req.params.id));
  if (!proj || proj.orgId !== orgId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  const { userId, role } = req.body || {};
  if (!userId || !role) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "userId and role required" } });
    return;
  }
  if (!["owner", "contributor", "reviewer", "viewer"].includes(role)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "invalid role" } });
    return;
  }
  const member = { projectId: proj.id, userId, role, orgId };
  proj.members.push(member);
  projects.set(proj.id, proj);
  res.status(201).json(member);
});

export default router;
export { workspaces, projects };
