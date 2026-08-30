/**
 * TASK-028 — Admin dashboard (users/orgs/AI models/audit/usage)
 * DoD: Admin can view audit logs filtered by actor/date, toggle an AI model config, and see usage metrics
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword, ORG_A } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearAiModelConfigs } from "../src/stores/aiModelConfigs";
import { clearArtifacts } from "../src/stores/artifacts";
import { clearAuditLogs } from "../src/stores/auditLogs";

const app = createApp();
const plain = getSeedPlainPassword();

async function loginAsOrgAdmin(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}
async function loginAsViewer(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "viewer@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-028: Admin dashboard", () => {
  let adminToken: string;
  let projectId: string;

  beforeEach(async () => {
    clearArtifacts();
    clearAuditLogs();
    clearAiModelConfigs();
    clearWorkspaces();
    adminToken = await loginAsOrgAdmin();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${adminToken}`).send({ name: `WS Admin ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${adminToken}`).send({ name: `Proj Admin ${Date.now()}` });
    projectId = proj.body.id;
    // Generate an artifact to create some usage
    await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${adminToken}`).send({ projectId, type: "architecture_hld" });
  });

  it("GET /api/v1/admin/orgs/:orgId/usage — shows metrics", async () => {
    const res = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/usage`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(ORG_A);
    expect(typeof res.body.workspaces).toBe("number");
    expect(typeof res.body.projects).toBe("number");
    expect(typeof res.body.artifacts).toBe("number");
  });

  it("GET /api/v1/admin/orgs/:orgId/audit-logs — filtered by actor/action/date", async () => {
    // Create an audit log via comment and approval
    const art = (await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${adminToken}`).send({ projectId, type: "architecture_hld" })).body.artifactId;
    await request(app).post(`/api/v1/artifacts/${art}/comments`).set("Authorization", `Bearer ${adminToken}`).send({ content: "admin comment" });
    const all = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/audit-logs`).set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThan(0);
    const filtered = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/audit-logs?action=artifact.comment`).set("Authorization", `Bearer ${adminToken}`);
    expect(filtered.body.data.every((l: { action: string }) => l.action === "artifact.comment")).toBe(true);
    const byActor = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/audit-logs?actor=11111111-1111-1111-1111-111111111111`).set("Authorization", `Bearer ${adminToken}`);
    expect(byActor.status).toBe(200);
  });

  it("GET /api/v1/admin/orgs/:orgId/ai-models — list and PATCH toggle", async () => {
    const list = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/ai-models`).set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const first = list.body.data[0] as { module: string; enabled: boolean };
    const patch = await request(app).patch(`/api/v1/admin/orgs/${ORG_A}/ai-models/${first.module}`).set("Authorization", `Bearer ${adminToken}`).send({ enabled: !first.enabled });
    expect(patch.status).toBe(200);
    expect(patch.body.enabled).toBe(!first.enabled);
    // Toggle back
    const back = await request(app).patch(`/api/v1/admin/orgs/${ORG_A}/ai-models/${first.module}`).set("Authorization", `Bearer ${adminToken}`).send({ enabled: first.enabled });
    expect(back.body.enabled).toBe(first.enabled);
  });

  it("GET /api/v1/admin/system/health — health check", async () => {
    const res = await request(app).get("/api/v1/admin/system/health").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.db).toBe("ok");
  });

  it("RBAC: viewer cannot access admin usage → 403", async () => {
    const viewerToken = await loginAsViewer();
    const res = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/usage`).set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it("Tenant isolation: admin of org B cannot access org A usage → 403", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).get(`/api/v1/admin/orgs/${ORG_A}/usage`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });
});
