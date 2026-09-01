/**
 * Workspace & Project routes — TASK-005
 * Implements per 04_API_SPEC.md Workspaces & Projects section
 * Tenant isolation: orgId always from JWT, never from client (02 §5)
 */

import { Router, Response } from "express";
import { AuthedRequest, authenticate } from "../middleware/auth";
import { authorize, RBAC } from "../middleware/rbac";
import { getRepositories } from "../repositories";
import { UserRole } from "@bta/shared";

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

// Keep temporary maps exported so dependent modules compile until migrated
export const workspaces = new Map<string, any>();
export const projects = new Map<string, any>();
export function clearStores(): void {
  workspaces.clear();
  projects.clear();
  // Clear the memory repo for tests
  const repos = getRepositories();
  if ('workspaces' in repos.projects) {
    (repos.projects as any).workspaces.clear();
    (repos.projects as any).projects.clear();
    (repos.projects as any).members.clear();
  }
}
export function seedWorkspace(ws: any): void {
  const repos = getRepositories();
  if ('workspaces' in repos.projects) {
    (repos.projects as any).workspaces.set(ws.id, ws);
  }
}
export function seedProject(p: any): void {
  const repos = getRepositories();
  if ('projects' in repos.projects) {
    (repos.projects as any).projects.set(p.id, p);
  }
}

const router = Router();

// ── Workspaces ────────────────────────────────────────────────────────

router.get("/workspaces", authenticate, authorize(...RBAC.listWorkspaces), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const role = req.user!.role as UserRole;
    const all = await getRepositories().projects.listWorkspaces(orgId);
    let filtered = all;
    // Project-scoped RBAC: non-admins only see workspaces where they have project membership
    if (role !== "org_admin" && role !== "workspace_admin") {
      const repos = getRepositories();
      const visibleWsIds = new Set<string>();
      for (const ws of all) {
        try {
          const projects = await repos.projects.listProjectsByWorkspace(orgId, ws.id);
          for (const p of projects) {
            const members = await repos.projects.listMembers(orgId, p.id).catch(() => []);
            if (members.length === 0 || members.some((m) => m.userId === req.user!.userId)) {
              visibleWsIds.add(ws.id);
              break;
            }
          }
        } catch {
          // ignore
        }
      }
      filtered = all.filter((w) => visibleWsIds.has(w.id));
    }
    const { data, page, pageSize, total } = paginate(filtered, req);
    res.json({ data, page, page_size: pageSize, total });
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.post("/workspaces", authenticate, authorize(...RBAC.createWorkspace), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const { name, description } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "name required (min 2 chars)" } });
      return;
    }
    const ws = await getRepositories().projects.createWorkspace(orgId, { name: name.trim(), description, createdBy: req.user!.userId });
    res.status(201).json(ws);
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.get("/workspaces/:id", authenticate, authorize(...RBAC.getWorkspace), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const ws = await getRepositories().projects.findWorkspaceById(orgId, String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
      return;
    }
    res.json(ws);
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.post(
  "/workspaces/:id/projects",
  authenticate,
  authorize(...RBAC.createProject),
  async (req: AuthedRequest, res: Response) => {
    try {
      const orgId = req.user!.orgId;
      const wsId = String(req.params.id);
      const ws = await getRepositories().projects.findWorkspaceById(orgId, wsId);
      if (!ws) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
        return;
      }
      const { name, description } = req.body || {};
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "name required" } });
        return;
      }
      const project = await getRepositories().projects.createProject(orgId, wsId, { name: name.trim(), description });
      res.status(201).json(project);
    } catch (e) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
    }
  }
);

// ── Projects ──────────────────────────────────────────────────────────

router.get("/projects/:id", authenticate, authorize(...RBAC.getProject), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const proj = await getRepositories().projects.findProjectById(orgId, String(req.params.id));
    if (!proj) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    res.json(proj);
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.patch("/projects/:id", authenticate, authorize(...RBAC.updateProject), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const repos = getRepositories();
    const proj = await repos.projects.findProjectById(orgId, projectId);
    if (!proj) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    const { name, description, status } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "name must be >=2 chars" } });
      return;
    }
    if (status !== undefined && !["active", "archived"].includes(status)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "status must be active|archived" } });
      return;
    }
    const updated = await repos.projects.updateProject(orgId, projectId, {
      name: name?.trim(),
      description,
      status
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.delete("/projects/:id", authenticate, authorize(...RBAC.deleteProject), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const repos = getRepositories();
    const proj = await repos.projects.findProjectById(orgId, projectId);
    if (!proj) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }
    await repos.projects.deleteProject(orgId, projectId);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

router.post("/projects/:id/members", authenticate, authorize(...RBAC.addProjectMember), async (req: AuthedRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    const projectId = String(req.params.id);
    const repos = getRepositories();
    const proj = await repos.projects.findProjectById(orgId, projectId);
    if (!proj) {
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
    const member = await repos.projects.addMember(orgId, projectId, userId, role as UserRole);
    res.status(201).json(member);
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: (e as Error).message } });
  }
});

export default router;
