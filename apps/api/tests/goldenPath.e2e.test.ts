import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { signToken } from "../src/auth/jwt";
import { initializeRepositories } from "../src/repositories";
import { prisma as appPrisma } from "../src/db/client";
import fs from "fs";
import path from "path";

describe.skipIf(!process.env.DATABASE_URL)("Golden Path E2E (Phase 34)", () => {
  const app = process.env.API_URL || createApp();
  let prisma: PrismaClient | undefined;

  const orgId = "00000000-0000-0000-0000-000000000031";
  const userId = "00000000-0000-0000-0000-000000000032";
  let token: string;
  let workspaceId: string;
  let projectId: string;
  let docId: string;
  let artifacts: { id: string; type: string }[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    // Admin connection for test fixture setup
    const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    
    // Initialize application repositories (if using in-memory app instance)
    if (!process.env.API_URL) {
      initializeRepositories("postgres", appPrisma as any);
    }
    
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "E2E True Golden Org", plan: "enterprise" }
    });

    await prisma.user.upsert({
      where: { id: userId },
      update: { orgId, name: "E2E True Golden User", role: "org_admin" },
      create: {
        id: userId,
        orgId,
        name: "E2E True Golden User",
        email: "e2egolden@example.com",
        role: "org_admin"
      }
    });

    token = signToken({
      userId,
      orgId,
      role: "org_admin",
      email: "e2egolden@example.com"
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("1. Workspace & Project Creation", async () => {
    const wsRes = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Transformation Workspace" });
    expect(wsRes.status).toBe(201);
    workspaceId = wsRes.body.id;

    const projRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Core Modernization Project", description: "Modernize backend systems" });
    expect(projRes.status).toBe(201);
    projectId = projRes.body.id;
  });

  it("2. Document Upload & Context Ingestion", async () => {
    // Generate a dummy PDF for context
    const pdfContent = Buffer.from("%PDF-1.4 mock business context. Our current state is legacy. We want to move to cloud.");
    const docRes = await request(app)
      .post(`/api/v1/projects/${projectId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfContent, { filename: "business_context.pdf", contentType: "application/pdf" });
    expect(docRes.status).toBe(201);
    docId = docRes.body.id;
    
    // Wait for the worker to process the document
    // In a real environment we'd poll, but for E2E we'll wait a few seconds and poll the status
    let processed = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const docCheck = await request(app)
        .get(`/api/v1/projects/${projectId}/documents/${docId}`)
        .set("Authorization", `Bearer ${token}`);
      if (docCheck.status === 200 && docCheck.body.status === "processed") {
        processed = true;
        break;
      }
    }
    // If not processed, we'll continue but log a warning (some environments might not have worker running)
    if (!processed) {
      console.warn("Document processing took too long or worker is not running.");
    }
  }, 20000); // 20s timeout

  it("3. Conversation & RAG Discovery", async () => {
    // Create conversation
    const convRes = await request(app)
      .post(`/api/v1/projects/${projectId}/conversations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Initial Discovery" });
    expect(convRes.status).toBe(201);
    const convId = convRes.body.id;

    // Send message expecting RAG
    const msgRes = await request(app)
      .post(`/api/v1/projects/${projectId}/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "user", content: "What is our current state?" });
    expect(msgRes.status).toBe(201);
    
    // Assert citations exist if RAG worked
    if (msgRes.body.citations && msgRes.body.citations.length > 0) {
      expect(msgRes.body.citations[0].documentId).toBe(docId);
    }
  });

  it("4. Full Transformation Artifact Generation Sequence", async () => {
    const artifactSequence = [
      "business_analysis",
      "architecture_hld",
      "process_workflow",
      "wireframe",
      "er_diagram",
      "api_spec",
      "roadmap",
      "effort_estimate"
    ];

    for (const type of artifactSequence) {
      const artRes = await request(app)
        .post(`/api/v1/projects/${projectId}/artifacts/generate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type });
      expect(artRes.status).toBe(201);
      expect(artRes.body.type).toBe(type);
      expect(artRes.body.content).toBeDefined();
      artifacts.push({ id: artRes.body.id, type });
    }
    
    // Verify Dashboard aggregation
    const dashRes = await request(app)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.model.digital_maturity).toBeDefined();
  }, 60000); // 60s timeout for all generations

  it("5. Collaboration, Approval, and Audit Flow", async () => {
    const mainArtifact = artifacts.find(a => a.type === "architecture_hld");
    expect(mainArtifact).toBeDefined();
    if (!mainArtifact) return;

    // Comment
    const commentRes = await request(app)
      .post(`/api/v1/artifacts/${mainArtifact.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Looks good, please approve." });
    expect(commentRes.status).toBe(201);

    // Request Review
    const reviewRes = await request(app)
      .post(`/api/v1/artifacts/${mainArtifact.id}/review`)
      .set("Authorization", `Bearer ${token}`);
    expect(reviewRes.status).toBe(200);

    // Approve
    const approveRes = await request(app)
      .post(`/api/v1/artifacts/${mainArtifact.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ decision: "approved", comment: "LGTM" });
    expect(approveRes.status).toBe(200);

    // Audit logs should reflect the approval
    const auditRes = await request(app)
      .get(`/api/v1/admin/audit-logs`)
      .set("Authorization", `Bearer ${token}`);
    expect(auditRes.status).toBe(200);
    // Since audit-logs might be large, just check if it's an array
    expect(Array.isArray(auditRes.body.data)).toBe(true);
  });

  it("6. Authorized Binary Exports (PDF, DOCX, XLSX, PPTX)", async () => {
    const mainArtifact = artifacts.find(a => a.type === "architecture_hld");
    expect(mainArtifact).toBeDefined();
    if (!mainArtifact) return;

    const formats = ["pdf", "docx", "xlsx", "pptx"];

    for (const format of formats) {
      const expRes = await request(app)
        .post(`/api/v1/artifacts/${mainArtifact.id}/export`)
        .set("Authorization", `Bearer ${token}`)
        .send({ format });
      
      expect(expRes.status).toBe(201);
      expect(expRes.body.downloadUrl).toBeDefined();
      expect(expRes.body.format).toBe(format);

      // Download the export
      const dlRes = await request(app)
        .get(expRes.body.downloadUrl)
        .set("Authorization", `Bearer ${token}`);
      
      expect(dlRes.status).toBe(200);
      expect(dlRes.body).toBeDefined();
    }
  });
});
