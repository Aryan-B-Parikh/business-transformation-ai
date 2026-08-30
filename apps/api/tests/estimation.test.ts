import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-021 — AI Planning Engine (estimation)
 * DoD: Given fixture scope, produces non-zero estimates with risk classification for each item
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-021: Estimation Engine", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Est ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Est ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/planning/estimate — produces non-zero estimates with risk levels", async () => {
    const res = await request(app).post("/api/v1/ai/v1/planning/estimate").set("Authorization", `Bearer ${token}`).send({ projectId, scope: ["API Gateway", "Migration", "Dashboard"] });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("effort_estimate");
    expect(res.body.content.items.length).toBe(3);
    for (const it of res.body.content.items as { name: string; effortHours: number; costEstimate: number; riskLevel: string }[]) {
      expect(it.effortHours).toBeGreaterThan(0);
      expect(it.costEstimate).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(it.riskLevel);
    }
    expect(res.body.content.totalEffort).toBeGreaterThan(0);
    expect(res.body.content.totalCost).toBeGreaterThan(0);
    expect(res.body.validation.valid).toBe(true);
    
  });

  it("Generates estimates even with default scope (no scope provided)", async () => {
    const res = await request(app).post("/api/v1/ai/v1/planning/estimate").set("Authorization", `Bearer ${token}`).send({ projectId });
    expect(res.status).toBe(201);
    expect(res.body.content.items.length).toBeGreaterThan(0);
  });

  it("Tenant isolation: other org cannot estimate for this project → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).post("/api/v1/ai/v1/planning/estimate").set("Authorization", `Bearer ${tokenB}`).send({ projectId, scope: ["Test"] });
    expect(res.status).toBe(404);
  });
});
