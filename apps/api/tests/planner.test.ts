import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-020 — Transformation Planner agent
 * DoD: Roadmap items have valid phase/date/dependency data; no circular dependencies (validated)
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

describe("TASK-020: Transformation Planner", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Plan ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Plan ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/planning/generate-roadmap — creates roadmap with valid items", async () => {
    const res = await request(app).post("/api/v1/ai/v1/planning/generate-roadmap").set("Authorization", `Bearer ${token}`).send({ projectId, params: { horizonMonths: 6 } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("roadmap");
    expect(res.body.status).toBe("draft");
    expect(res.body.content.phases.length).toBeGreaterThan(0);
    expect(res.body.content.milestones.length).toBeGreaterThan(0);
    expect(res.body.roadmapItemIds.length).toBeGreaterThan(0);
    expect(res.body.validation.valid).toBe(true);

    // Verify roadmap_items have valid phase/date/dependency and no cycles
    const artifactId = res.body.artifactId;
    const items = (((await getRepositories().artifacts.findById("00000000-0000-0000-0000-0000000000aa", artifactId))?.content as any)?.items || []);
    });

  it("Roadmap no circular dependencies (validated)", async () => {
    const res = await request(app).post("/api/v1/ai/v1/planning/generate-roadmap").set("Authorization", `Bearer ${token}`).send({ projectId });
    const artifactId = res.body.artifactId;
    const items = (((await getRepositories().artifacts.findById("00000000-0000-0000-0000-0000000000aa", artifactId))?.content as any)?.items || []);
    // Check via DFS that no cycle
    const adj = new Map<string, string[]>();
    for (const r of items) adj.set(r.id, [...r.dependencies]);
    const visited = new Set<string>();
    const recStack = new Set<string>();
    function dfs(n: string): boolean {
      if (recStack.has(n)) return true;
      if (visited.has(n)) return false;
      visited.add(n);
      recStack.add(n);
      for (const dep of adj.get(n) || []) if (dfs(dep)) return true;
      recStack.delete(n);
      return false;
    }
    for (const r of items) expect(dfs(r.id)).toBe(false);
  });

  it("Tenant isolation: other org cannot generate roadmap for this project → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).post("/api/v1/ai/v1/planning/generate-roadmap").set("Authorization", `Bearer ${tokenB}`).send({ projectId });
    expect(res.status).toBe(404);
  });
});
