/**
 * TASK-017 — AI UX Designer agent
 * DoD: Output renders as low-fidelity wireframe images via TASK-018
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { isValidSvg, renderToSvg } from "../src/services/diagramRenderer";
import { validateUx } from "../src/services/uxAgent";
import { clearArtifacts } from "../src/stores/artifacts";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-017: AI UX Designer", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    clearArtifacts();
    clearWorkspaces();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS UX ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj UX ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/ux/generate-wireframes — returns wireframe artifact", async () => {
    const res = await request(app).post("/api/v1/ai/v1/ux/generate-wireframes").set("Authorization", `Bearer ${token}`).send({ projectId, params: { appType: "Dashboard" } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("wireframe");
    expect(res.body.content.screens.length).toBeGreaterThan(0);
    expect(res.body.content.navigationFlow.length).toBeGreaterThan(0);
    const validation = validateUx(res.body.content);
    expect(validation.valid).toBe(true);
    // Renders via TASK-018
    const svg = renderToSvg(res.body.content.diagramSpec);
    expect(isValidSvg(svg)).toBe(true);
  });

  it("Wireframe screens have components", async () => {
    const res = await request(app).post("/api/v1/ai/v1/ux/generate-wireframes").set("Authorization", `Bearer ${token}`).send({ projectId });
    for (const s of res.body.content.screens as { id: string; components: unknown[] }[]) {
      expect(Array.isArray(s.components)).toBe(true);
      expect(s.components.length).toBeGreaterThan(0);
    }
  });
});
