import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-027 — Enterprise API integration framework (webhooks)
 * DoD: Configuring a webhook URL and approving an artifact triggers a POST to that URL with artifact payload
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: plain });
  return res.body.token;
}

describe("TASK-027: Webhook integration", () => {
  let token: string;
  let workspaceId: string;
  let projectId: string;
  let artifactId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login("org_admin@org-a.com");
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Webhook ${Date.now()}` });
    workspaceId = ws.body.id;
    const proj = await request(app).post(`/api/v1/workspaces/${workspaceId}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Webhook ${Date.now()}` });
    projectId = proj.body.id;
    const arch = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_hld" });
    artifactId = arch.body.artifactId;
  });

  it("POST /api/v1/workspaces/:id/webhooks — configure webhook", async () => {
    const res = await request(app).post(`/api/v1/workspaces/${workspaceId}/webhooks`).set("Authorization", `Bearer ${token}`).send({ url: "https://example.com/webhook", events: ["artifact.approved"] });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://example.com/webhook");
    expect(res.body.events).toContain("artifact.approved");
    const list = await request(app).get(`/api/v1/workspaces/${workspaceId}/webhooks`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it("Approving artifact triggers webhook delivery (DoD)", async () => {
    await request(app).post(`/api/v1/workspaces/${workspaceId}/webhooks`).set("Authorization", `Bearer ${token}`).send({ url: "https://example.com/hook", events: ["artifact.approved"] });
    // First, set artifact to in_review so it can be approved
    const versionRes = await request(app).patch(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${token}`).send({ status: "in_review", change_reason: "Review requested" });
    const newId = versionRes.body.id;
    const approve = await request(app).post(`/api/v1/artifacts/${newId}/approve`).set("Authorization", `Bearer ${token}`).send({ decision: "approved" });
    expect(approve.status).toBe(201);
    // Check deliveries
    const deliveries = await request(app).get("/api/v1/webhooks/deliveries").set("Authorization", `Bearer ${token}`);
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.data.length).toBeGreaterThanOrEqual(1);
    const d = deliveries.body.data.find((x: { event: string }) => x.event === "artifact.approved");
    expect(d).toBeDefined();
    expect(d.payload.artifactId).toBe(newId);
    expect(d.payload.projectId).toBe(projectId);
  });

  it("Tenant isolation: other org cannot configure webhook → 404", async () => {
    const tokenB = await login("org_admin@org-b.com");
    const res = await request(app).post(`/api/v1/workspaces/${workspaceId}/webhooks`).set("Authorization", `Bearer ${tokenB}`).send({ url: "https://evil.com", events: ["artifact.approved"] });
    expect(res.status).toBe(404);
  });
});
