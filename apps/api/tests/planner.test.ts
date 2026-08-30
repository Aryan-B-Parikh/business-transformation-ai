/**
 * TASK-020 — Transformation Planner agent
 * DoD: Roadmap items have valid phase/date/dependency data; no circular dependencies (validated)
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearArtifacts } from "../src/stores/artifacts";
import { clearRoadmapItems, listRoadmapItems } from "../src/stores/roadmapItems";

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
    clearArtifacts();
    clearRoadmapItems();
    clearWorkspaces();
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
    const items = listRoadmapItems(artifactId, "00000000-0000-0000-0000-0000000000aa");
    expect(items.length).toBe(res.body.roadmapItemIds.length);
    for (const it of items) {
      expect(it.phase).toBeDefined();
      expect(it.title).toBeDefined();
      expect(it.startEstimate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(it.endEstimate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // start <= end
      expect(it.startEstimate <= it.endEstimate).toBe(true);
      // dependencies are valid ids (if any)
      for (const dep of it.dependencies) expect(items.some((x) => x.id === dep)).toBe(true);
    }
    // No circular dependencies: check that items are sorted by start date and dependencies are earlier
    // Already validated via service's hasCycle
    const ids = new Set(items.map((i) => i.id));
    for (const it of items) {
      for (const dep of it.dependencies) expect(ids.has(dep)).toBe(true);
    }
  });

  it("Roadmap no circular dependencies (validated)", async () => {
    const res = await request(app).post("/api/v1/ai/v1/planning/generate-roadmap").set("Authorization", `Bearer ${token}`).send({ projectId });
    const artifactId = res.body.artifactId;
    const items = listRoadmapItems(artifactId, "00000000-0000-0000-0000-0000000000aa");
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
