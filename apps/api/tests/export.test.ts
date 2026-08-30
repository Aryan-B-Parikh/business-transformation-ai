import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-025 — Export service (PDF/DOCX/XLSX/PPTX)
 * DoD: Each format produces a file that opens without corruption and contains artifact's key sections
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

describe("TASK-025: Export service", () => {
  let token: string;
  let projectId: string;
  let artifactId: string;

  beforeEach(async () => {
    resetRepositoriesForTests();
    token = await login();
    const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Export ${Date.now()}` });
    const proj = await request(app).post(`/api/v1/workspaces/${ws.body.id}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Export ${Date.now()}` });
    projectId = proj.body.id;
    const arch = await request(app).post("/api/v1/ai/v1/architecture/generate").set("Authorization", `Bearer ${token}`).send({ projectId, type: "architecture_hld" });
    artifactId = arch.body.artifactId;
  });

  for (const fmt of ["pdf", "docx", "xlsx", "pptx"] as const) {
    it(`POST /api/v1/artifacts/:id/export — ${fmt} produces downloadable file`, async () => {
      const res = await request(app).post(`/api/v1/artifacts/${artifactId}/export`).set("Authorization", `Bearer ${token}`).send({ format: fmt });
      expect(res.status).toBe(201);
      expect(res.body.downloadUrl).toBeDefined();
      expect(res.body.format).toBe(fmt);
      const download = await request(app).get(res.body.downloadUrl).set("Authorization", `Bearer ${token}`);
      expect(download.status).toBe(200);
      expect(download.headers["content-type"]).toBeDefined();
      const body = download.body as Buffer;
      expect(Buffer.isBuffer(body) || typeof download.text === "string").toBe(true);
      const len = Buffer.isBuffer(body) ? body.length : download.text.length;
      expect(len).toBeGreaterThan(500);
    });
  }

  it("POST /api/v1/projects/:id/export-bundle — combined export", async () => {
    // Create second artifact
    const arch2 = await request(app).post("/api/v1/ai/v1/process/generate-workflow").set("Authorization", `Bearer ${token}`).send({ projectId });
    const id2 = arch2.body.artifactId;
    const res = await request(app).post(`/api/v1/projects/${projectId}/export-bundle`).set("Authorization", `Bearer ${token}`).send({ artifact_ids: [artifactId, id2], format: "pdf" });
    expect(res.status).toBe(201);
    expect(res.body.downloadUrl).toBeDefined();
    const dl = await request(app).get(res.body.downloadUrl).set("Authorization", `Bearer ${token}`);
    expect(dl.status).toBe(200);
    const body = dl.body as Buffer;
    const len = Buffer.isBuffer(body) ? body.length : dl.text.length;
    expect(len).toBeGreaterThan(1000);
  });

  it("Invalid format → 400", async () => {
    const res = await request(app).post(`/api/v1/artifacts/${artifactId}/export`).set("Authorization", `Bearer ${token}`).send({ format: "bad" });
    expect(res.status).toBe(400);
  });

  it("Tenant isolation: other org cannot export → 404", async () => {
    const tokenB = (await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain })).body.token;
    const res = await request(app).post(`/api/v1/artifacts/${artifactId}/export`).set("Authorization", `Bearer ${tokenB}`).send({ format: "pdf" });
    expect(res.status).toBe(404);
  });
});
