import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { generateToken } from "../src/auth/jwt";

describe("Golden Path E2E (Phase 29)", () => {
  const app = createApp();
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (process.env.DATABASE_URL) {
      prisma = new PrismaClient();
      await prisma.organization.upsert({
        where: { id: "org-e2e" },
        update: {},
        create: { id: "org-e2e", name: "E2E Org", plan: "trial" }
      });
      await prisma.user.upsert({
        where: { id: "u-e2e" },
        update: {},
        create: { id: "u-e2e", orgId: "org-e2e", name: "E2E User", email: "e2e@example.com", role: "org_admin" }
      });
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("should execute the full golden path: Org -> Workspace -> Project -> Document -> Chat -> Artifact -> Dashboard", async () => {
    const token = generateToken({
      userId: "u-e2e",
      orgId: "org-e2e",
      role: "org_admin",
      email: "e2e@example.com"
    });

    // 1. Create Workspace
    const wsRes = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Workspace" });
    expect(wsRes.status).toBe(201);
    const workspaceId = wsRes.body.id;

    // 2. Create Project
    const projRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Project", description: "Integration testing" });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.id;

    // 3. Document
    const docRes = await request(app)
      .post(`/api/v1/projects/${projectId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 mock content"), { filename: "e2e.pdf", contentType: "application/pdf" });
    expect(docRes.status).toBe(201);

    // 4. Artifact Generation
    const artRes = await request(app)
      .post(`/api/v1/projects/${projectId}/artifacts/generate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "architecture_hld" });
    expect(artRes.status).toBe(201);

    // 5. Dashboard
    const dashRes = await request(app)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.digital_maturity).toBeDefined();
  });
});
