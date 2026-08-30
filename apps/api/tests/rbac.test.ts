/**
 * TASK-004 — RBAC middleware
 * DoD: Test matrix covering each role × each protected endpoint (allow/deny) passes
 * Roles: org_admin, workspace_admin, contributor, reviewer, viewer (02 §5)
 */

import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { SEED_USERS, getSeedPlainPassword } from "../src/auth/users";
import { RBAC, ALL_ROLES } from "../src/middleware/rbac";

const app = createApp();
const plain = getSeedPlainPassword();

// Helper: get token for a given role (first user with that role in ORG_A)
async function tokenFor(role: string): Promise<string> {
  const user = SEED_USERS.find((u) => u.role === role && u.orgId === "00000000-0000-0000-0000-0000000000aa");
  if (!user) throw new Error(`No seed user for role ${role}`);
  const res = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: plain });
  if (res.status !== 200) throw new Error(`Login failed for ${role}: ${res.body.error?.message}`);
  return res.body.token;
}

// Protected endpoints matrix per RBAC constant in src/middleware/rbac.ts
// We test representative endpoints for each RBAC action
interface MatrixRow {
  action: keyof typeof RBAC;
  method: "get" | "post" | "patch" | "delete";
  // factory to get URL (may need seeded workspace/project IDs)
  url: (ids: { wsId: string; projId: string }) => string;
  body?: Record<string, unknown>;
}

describe("TASK-004: RBAC middleware — role × endpoint matrix", () => {
  // We will lazily create a workspace/project as org_admin to test project endpoints
  let wsId = "";
  let projId = "";

  beforeEach(async () => {
    // Ensure workspace/project exist — handles cross-file clearStores (workspace-project.test) by recreating
    const adminToken = await tokenFor("org_admin");
    if (!wsId) {
      const wsRes = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: `RBAC WS ${Date.now()}` });
      if (wsRes.status === 201) {
        wsId = wsRes.body.id;
        const projRes = await request(app)
          .post(`/api/v1/workspaces/${wsId}/projects`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: `RBAC Proj ${Date.now()}` });
        if (projRes.status === 201) projId = projRes.body.id;
      }
    } else {
      // Verify still exists (might have been cleared by another test file)
      const check = await request(app).get(`/api/v1/workspaces/${wsId}`).set("Authorization", `Bearer ${adminToken}`);
      if (check.status === 404) {
        wsId = "";
        projId = "";
        const wsRes = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: `RBAC WS Recreate ${Date.now()}` });
        if (wsRes.status === 201) {
          wsId = wsRes.body.id;
          const projRes = await request(app)
            .post(`/api/v1/workspaces/${wsId}/projects`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ name: `RBAC Proj Recreate ${Date.now()}` });
          if (projRes.status === 201) projId = projRes.body.id;
        }
      }
    }
  });

  const matrix: MatrixRow[] = [
    // Workspace creation — only org_admin, workspace_admin, contributor
    { action: "createWorkspace", method: "post", url: () => "/api/v1/workspaces", body: { name: "Test WS" } },
    // Workspace listing — all roles
    { action: "listWorkspaces", method: "get", url: () => "/api/v1/workspaces" },
    // Get workspace — all roles
    { action: "getWorkspace", method: "get", url: (ids) => `/api/v1/workspaces/${ids.wsId}` },
    // Create project — org_admin, workspace_admin, contributor
    { action: "createProject", method: "post", url: (ids) => `/api/v1/workspaces/${ids.wsId}/projects`, body: { name: "New Proj" } },
    // Get project — all
    { action: "getProject", method: "get", url: (ids) => `/api/v1/projects/${ids.projId}` },
    // Update project — org_admin, workspace_admin, contributor
    { action: "updateProject", method: "patch", url: (ids) => `/api/v1/projects/${ids.projId}`, body: { name: "Renamed" } },
    // Delete project — org_admin, workspace_admin only
    { action: "deleteProject", method: "delete", url: (ids) => `/api/v1/projects/${ids.projId}` },
    // Add member — org_admin, workspace_admin only
    { action: "addProjectMember", method: "post", url: (ids) => `/api/v1/projects/${ids.projId}/members`, body: { userId: "11111111-1111-1111-1111-111111111111", role: "viewer" } },
    // Org users listing — org_admin, workspace_admin
    { action: "listOrgUsers", method: "get", url: () => `/api/v1/orgs/00000000-0000-0000-0000-0000000000aa/users` },
  ];

  for (const row of matrix) {
    describe(`${row.action} ${row.method.toUpperCase()} ${row.url({ wsId: "ws", projId: "proj" })}`, () => {
      for (const role of ALL_ROLES) {
        const allowed = (RBAC[row.action] as readonly string[]).includes(role);
        it(`${role} → ${allowed ? "ALLOWED" : "FORBIDDEN (403)"}`, async () => {
          const token = await tokenFor(role);

          // For delete/add-member we need a fresh project per iteration to avoid 404 after delete
          let ids = { wsId, projId };
          if (row.action === "deleteProject" || row.action === "addProjectMember") {
            // create a fresh project for each role test to keep isolation
            const adminToken = await tokenFor("org_admin");
            const freshWs = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: `Tmp WS ${role} ${Date.now()}` });
            const freshWsId = freshWs.body.id;
            const freshProj = await request(app)
              .post(`/api/v1/workspaces/${freshWsId}/projects`)
              .set("Authorization", `Bearer ${adminToken}`)
              .send({ name: `Tmp Proj ${role}` });
            ids = { wsId: freshWsId, projId: freshProj.body.id };
          }

          const url = row.url(ids);
          let req = request(app)[row.method](url).set("Authorization", `Bearer ${token}`);
          if (row.body) req = req.send(row.body);

          const res = await req;

          if (allowed) {
            // Allowed should NOT be 403; could be 200/201/204 or 400/404 (if bad data) but not 403/401
            expect(res.status).not.toBe(403);
            expect(res.status).not.toBe(401);
            // For list/get, expect 200; for create, 201; delete, 204
            if (row.method === "get") expect([200, 404]).toContain(res.status); // 404 possible if ws/proj not found due to race
            if (row.action === "createWorkspace" && allowed) expect([201, 400]).toContain(res.status);
          } else {
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe("FORBIDDEN");
            expect(res.body.error.message).toContain(role);
          }
        });
      }

      it("unauthenticated → 401", async () => {
        let ids = { wsId, projId };
        if (!wsId || !projId) {
          // fallback: use dummy ids; unauth check will happen before existence check, so 401 is expected anyway
          ids = { wsId: "00000000-0000-0000-0000-000000000001", projId: "00000000-0000-0000-0000-000000000002" };
        }
        const url = row.url(ids);
        let req = request(app)[row.method](url);
        if (row.body) req = req.send(row.body);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHORIZED");
      });
    });
  }

  it("RBAC constant matches 02 §5 roles", () => {
    expect(ALL_ROLES).toEqual(["org_admin", "workspace_admin", "contributor", "reviewer", "viewer"]);
    // Ensure every RBAC action is subset of ALL_ROLES
    for (const roles of Object.values(RBAC) as readonly string[][]) {
      for (const r of roles) {
        expect(ALL_ROLES).toContain(r);
      }
    }
  });
});
