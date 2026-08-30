import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-014 — Solution Architecture Builder agent
 * DoD: Given fixture input, returns valid content schema; diagram_spec renders without error in TASK-018
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { validateArchitectureContent } from "../src/services/architectureAgent";
import { renderToSvg, isValidSvg } from "../src/services/diagramRenderer";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}

describe("TASK-014: Architecture Builder", () => {
  let token: string;
  let projectId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Arch ${Date.now()}` });
    const wsId = ws.body.id;
    const proj = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Arch ${Date.now()}` });
    projectId = proj.body.id;
  });

  it("POST /api/v1/ai/v1/architecture/generate — HLD returns valid content schema", async () => {
    const res = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_hld", params: { cloud_preference: "azure", compliance: ["iso27001"] } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("architecture_hld");
    expect(res.body.status).toBe("draft");
    expect(res.body.content.components).toContain("API Gateway");
    expect(res.body.content.diagramSpec).toBeDefined();
    const validation = validateArchitectureContent(res.body.content);
    expect(validation.valid).toBe(true);

    // diagram_spec renders without error in TASK-018
    const svg = renderToSvg(res.body.content.diagramSpec);
    expect(isValidSvg(svg)).toBe(true);
    expect(svg).toContain("<svg");
    const stored = (await getRepositories().artifacts.findById("00000000-0000-0000-0000-0000000000aa", res.body.artifactId));
    expect(stored).toBeDefined();
    expect(stored!.status).toBe("draft");
  });

  it("Generates LLD as well", async () => {
    const res = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_lld" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("architecture_lld");
    expect(res.body.content.lldSections).toBeDefined();
  });

  it("Tenant isolation: other org cannot generate for this project → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${tokenB}`).send({ projectId, type: "architecture_hld" });
    expect(res.status).toBe(404);
  });

  it("Requires auth → 401", async () => {
    const res = await request(app).post("/api/v1/ai/v1/architecture/generate").send({ projectId, type: "architecture_hld" });
    expect(res.status).toBe(401);
  });
});
