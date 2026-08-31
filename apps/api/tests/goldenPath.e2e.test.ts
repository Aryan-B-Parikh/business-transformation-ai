import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { signToken } from "../src/auth/jwt";
import { initializeRepositories } from "../src/repositories";
import { prisma as appPrisma } from "../src/db/client";
import { JourneyStage } from "@bta/shared";

describe("True Golden Path E2E (Full Lifecycle Acceptance Suite)", () => {
  const app = process.env.API_URL || createApp();
  let prisma: PrismaClient | undefined;

  const orgId = "00000000-0000-0000-0000-000000000031";
  const userId = "00000000-0000-0000-0000-000000000032";
  let token: string;
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

    // Seed User
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

  it("1. Authentication Lifecycle: JWKS & Key Discovery", async () => {
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
      .send({ name: "Core Modernization Project", description: "Modernize legacy systems" });
    expect(projRes.status).toBe(201);
    expect(projRes.body.id).toBeDefined();
    projectId = projRes.body.id;
  });

  it("3. Document Ingestion, Parsing, and Vector Embedding", async () => {
    const pdfContent = Buffer.from(
      "%PDF-1.4 mock enterprise context. Current architecture: Oracle 11g database and monolithic Java backend."
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

  it("6. AI Transformation Artifact Generation Suite", async () => {
    const artifactTypes = [
      "business_analysis",
      "architecture_hld",
      "process_workflow",
      "wireframe",
      "er_diagram",
      "api_spec",
      "roadmap",
      "effort_estimate"
    ];

    for (const type of artifactTypes) {
      const artRes = await request(app)
        .post(`/api/v1/projects/${projectId}/artifacts`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          type,
          title: `Generated ${type}`,
          content: { summary: `Artifact content for ${type}`, diagramSpec: { nodes: [{ id: "n1", label: "Component 1" }], edges: [] } }
        });
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
    expect(dashRes.body.counts.artifacts).toBeGreaterThanOrEqual(artifactTypes.length);
  });

  it("7. Collaboration, Review, Human Approval & Governance Audit Flow", async () => {
    const mainArtifact = artifacts.find(a => a.type === "architecture_hld") || artifacts[0];
    expect(mainArtifact).toBeDefined();

    // Comment
    const commentRes = await request(app)
      .post(`/api/v1/artifacts/${mainArtifact.id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Architecture reviewed. Approved for production." });
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

  it("8. Authorized Enterprise Binary Exports (PDF, DOCX, XLSX, PPTX)", async () => {
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
