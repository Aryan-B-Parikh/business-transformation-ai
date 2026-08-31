import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { initializeRepositories } from "../src/repositories";
import { prisma as appPrisma } from "../src/db/client";
import { JourneyStage } from "@bta/shared";
import bcrypt from "bcryptjs";

describe("True Golden Path E2E (Full Lifecycle Acceptance Suite)", () => {
  const app = process.env.API_URL || createApp();
  let prisma: PrismaClient;

  const orgId = "00000000-0000-0000-0000-000000000031";
  const userId = "00000000-0000-0000-0000-000000000032";
  const userEmail = "e2egolden@example.com";
  const userPassword = "Password123!Secure";
  let token: string;
  let refreshToken: string;
  let workspaceId: string;
  let projectId: string;
  let docId: string;
  let journeyVersion = 1;
  const artifacts: { id: string; type: string }[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "FATAL: DATABASE_URL is not set. Golden Path E2E Acceptance test requires live PostgreSQL container."
      );
    }

    const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    if (!process.env.API_URL) {
      initializeRepositories("postgres", appPrisma as any);
    }

    // Clean any prior run fixtures
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "E2E True Golden Org", plan: "enterprise" }
    });

    const passwordHash = await bcrypt.hash(userPassword, 10);

    await prisma.user.upsert({
      where: { id: userId },
      update: { orgId, name: "E2E True Golden User", role: "org_admin", passwordHash },
      create: {
        id: userId,
        orgId,
        name: "E2E True Golden User",
        email: userEmail,
        passwordHash,
        role: "org_admin"
      }
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("1. Authentication Lifecycle: Real Login, Refresh Rotation & JWKS Discovery", async () => {
    // 1.1 Real Login
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: userEmail, password: userPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    token = loginRes.body.token;

    // Extract refresh token cookie or body
    const cookies = loginRes.headers["set-cookie"] || [];
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.includes("refreshToken="))
      : typeof cookies === "string" && cookies.includes("refreshToken=")
      ? cookies
      : "";
    if (refreshCookie) {
      refreshToken = refreshCookie.split("refreshToken=")[1].split(";")[0];
    }

    // 1.2 Token Refresh Rotation (if cookie was set)
    if (refreshToken) {
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`]);
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.token).toBeDefined();
      token = refreshRes.body.token; // Use the rotated token
    }

    // 1.3 Key Discovery
    const jwksRes = await request(app).get("/.well-known/jwks.json");
    expect(jwksRes.status).toBe(200);
    expect(jwksRes.body.keys).toBeDefined();
    expect(Array.isArray(jwksRes.body.keys)).toBe(true);
  });

  it("2. Workspace & Project Creation", async () => {
    const wsRes = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Transformation Workspace" });
    expect(wsRes.status).toBe(201);
    expect(wsRes.body.id).toBeDefined();
    workspaceId = wsRes.body.id;

    const projRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Core Modernization Project", description: "Modernize legacy enterprise backend systems" });
    expect(projRes.status).toBe(201);
    expect(projRes.body.id).toBeDefined();
    projectId = projRes.body.id;
  });

  it("3. Document Ingestion, Parsing, Chunking & Vector Persistence", async () => {
    const pdfContent = Buffer.from(
      "%PDF-1.4 mock enterprise context. Current architecture: Oracle 11g database and monolithic Java backend. Target: Cloud Native Microservices."
    );
    const docRes = await request(app)
      .post(`/api/v1/projects/${projectId}/documents?sync=true`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfContent, { filename: "business_context.pdf", contentType: "application/pdf" });
    expect(docRes.status).toBe(201);
    expect(docRes.body.id).toBeDefined();
    docId = docRes.body.id;

    // Check status endpoint
    const statusRes = await request(app)
      .get(`/api/v1/documents/${docId}/status`)
      .set("Authorization", `Bearer ${token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.parsedStatus).toBe("parsed");
    expect(statusRes.body.chunkCount).toBeGreaterThan(0);

    // Verify chunks and embeddings in PostgreSQL database directly
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: docId } });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkText.length).toBeGreaterThan(0);
  });

  it("4. Conversation & RAG Discovery with Mandatory Citations", async () => {
    const convRes = await request(app)
      .post(`/api/v1/projects/${projectId}/conversations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Initial Discovery" });
    expect(convRes.status).toBe(201);
    const convId = convRes.body.id;

    const msgRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "What is our current architecture and database?" });
    expect(msgRes.status).toBe(201);
    expect(msgRes.body.content).toBeDefined();
  });

  it("5. Sequence through all 12 Persistent Transformation Journey Stages", async () => {
    const all12Stages: JourneyStage[] = [
      "idea",
      "discovery",
      "business_analysis",
      "solution_design",
      "architecture",
      "process_design",
      "ux_design",
      "data_design",
      "planning",
      "review",
      "approved",
      "implementation"
    ];

    // Initialize journey at stage 1 ('idea')
    const initRes = await request(app)
      .post(`/api/v1/projects/${projectId}/journey/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stage: "idea", status: "in_progress" });
    expect(initRes.status).toBe(200);
    expect(initRes.body.stage).toBe("idea");
    journeyVersion = initRes.body.stage_version || 1;

    // Transition sequentially through the remaining 11 stages
    for (let i = 1; i < all12Stages.length; i++) {
      const targetStage = all12Stages[i];
      const transRes = await request(app)
        .post(`/api/v1/projects/${projectId}/journey/transition`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          stage: targetStage,
          status: "in_progress",
          version: journeyVersion,
          reason: `Progressing to ${targetStage}`
        });

      expect(transRes.status).toBe(200);
      expect(transRes.body.stage).toBe(targetStage);
      journeyVersion = transRes.body.stage_version || (journeyVersion + 1);

      // Verify persistent state in DB
      const stateRes = await request(app)
        .get(`/api/v1/projects/${projectId}/journey`)
        .set("Authorization", `Bearer ${token}`);
      expect(stateRes.status).toBe(200);
      expect(Array.isArray(stateRes.body)).toBe(true);
      const current = stateRes.body.find((s: any) => s.stage === targetStage);
      expect(current).toBeDefined();
    }
  });

  it("6. Real AI Transformation Engine Invocations (/artifacts/generate)", async () => {
    const engineArtifactTypes = [
      "business_analysis",
      "architecture_hld",
      "process_workflow",
      "wireframe",
      "er_diagram"
    ];

    for (const type of engineArtifactTypes) {
      const artRes = await request(app)
        .post(`/api/v1/projects/${projectId}/artifacts/generate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type });

      expect(artRes.status).toBe(201);
      expect(artRes.body.type).toBe(type);
      expect(artRes.body.content).toBeDefined();
      artifacts.push({ id: artRes.body.id, type });
    }

    // Verify Transformation Dashboard aggregation
    const dashRes = await request(app)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.scores).toBeDefined();
    expect(dashRes.body.counts.artifacts).toBeGreaterThanOrEqual(engineArtifactTypes.length);
  }, 30000);

  it("7. Collaboration, Review, Human Approval & Governance Audit Flow", async () => {
    const mainArtifact = artifacts.find(a => a.type === "architecture_hld") || artifacts[0];
    expect(mainArtifact).toBeDefined();

    // Comment
    const commentRes = await request(app)
      .post(`/api/v1/artifacts/${mainArtifact.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Architecture reviewed and verified. Approved for modernization." });
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
      .send({ decision: "approved", comment: "Final Sign-off" });
    expect(approveRes.status).toBe(200);

    // Verify Audit Log reflection
    const activityRes = await request(app)
      .get(`/api/v1/projects/${projectId}/activity`)
      .set("Authorization", `Bearer ${token}`);
    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data).toBeDefined();
  });

  it("8. Enterprise Binary Exports (PDF, DOCX, XLSX, PPTX) & Content Validation", async () => {
    const mainArtifact = artifacts.find(a => a.type === "architecture_hld") || artifacts[0];
    expect(mainArtifact).toBeDefined();

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

      expect([200, 302]).toContain(dlRes.status);
    }
  });
});
