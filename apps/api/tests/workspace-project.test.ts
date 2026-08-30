/**
 * TASK-005 — Org/Workspace/Project CRUD API
 * DoD: All endpoints covered by integration tests; OpenAPI spec generated and matches 04_API_SPEC.md
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword, ORG_A } from "../src/auth/users";
import { openApiSpec } from "../src/openapi";
import { clearStores } from "../src/routes/workspaces";

const app = createApp();
const plain = getSeedPlainPassword();

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: plain });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe("TASK-005: Workspace & Project CRUD", () => {
  let adminToken: string;
  let viewerToken: string;
  let orgBToken: string;

  beforeEach(async () => {
    clearStores();
    adminToken = await loginAs("org_admin@org-a.com");
    viewerToken = await loginAs("viewer@org-a.com");
    orgBToken = await loginAs("org_admin@org-b.com");
  });

  it("GET /api/v1/workspaces — empty list initially, supports pagination", async () => {
    const res = await request(app).get("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.page).toBe(1);
    expect(res.body.page_size).toBeDefined();
    expect(res.body.total).toBe(0);
  });

  it("POST /api/v1/workspaces — creates workspace, tenant-scoped", async () => {
    const res = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: " Alpha Workspace " });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Alpha Workspace"); // trimmed
    expect(res.body.orgId).toBe(ORG_A);
    expect(res.body.createdBy).toBeDefined();
  });

  it("POST /api/v1/workspaces — validation: name required", async () => {
    const res = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "a" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("POST /api/v1/workspaces — RBAC: viewer cannot create (403)", async () => {
    const res = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${viewerToken}`).send({ name: "Viewer WS" });
    expect(res.status).toBe(403);
  });

  it("GET /api/v1/workspaces — tenant isolation: org B does not see org A workspaces", async () => {
    await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "Org A WS" });
    const asB = await request(app).get("/api/v1/workspaces").set("Authorization", `Bearer ${orgBToken}`);
    expect(asB.status).toBe(200);
    expect(asB.body.data).toEqual([]);
    const asA = await request(app).get("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`);
    expect(asA.body.data).toHaveLength(1);
  });

  it("GET /api/v1/workspaces/:id — returns workspace if same tenant, 404 if cross-tenant", async () => {
    const created = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS for Get" });
    const id = created.body.id;
    const asOwner = await request(app).get(`/api/v1/workspaces/${id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.id).toBe(id);
    const asOtherOrg = await request(app).get(`/api/v1/workspaces/${id}`).set("Authorization", `Bearer ${orgBToken}`);
    expect(asOtherOrg.status).toBe(404);
  });

  it("POST /api/v1/workspaces/:id/projects — creates project under workspace", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS for Proj" });
    const wsId = ws.body.id;
    const proj = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "My Project" });
    expect(proj.status).toBe(201);
    expect(proj.body.workspaceId).toBe(wsId);
    expect(proj.body.orgId).toBe(ORG_A);
    expect(proj.body.status).toBe("active");
    expect(proj.body.name).toBe("My Project");
  });

  it("POST /api/v1/workspaces/:id/projects — 404 if workspace not found or cross-tenant", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const wsId = ws.body.id;
    const asB = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${orgBToken}`).send({ name: "Cross" });
    expect(asB.status).toBe(404);
    const notFound = await request(app).post("/api/v1/workspaces/00000000-0000-0000-0000-000000000099/projects").set("Authorization", `Bearer ${adminToken}`).send({ name: "Nope" });
    expect(notFound.status).toBe(404);
  });

  it("GET /api/v1/projects/:id — retrieve project", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj Get" });
    const fetched = await request(app).get(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(proj.body.id);
  });

  it("PATCH /api/v1/projects/:id — update name/status, RBAC viewer denied", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj Patch" });
    const id = proj.body.id;
    const patched = await request(app).patch(`/api/v1/projects/${id}`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Renamed", status: "archived" });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Renamed");
    expect(patched.body.status).toBe("archived");

    const asViewer = await request(app).patch(`/api/v1/projects/${id}`).set("Authorization", `Bearer ${viewerToken}`).send({ name: "Viewer Try" });
    expect(asViewer.status).toBe(403);
  });

  it("PATCH /api/v1/projects/:id — validation: status must be active|archived", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj" });
    const res = await request(app).patch(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "bad" });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/v1/projects/:id — deletes, RBAC contributor denied", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj Del" });
    const contributorToken = await loginAs("contributor@org-a.com");
    const asContrib = await request(app).delete(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${contributorToken}`);
    expect(asContrib.status).toBe(403);
    const asAdmin = await request(app).delete(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(204);
    const after = await request(app).get(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(after.status).toBe(404);
  });

  it("POST /api/v1/projects/:id/members — add member, validation and RBAC", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "WS" });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Proj Members" });
    const id = proj.body.id;
    const added = await request(app).post(`/api/v1/projects/${id}/members`).set("Authorization", `Bearer ${adminToken}`).send({ userId: "33333333-3333-3333-3333-333333333333", role: "contributor" });
    expect(added.status).toBe(201);
    expect(added.body.projectId).toBe(id);
    expect(added.body.role).toBe("contributor");
    expect(added.body.orgId).toBe(ORG_A);

    // Missing fields → 400
    const bad = await request(app).post(`/api/v1/projects/${id}/members`).set("Authorization", `Bearer ${adminToken}`).send({ userId: "x" });
    expect(bad.status).toBe(400);

    // Viewer cannot add member
    const asViewer = await request(app).post(`/api/v1/projects/${id}/members`).set("Authorization", `Bearer ${viewerToken}`).send({ userId: "44444444-4444-4444-4444-444444444444", role: "viewer" });
    expect(asViewer.status).toBe(403);
  });

  it("Pagination — ?page & ?page_size respected", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: `WS ${i}` });
    }
    const p1 = await request(app).get("/api/v1/workspaces?page=1&page_size=2").set("Authorization", `Bearer ${adminToken}`);
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.total).toBe(5);
    expect(p1.body.page).toBe(1);
    expect(p1.body.page_size).toBe(2);
    const p2 = await request(app).get("/api/v1/workspaces?page=2&page_size=2").set("Authorization", `Bearer ${adminToken}`);
    expect(p2.body.data).toHaveLength(2);
    const p3 = await request(app).get("/api/v1/workspaces?page=3&page_size=2").set("Authorization", `Bearer ${adminToken}`);
    expect(p3.body.data).toHaveLength(1);
  });

  it("GET /api/v1/openapi.json — generates OpenAPI spec matching 04_API_SPEC.md", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(res.body.info.title).toMatch(/Business Transformation/);
    // Must contain all Workspaces & Projects paths from 04_API_SPEC.md
    const paths = Object.keys(res.body.paths);
    const required = [
      "/auth/login",
      "/auth/sso/callback",
      "/orgs/me",
      "/orgs/{orgId}/users",
      "/orgs/{orgId}/users/{userId}",
      "/workspaces",
      "/workspaces/{id}",
      "/workspaces/{id}/projects",
      "/projects/{id}",
      "/projects/{id}/members",
      "/openapi.json",
    ];
    for (const r of required) {
      expect(paths).toContain(r);
    }
    // Check securitySchemes and tenant isolation note
    expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
    expect(res.body.info.description).toMatch(/Tenant.*org_id.*JWT/);
  });

  it("OpenAPI spec file matches in-code spec (export invariant)", async () => {
    // In-code spec should be importable and equal to endpoint
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.body).toEqual(openApiSpec);
  });

  it("All mutation endpoints return the full updated resource per 04_API_SPEC.md conventions", async () => {
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: "Mut WS" });
    expect(ws.body).toHaveProperty("id");
    expect(ws.body).toHaveProperty("orgId");
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Mut Proj" });
    expect(proj.body).toHaveProperty("id");
    expect(proj.body).toHaveProperty("workspaceId");
    const patched = await request(app).patch(`/api/v1/projects/${proj.body.id}`).set("Authorization", `Bearer ${adminToken}`).send({ name: "Mut Proj 2" });
    expect(patched.body).toHaveProperty("id");
    expect(patched.body.name).toBe("Mut Proj 2");
  });
});
