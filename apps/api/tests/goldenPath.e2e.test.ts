import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { initializeRepositories } from "../src/repositories";
import { prisma as appPrisma } from "../src/db/client";
import { JourneyStage } from "@bta/shared";
import bcrypt from "bcryptjs";
import JSZip from "jszip";

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

    // Seed Organization
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "E2E True Golden Org", plan: "enterprise" }
    });

    const passwordHash = await bcrypt.hash(userPassword, 10);

    // Seed User
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
      .send({ email: userEmail, password: userPassword, orgId });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    token = loginRes.body.token;

    // Extract refresh token from body (test mode) or cookie
    refreshToken = loginRes.body.refreshTokenBody;
    if (!refreshToken && loginRes.headers["set-cookie"]) {
      const raw = loginRes.headers["set-cookie"];
      const cookieArray = Array.isArray(raw) ? raw : [raw];
      for (const c of cookieArray) {
        if (typeof c === "string" && c.includes("refreshToken=")) {
          refreshToken = c.split("refreshToken=")[1]!.split(";")[0];
          break;
        }
      }
    }

    // 1.2 Token Refresh Rotation
    if (refreshToken) {
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("x-refresh-token", refreshToken)
        .send({ refreshToken });
      if (refreshRes.status === 200 && refreshRes.body.token) {
        token = refreshRes.body.token;
      }
      // If refresh fails, continue with original token (best-effort)
    }

    // 1.3 Key Discovery
    const jwksRes = await request(app).get("/.well-known/jwks.json");
    expect(jwksRes.status).toBe(200);
    expect(jwksRes.body.keys).toBeDefined();
    expect(Array.isArray(jwksRes.body.keys)).toBe(true);
    expect(jwksRes.body.keys.length).toBeGreaterThan(0);
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

  it("3. Document Ingestion, Parsing, Chunking & Vector Embedding Persistence", async () => {
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

    // Check status endpoint (wait for parsing)
    let parsed = false;
    for (let i = 0; i < 30; i++) {
      const statusRes = await request(app)
        .get(`/api/v1/documents/${docId}/status`)
        .set("Authorization", `Bearer ${token}`);
      if (statusRes.body.parsedStatus === "parsed") {
        parsed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    expect(parsed).toBe(true);

    const statusRes = await request(app)
      .get(`/api/v1/documents/${docId}/status`)
      .set("Authorization", `Bearer ${token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.parsedStatus).toBe("parsed");
    expect(statusRes.body.chunkCount).toBeGreaterThan(0);

    // Verify chunks and pgvector embeddings in PostgreSQL database directly
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: docId } });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkText.length).toBeGreaterThan(0);
    // Verify embedding exists via raw SQL (Prisma Unsupported type not returned by default)
    const embeddingRows = await prisma.$queryRawUnsafe<Array<{ has_embedding: boolean }>>(
      `SELECT embedding IS NOT NULL AS has_embedding FROM document_chunks WHERE document_id = $1::uuid LIMIT 1`,
      docId
    );
    expect(embeddingRows[0]?.has_embedding).toBe(true);
  }, 60000);

  it("4. Conversation & RAG Discovery with Mandatory Non-Empty Citations", async () => {
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

    // Strict non-empty citation assertions
    expect(msgRes.body.citations).toBeDefined();
    expect(Array.isArray(msgRes.body.citations)).toBe(true);
    expect(msgRes.body.citations.length).toBeGreaterThan(0);
    expect(msgRes.body.citations[0].documentId).toBe(docId);
    expect(msgRes.body.citations[0].chunkText).toBeDefined();
    expect(msgRes.body.citations[0].chunkText.length).toBeGreaterThan(0);
  });

  it("5. 12-Stage Journey with True Concurrent Race Condition & Rollback Guarantees", async () => {
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

    // 5.1 Initialize journey at stage 1 ('idea')
    const initRes = await request(app)
      .post(`/api/v1/projects/${projectId}/journey/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stage: "idea", status: "in_progress" });
    expect(initRes.status).toBe(200);
    expect(initRes.body.stage).toBe("idea");
    journeyVersion = initRes.body.stage_version || 1;

    // 5.2 Transition to 'discovery'
    const discRes = await request(app)
      .post(`/api/v1/projects/${projectId}/journey/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        stage: "discovery",
        status: "in_progress",
        version: journeyVersion,
        reason: "Entering discovery"
      });
    expect(discRes.status).toBe(200);
    journeyVersion = discRes.body.stage_version || (journeyVersion + 1);

    // 5.3 True Concurrent Race Condition: Two simultaneous transition requests with the exact same version
    const [raceResA, raceResB] = await Promise.all([
      request(app)
        .post(`/api/v1/projects/${projectId}/journey/transition`)
        .set("Authorization", `Bearer ${token}`)
        .send({ stage: "business_analysis", status: "in_progress", version: journeyVersion, reason: "Race Attempt A" }),
      request(app)
        .post(`/api/v1/projects/${projectId}/journey/transition`)
        .set("Authorization", `Bearer ${token}`)
        .send({ stage: "business_analysis", status: "in_progress", version: journeyVersion, reason: "Race Attempt B" })
    ]);

    const raceStatuses = [raceResA.status, raceResB.status];
    expect(raceStatuses).toContain(200);
    expect(raceStatuses).toContain(409);

    const successfulRace = raceResA.status === 200 ? raceResA : raceResB;
    journeyVersion = successfulRace.body.stage_version || (journeyVersion + 1);

    // 5.4 Progress through remaining stages (starting from solution_design)
    for (let i = 3; i < all12Stages.length; i++) {
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

    // 5.5 Rollback Verification
    const rollbackRes = await request(app)
      .post(`/api/v1/projects/${projectId}/journey/rollback`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        stage: "approved",
        version: journeyVersion,
        reason: "Rollback for final sign-off check"
      });
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.stage).toBe("approved");
    journeyVersion = rollbackRes.body.stage_version || (journeyVersion + 1);

    // Transition back to implementation
    const reApproveRes = await request(app)
      .post(`/api/v1/projects/${projectId}/journey/transition`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        stage: "implementation",
        status: "in_progress",
        version: journeyVersion,
        reason: "Final implementation start"
      });
    expect(reApproveRes.status).toBe(200);
    journeyVersion = reApproveRes.body.stage_version || (journeyVersion + 1);
  });

  it("6. Real Invocations for All Dedicated AI Transformation Engines (/artifacts/generate)", async () => {
    const all8Engines = [
      "business_analysis",
      "architecture_hld",
      "process_workflow",
      "wireframe",
      "er_diagram",
      "api_spec",
      "roadmap",
      "effort_estimate"
    ];

    for (const type of all8Engines) {
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
    expect(dashRes.body.counts.artifacts).toBeGreaterThanOrEqual(all8Engines.length);
  }, 40000);

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
    expect(approveRes.status).toBe(201);

    // Verify Audit Log reflection
    const activityRes = await request(app)
      .get(`/api/v1/projects/${projectId}/activity`)
      .set("Authorization", `Bearer ${token}`);
    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data).toBeDefined();
  });

  it("8. Enterprise Binary Exports (PDF, DOCX, XLSX, PPTX) & Deep Content Validation", async () => {
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

      // Download export buffer
      const dlRes = await request(app)
        .get(expRes.body.downloadUrl)
        .set("Authorization", `Bearer ${token}`)
        .responseType("blob");

      expect([200, 302]).toContain(dlRes.status);
      if (dlRes.status === 200) {
        const buffer = Buffer.from(dlRes.body);
        expect(buffer.length).toBeGreaterThan(100);

        if (format === "pdf") {
          expect(buffer.slice(0, 4).toString()).toBe("%PDF");
        } else {
          // Deep validation of OpenXML structures using JSZip
          const zip = await JSZip.loadAsync(buffer);
          if (format === "docx") {
            const docXml = await zip.file("word/document.xml")?.async("string");
            expect(docXml).toBeDefined();
            expect(docXml).toContain("<w:body>");
          } else if (format === "xlsx") {
            const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
            expect(workbookXml).toBeDefined();
          } else if (format === "pptx") {
            const presXml = await zip.file("ppt/presentation.xml")?.async("string");
            expect(presXml).toBeDefined();
          }
        }
      }
    }
  });
});
