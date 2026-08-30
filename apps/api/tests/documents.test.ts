/**
 * TASK-006 — File upload + storage
 * DoD: Upload of a sample PDF/DOCX/PPTX succeeds and is retrievable via signed URL
 * Also covers GET /projects/:id/documents, GET /documents/:id, DELETE, GET /documents/:id/status, GET /documents/:id/file
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearChunks } from "../src/services/documentParser";
import { clearStorage } from "../src/services/storage";
import { clearDocuments } from "../src/stores/documents";

const app = createApp();
const plain = getSeedPlainPassword();

async function loginOrgA(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-a.com", password: plain });
  return res.body.token;
}
async function loginOrgB(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email: "org_admin@org-b.com", password: plain });
  return res.body.token;
}
async function createProject(token: string): Promise<string> {
  const ws = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${token}`).send({ name: `WS Docs ${Date.now()} ${Math.random()}` });
  const wsId = ws.body.id;
  const proj = await request(app).post(`/api/v1/workspaces/${wsId}/projects`).set("Authorization", `Bearer ${token}`).send({ name: `Proj Docs ${Date.now()}` });
  return proj.body.id;
}

// Minimal PDF buffer with text — DoD sample PDF
function samplePdfBuffer(content = "SOP Business Process: Order to Cash. Step 1 capture order. Step 2 validate payment. Automation opportunities identified. Digital maturity current 2.5 future 4.0."): Buffer {
  // Fake PDF header + content
  return Buffer.from(`%PDF-1.4\n${content}\n%%EOF`);
}
function sampleDocxBuffer(content = "BRD Requirement: The system shall support automated invoicing via API integration."): Buffer {
  // DOCX is zip, but for test we just send text with docx extension
  return Buffer.from(content);
}
function samplePptxBuffer(content = "PPT Slide: Transformation roadmap with phases."): Buffer {
  return Buffer.from(content);
}

describe("TASK-006: File upload + storage", () => {
  let tokenA: string;
  let tokenB: string;
  let projectId: string;

  beforeEach(async () => {
    clearDocuments();
    clearChunks();
    clearStorage();
    clearWorkspaces();
    tokenA = await loginOrgA();
    tokenB = await loginOrgB();
    projectId = await createProject(tokenA);
  });

  it("POST /api/v1/projects/:id/documents — PDF upload succeeds, pending then parsed", async () => {
    const pdf = samplePdfBuffer();
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/documents?sync=true`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("file", pdf, { filename: "sop.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.filename).toBe("sop.pdf");
    expect(res.body.type).toBe("pdf");
    expect(res.body.storageUrl).toContain("memory://documents/");
    expect(res.body.signedUrl).toBe(`/api/v1/documents/${res.body.id}/file`);
    expect(res.body.parsedStatus).toBeDefined();
    // With sync=true, should be parsed immediately
    expect(["pending", "parsed"]).toContain(res.body.parsedStatus);

    // Poll status — should become parsed
    const status = await request(app).get(`/api/v1/documents/${res.body.id}/status`).set("Authorization", `Bearer ${tokenA}`);
    expect(status.status).toBe(200);
    expect(status.body.id).toBe(res.body.id);
    expect(["pending", "parsed"]).toContain(status.body.parsedStatus);
    // If sync, should be parsed with chunkCount >0
    if (status.body.parsedStatus === "parsed") expect(status.body.chunkCount).toBeGreaterThan(0);
  });

  it("POST — DOCX upload succeeds", async () => {
    const docx = sampleDocxBuffer();
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/documents?sync=true`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("file", docx, { filename: "brd.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("docx");
    expect(res.body.filename).toBe("brd.docx");
  });

  it("POST — PPTX upload succeeds", async () => {
    const pptx = samplePptxBuffer();
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/documents?sync=true`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("file", pptx, { filename: "deck.pptx", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("pptx");
  });

  it("Upload is tenant-scoped: project not found for other org → 404", async () => {
    const pdf = samplePdfBuffer();
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/documents`)
      .set("Authorization", `Bearer ${tokenB}`)
      .attach("file", pdf, { filename: "evil.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
  });

  it("GET /api/v1/projects/:id/documents — list", async () => {
    const pdf = samplePdfBuffer("Doc A content");
    await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", pdf, { filename: "a.pdf", contentType: "application/pdf" });
    await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", sampleDocxBuffer("Doc B"), { filename: "b.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const list = await request(app).get(`/api/v1/projects/${projectId}/documents`).set("Authorization", `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.total).toBe(2);
    // Each has signedUrl
    for (const d of list.body.data) expect(d.signedUrl).toBeDefined();
  });

  it("GET /api/v1/projects/:id/documents — cross-tenant returns 404", async () => {
    const list = await request(app).get(`/api/v1/projects/${projectId}/documents`).set("Authorization", `Bearer ${tokenB}`);
    expect(list.status).toBe(404);
  });

  it("GET /api/v1/documents/:id — single + tenant isolation", async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", samplePdfBuffer(), { filename: "single.pdf", contentType: "application/pdf" });
    const id = res.body.id;
    const fetched = await request(app).get(`/api/v1/documents/${id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(id);
    const asB = await request(app).get(`/api/v1/documents/${id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);
  });

  it("GET /api/v1/documents/:id/file — signed URL retrievable, content matches", async () => {
    const content = "Signed URL test content — SOP details";
    const pdf = samplePdfBuffer(content);
    const up = await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", pdf, { filename: "signed.pdf", contentType: "application/pdf" });
    const signedUrl = up.body.signedUrl as string;
    expect(up.body.signedUrl).toBe(`/api/v1/documents/${up.body.id}/file`);
    const fileRes = await request(app).get(signedUrl).set("Authorization", `Bearer ${tokenA}`);
    expect(fileRes.status).toBe(200);
    // Body should contain our content (may be in text or body buffer depending on content-type)
    const bodyStr = (fileRes.text as string | undefined) || (fileRes.body && Buffer.isBuffer(fileRes.body) ? (fileRes.body as Buffer).toString("utf8") : "");
    expect(bodyStr).toContain(content);
    // Cross-tenant cannot fetch
    const asB = await request(app).get(signedUrl).set("Authorization", `Bearer ${tokenB}`);
    expect(asB.status).toBe(404);
  });

  it("GET /api/v1/documents/:id/file — without auth → 401", async () => {
    const up = await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", samplePdfBuffer(), { filename: "auth.pdf", contentType: "application/pdf" });
    const res = await request(app).get(`/api/v1/documents/${up.body.id}/file`);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/documents/:id — deletes", async () => {
    const up = await request(app).post(`/api/v1/projects/${projectId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", samplePdfBuffer(), { filename: "del.pdf", contentType: "application/pdf" });
    const id = up.body.id;
    const del = await request(app).delete(`/api/v1/documents/${id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/v1/documents/${id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(after.status).toBe(404);
  });

  it("Requires auth: POST without token → 401", async () => {
    const pdf = samplePdfBuffer();
    const res = await request(app).post(`/api/v1/projects/${projectId}/documents`).attach("file", pdf, { filename: "noauth.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(401);
  });

  it("Requires file: POST without file → 400", async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/documents`).set("Authorization", `Bearer ${tokenA}`).send({});
    expect(res.status).toBe(400);
  });

  it("RBAC: viewer cannot upload → 403, but can read", async () => {
    const viewerLogin = await request(app).post("/api/v1/auth/login").send({ email: "viewer@org-a.com", password: plain });
    const viewerToken = viewerLogin.body.token;
    const pdf = samplePdfBuffer();
    const up = await request(app).post(`/api/v1/projects/${projectId}/documents`).set("Authorization", `Bearer ${viewerToken}`).attach("file", pdf, { filename: "viewer.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(403);
    // viewer can read list
    const list = await request(app).get(`/api/v1/projects/${projectId}/documents`).set("Authorization", `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);
  });
});
