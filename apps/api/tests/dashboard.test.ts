/**
 * TASK-022 — Dashboard API + UI
 * DoD: Dashboard renders scores for a seeded project; history endpoint returns time series
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearArtifacts } from "../src/stores/artifacts";
import { clearEffortEstimates } from "../src/stores/effortEstimates";
import { clearMaturitySnapshots } from "../src/stores/maturitySnapshots";
import { clearRoadmapItems } from "../src/stores/roadmapItems";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-022: Dashboard API", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    clearArtifacts();
    clearRoadmapItems();
    clearEffortEstimates();
    clearMaturitySnapshots();
    clearWorkspaces();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Dash ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Dash ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("GET /api/v1/projects/:id/dashboard — returns maturity/readiness/health scores", async () => {
    const res = await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.scores).toBeDefined();
    expect(typeof res.body.scores.digitalMaturity).toBe("number");
    expect(typeof res.body.scores.aiReadiness).toBe("number");
    expect(typeof res.body.scores.automationOpportunity).toBe("number");
    expect(typeof res.body.scores.projectHealth).toBe("number");
    expect(typeof res.body.scores.implementationReadiness).toBe("number");
    expect(typeof res.body.scores.solutionQuality).toBe("number");
    // Scores 1-5
    for (const v of Object.values(res.body.scores) as number[]) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(res.body.counts).toBeDefined();
  });

  it("Dashboard scores improve after generating artifacts", async () => {
    const before = await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${token}`);
    const beforeQuality = before.body.scores.solutionQuality as number;
    // Generate business analysis
    await request(app).post("/api/v1/ai/v1/business-analysis/generate").set("Authorization", `Bearer ${token}`).send({ projectId });
    await request(app).post("/api/v1/ai/v1/planning/generate-roadmap").set("Authorization", `Bearer ${token}`).send({ projectId });
    const after = await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${token}`);
    expect(after.body.scores.solutionQuality).toBeGreaterThanOrEqual(beforeQuality);
    expect(after.body.counts.artifacts).toBeGreaterThan(before.body.counts.artifacts);
  });

  it("GET /api/v1/projects/:id/dashboard/history — returns time series", async () => {
    await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${token}`);
    await new Promise((r) => setTimeout(r, 10));
    await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${token}`);
    const hist = await request(app).get(`/api/v1/projects/${projectId}/dashboard/history`).set("Authorization", `Bearer ${token}`);
    expect(hist.status).toBe(200);
    expect(hist.body.data.length).toBeGreaterThanOrEqual(2);
    expect(hist.body.total).toBe(hist.body.data.length);
    // Each entry has capturedAt and scores
    for (const s of hist.body.data as { digitalMaturityScore: number; capturedAt: string }[]) {
      expect(typeof s.digitalMaturityScore).toBe("number");
      expect(s.capturedAt).toBeDefined();
    }
    // Sorted by capturedAt
    const dates = (hist.body.data as { capturedAt: string }[]).map((d) => d.capturedAt);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("Tenant isolation: other org cannot view dashboard → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).get(`/api/v1/projects/${projectId}/dashboard`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("Requires auth → 401", async () => {
    const res = await request(app).get(`/api/v1/projects/${projectId}/dashboard`);
    expect(res.status).toBe(401);
  });
});
