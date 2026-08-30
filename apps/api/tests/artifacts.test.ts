import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-019 — Web UI Artifact viewer/editor
 * DoD: User can view an architecture artifact, edit a text field, save, and see version increment
 * Also covers TASK-024 version history and Epic 3 integration (artifacts via TASK-014 etc. render via TASK-018)
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

describe("TASK-019: Artifact viewer/editor + versioning", () => {
  let token: string;
  let projectId: string;
  let artifactId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Art ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Art ${Date.now()}` });
    projectId = proj.body.id;
    const arch = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_hld" });
    artifactId = arch.body.artifactId;
  });

  it("GET /api/v1/artifacts/:id — view architecture artifact", async () => {
    const res = await request(app).get(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(artifactId);
    expect(res.body.type).toBe("architecture_hld");
    expect(res.body.title).toBeDefined();
    expect(res.body.content).toBeDefined();
    expect(res.body.content.diagramSpec).toBeDefined();
    expect(res.body.version).toBe(1);
  });

  it("GET /api/v1/projects/:id/artifacts — list artifacts", async () => {
    const list = await request(app).get(`/api/v1/projects/${projectId}/artifacts`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data[0].id).toBe(artifactId);
  });

  it("PATCH /api/v1/artifacts/:id — edit a text field, save, version increment (DoD)", async () => {
    const before = await request(app).get(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${token}`);
    expect(before.body.version).toBe(1);
    const patched = await request(app).patch(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${token}`).send({ title: "Edited Architecture Title" });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Edited Architecture Title");
    expect(patched.body.version).toBe(2);
    expect(patched.body.parent_id).toBe(artifactId);

    // Fetch versions
    const versions = await request(app).get(`/api/v1/artifacts/${artifactId}/versions`).set("Authorization", `Bearer ${token}`);
    expect(versions.status).toBe(200);
    expect(versions.body.data.length).toBe(2);
    expect(versions.body.data[0].version).toBe(1);
    expect(versions.body.data[1].version).toBe(2);
    expect(versions.body.data[1].title).toBe("Edited Architecture Title");
  });

  it("POST /api/v1/artifacts/:id/regenerate — creates new version with feedback", async () => {
    const regen = await request(app).post(`/api/v1/artifacts/${artifactId}/regenerate`).set("Authorization", `Bearer ${token}`).send({ feedback: "Use Azure instead of AWS" });
    expect(regen.status).toBe(201);
    expect(regen.body.version).toBe(2);
    expect((regen.body.content as { feedback: string }).feedback).toBe("Use Azure instead of AWS");
  });

  it("Regenerating 3x produces 3-version chain retrievable in order (TASK-024 DoD)", async () => {
    const v2 = await request(app).post(`/api/v1/artifacts/${artifactId}/regenerate`).set("Authorization", `Bearer ${token}`).send({ feedback: "v2" });
    const v3 = await request(app).post(`/api/v1/artifacts/${v2.body.id}/regenerate`).set("Authorization", `Bearer ${token}`).send({ feedback: "v3" });
    expect(v3.body.version).toBe(3);
    const versions = await request(app).get(`/api/v1/artifacts/${artifactId}/versions`).set("Authorization", `Bearer ${token}`);
    expect(versions.body.data.length).toBe(3);
    expect(versions.body.data.map((v: { version: number }) => v.version)).toEqual([1, 2, 3]);
  });

  it("POST /api/v1/projects/:id/artifacts/generate — unified generate for any type", async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/artifacts/generate`).set("Authorization", `Bearer ${token}`).send({ type: "wireframe", params: { appType: "Dashboard" } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("wireframe");
    expect(res.body.content.screens).toBeDefined();
  });

  it("Tenant isolation: other org cannot view artifact → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const asB = await request(app).get(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);
  });

  it("Artifacts are never auto-approved (advisory-only)", async () => {
    const res = await request(app).get(`/api/v1/artifacts/${artifactId}`).set("Authorization", `Bearer ${token}`);
    expect(res.body.status).not.toBe("approved");
    expect(res.body.status).toBe("draft");
  });
});
