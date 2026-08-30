import { getRepositories, resetRepositoriesForTests } from "../src/repositories";
/**
 * TASK-008 — RAG retrieval service
 * DoD: Unit test with seeded chunks returns expected top-k ordering; cross-tenant leakage test proves isolation
 */

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { getSeedPlainPassword } from "../src/auth/users";
import { clearStores as clearWorkspaces } from "../src/routes/workspaces";
import { clearChunks, processDocument } from "../src/services/documentParser";
import { retrieveRag } from "../src/services/rag";
import { clearStorage } from "../src/services/storage";

const app = createApp();
const plain = getSeedPlainPassword();

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: plain });
  return res.body.token;
}

describe("TASK-008: RAG retrieval service — unit", () => {
  const orgA = "00000000-0000-0000-0000-0000000000aa";
  const orgB = "00000000-0000-0000-0000-0000000000bb";
  const projA = "proj-rag-a";
  const projB = "proj-rag-b";

  beforeEach(() => {
    resetRepositoriesForTests();
    });

  it("retrieveRag — returns top-k ordered by cosine similarity", async () => {
    // Seed project A with 3 docs, each with distinct content
    const doc1 = await getRepositories().documents.createDocument(orgA, projA, { filename: "doc1.pdf", docType: "pdf", fileSize: 100, storageKey: "m://1" });
    const doc2 = await getRepositories().documents.createDocument(orgA, projA, { filename: "doc2.pdf", docType: "pdf", fileSize: 100, storageKey: "m://2" });
    const doc3 = await getRepositories().documents.createDocument(orgA, projA, { filename: "doc3.pdf", docType: "pdf", fileSize: 100, storageKey: "m://3" });

    await processDocument({ documentId: doc1.id, orgId: orgA, buffer: Buffer.from("digital transformation and AI adoption roadmap for cloud migration"), filename: "doc1.pdf" });
    await processDocument({ documentId: doc2.id, orgId: orgA, buffer: Buffer.from("cooking recipes and kitchen automation not related to business"), filename: "doc2.pdf" });
    await processDocument({ documentId: doc3.id, orgId: orgA, buffer: Buffer.from("business process automation with RPA and BPMN workflows"), filename: "doc3.pdf" });

    const docIds = new Set((await getRepositories().documents.listDocumentsByProject(orgA, projA)).map((d: any) => d.id));
    // Query about cloud migration — should rank doc1 highest
    const results = retrieveRag({ projectId: projA, orgId: orgA, query: "cloud migration AI roadmap", k: 3, docIdsForProject: docIds });
    expect(results).toHaveLength(3);
    // Top result should be doc1 (contains cloud migration)
    expect(results[0]!.documentId).toBe(doc1.id);
    // Scores descending
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
    // Each result has required fields
    for (const r of results) {
      expect(r.id).toBeDefined();
      expect(r.chunkText.length).toBeGreaterThan(0);
      expect(typeof r.score).toBe("number");
      expect(r.orgId).toBe(orgA);
    }

    // Query about BPMN workflows — should rank doc3 highest
    const results2 = retrieveRag({ projectId: projA, orgId: orgA, query: "BPMN workflows RPA automation", k: 2, docIdsForProject: docIds });
    expect(results2[0]!.documentId).toBe(doc3.id);
  });

  it("retrieveRag — respects k limit", async () => {
    const doc = await getRepositories().documents.createDocument(orgA, projA, { filename: "doc.pdf", docType: "pdf", fileSize: 100, storageKey: "m://x" });
    await processDocument({ documentId: doc.id, orgId: orgA, buffer: Buffer.from("word ".repeat(1000)), filename: "doc.pdf" });
    const docIds = new Set((await getRepositories().documents.listDocumentsByProject(orgA, projA)).map((d: any) => d.id));
    const r1 = retrieveRag({ projectId: projA, orgId: orgA, query: "word", k: 1, docIdsForProject: docIds });
    const r2 = retrieveRag({ projectId: projA, orgId: orgA, query: "word", k: 2, docIdsForProject: docIds });
    expect(r1).toHaveLength(1);
    expect(r2.length).toBeGreaterThanOrEqual(1);
    expect(r2.length).toBeLessThanOrEqual(2);
  });

  it("Cross-tenant leakage test — query as orgA must not see orgB chunks (TASK-002+ isolation requirement)", async () => {
    const docA = await getRepositories().documents.createDocument(orgA, projA, { filename: "a.pdf", docType: "pdf", fileSize: 100, storageKey: "m://a" });
    const docB = await getRepositories().documents.createDocument(orgB, projB, { filename: "b.pdf", docType: "pdf", fileSize: 100, storageKey: "m://b" });
    await processDocument({ documentId: docA.id, orgId: orgA, buffer: Buffer.from("org A secret content about transformation"), filename: "a.pdf" });
    await processDocument({ documentId: docB.id, orgId: orgB, buffer: Buffer.from("org B secret content about transformation"), filename: "b.pdf" });

    const docIdsA = new Set((await getRepositories().documents.listDocumentsByProject(orgA, projA)).map((d: any) => d.id));
    const docIdsB = new Set((await getRepositories().documents.listDocumentsByProject(orgA, projB)).map((d: any) => d.id));

    const asA = retrieveRag({ projectId: projA, orgId: orgA, query: "secret transformation", k: 5, docIdsForProject: docIdsA });
    const asB = retrieveRag({ projectId: projB, orgId: orgB, query: "secret transformation", k: 5, docIdsForProject: docIdsB });

    // Each result set should only contain its own org
    expect(asA.every((r) => r.orgId === orgA)).toBe(true);
    expect(asB.every((r) => r.orgId === orgB)).toBe(true);
    expect(asA.find((r) => r.orgId === orgB)).toBeUndefined();
    expect(asB.find((r) => r.orgId === orgA)).toBeUndefined();

    // Without correct orgId, wrong docIds set yields zero (simulates RLS)
    const wrong = retrieveRag({ projectId: projA, orgId: orgA, query: "secret", k: 5, docIdsForProject: docIdsB });
    expect(wrong).toEqual([]);
  });

  it("retrieveRag — empty project returns []", () => {
    const empty = retrieveRag({ projectId: "nonexist", orgId: orgA, query: "anything", k: 5, docIdsForProject: new Set() });
    expect(empty).toEqual([]);
  });

  it("retrieveRag — via API endpoint POST /projects/:id/rag/search, tenant-scoped", async () => {
    const tokenA = await login("org_admin@org-a.com");
    const tokenB = await login("org_admin@org-b.com");

    // Create workspaces/projects via API so docIds are registered correctly
    const wsA = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${tokenA}`).send({ name: `WS RAG A ${Date.now()}` });
    const projAId = (await request(app).post(`/api/v1/workspaces/${wsA.body.id}/projects`).set("Authorization", `Bearer ${tokenA}`).send({ name: "Proj Rag A" })).body.id;
    const wsB = await request(app).post("/api/v1/workspaces").set("Authorization", `Bearer ${tokenB}`).send({ name: `WS RAG B ${Date.now()}` });
    const projBId = (await request(app).post(`/api/v1/workspaces/${wsB.body.id}/projects`).set("Authorization", `Bearer ${tokenB}`).send({ name: "Proj Rag B" })).body.id;

    // Upload docs with distinct content, sync parsing
    await request(app).post(`/api/v1/projects/${projAId}/documents?sync=true`).set("Authorization", `Bearer ${tokenA}`).attach("file", Buffer.from("AI transformation cloud migration roadmap"), { filename: "a.pdf", contentType: "application/pdf" });
    await request(app).post(`/api/v1/projects/${projBId}/documents?sync=true`).set("Authorization", `Bearer ${tokenB}`).attach("file", Buffer.from("cooking pasta recipes unrelated"), { filename: "b.pdf", contentType: "application/pdf" });

    // Search as orgA — should get cloud migration, not pasta
    const searchA = await request(app).post(`/api/v1/projects/${projAId}/rag/search`).set("Authorization", `Bearer ${tokenA}`).send({ query: "cloud migration", k: 5 });
    expect(searchA.status).toBe(200);
    expect(searchA.body.results.length).toBeGreaterThan(0);
    expect(searchA.body.results[0].chunkText.toLowerCase()).toContain("cloud");

    // Cross-tenant: orgA trying to search projB should get 404
    const cross = await request(app).post(`/api/v1/projects/${projBId}/rag/search`).set("Authorization", `Bearer ${tokenA}`).send({ query: "cloud" });
    expect(cross.status).toBe(404);

    // Missing query → 400
    const bad = await request(app).post(`/api/v1/projects/${projAId}/rag/search`).set("Authorization", `Bearer ${tokenA}`).send({ query: "" });
    expect(bad.status).toBe(400);
  });
});
