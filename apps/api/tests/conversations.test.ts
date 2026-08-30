import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-009 — Conversation service
 * DoD: End-to-end test: create conversation → send message → AI reply persisted and returned
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearChunks } from "../src/services/documentParser";
import { clearStorage } from "../src/services/storage";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: plain });
  return res.body.token;
}
async function createProject(token: string): Promise<string> {
  const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Conv ${Date.now()}` });
  const wsId = ws.body.id;
  const proj = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Conv ${Date.now()}` });
  return proj.body.id;
}

describe("TASK-009: Conversation service", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login("org_admin@org-a.com");
    projectId = await createProject(token);
  });

  it("POST /api/v1/projects/:id/conversations — creates conversation", async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.orgId).toBeDefined();
  });

  it("GET /api/v1/conversations/:id — retrieves conversation", async () => {
    const created = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    const id = created.body.id;
    const fetched = await request(app).get(`/api/v1/conversations/${id}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(id);
    expect(fetched.body.messages).toBeDefined();
  });

  it("End-to-end: create → send message → AI reply persisted and returned (DoD)", async () => {
    const conv = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    const convId = conv.body.id;

    const send = await request(app).post(`/api/v1/conversations/${convId}/messages`).set("Authorization", `Bearer ${token}`).send({ content: "Our goal is to automate order processing and improve efficiency. Current challenge is manual payment validation. Process involves order capture, payment, invoice. Stakeholders are Sales and Finance." });
    expect(send.status).toBe(201);
    expect(send.body.userMessage).toBeDefined();
    expect(send.body.userMessage.role).toBe("user");
    expect(send.body.userMessage.content).toContain("automate");
    expect(send.body.aiMessage).toBeDefined();
    expect(send.body.aiMessage.role).toBe("ai");
    expect(send.body.aiMessage.content).toBeDefined();
    expect(send.body.aiResult).toBeDefined();

    // Verify persisted: GET messages returns both
    const msgs = await request(app).get(`/api/v1/conversations/${convId}/messages`).set("Authorization", `Bearer ${token}`);
    expect(msgs.status).toBe(200);
    expect(msgs.body.data).toHaveLength(2);
    expect(msgs.body.data[0].role).toBe("user");
    expect(msgs.body.data[1].role).toBe("ai");

    // Verify conversation includes messages
    const fetched = await request(app).get(`/api/v1/conversations/${convId}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.body.messages).toHaveLength(2);
  });

  it("Tenant isolation: other org cannot see conversation", async () => {
    const conv = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    const tokenB = await login("org_admin@org-b.com");
    const asB = await request(app).get(`/api/v1/conversations/${conv.body.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);
    const sendAsB = await request(app).post(`/api/v1/conversations/${conv.body.id}/messages`).set("Authorization", `Bearer ${tokenB}`).send({ content: "evil" });
    expect(sendAsB.status).toBe(404);
  });

  it("POST /conversations/:id/messages — validation: content required", async () => {
    const conv = await request(app).post(`/api/v1/projects/${projectId}/conversations`).set("Authorization", `Bearer ${token}`).send({});
    const res = await request(app).post(`/api/v1/conversations/${conv.body.id}/messages`).set("Authorization", `Bearer ${token}`).send({ content: "" });
    expect(res.status).toBe(400);
  });

  it("GET /conversations/:id — 404 for nonexistent", async () => {
    const res = await request(app).get("/api/v1/conversations/00000000-0000-0000-0000-000000000000").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("Requires auth: without token → 401", async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/conversations`).send({});
    expect(res.status).toBe(401);
  });
});
