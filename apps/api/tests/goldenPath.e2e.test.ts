import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { generateToken } from "../src/auth/jwt";

describe("Golden Path E2E (Phase 29)", () => {
  const app = createApp();
  let prisma: PrismaClient | undefined;

  const orgId = "00000000-0000-0000-0000-000000000021";
  const userId = "00000000-0000-0000-0000-000000000022";

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    // The application connection intentionally runs as bta_app and must never
    // bypass RLS. Test fixture creation is a separate privileged setup concern.
    const adminUrl = process.env.DATABASE_ADMIN_URL;
    if (!adminUrl) {
      throw new Error("DATABASE_ADMIN_URL is required for Golden Path fixture setup; never bypass RLS with the application connection.");
    }

    prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: "E2E Org", plan: "trial" }
    });

    await prisma.user.upsert({
      where: { id: userId },
      update: { orgId, name: "E2E User", role: "org_admin" },
      create: {
        id: userId,
        orgId,
        name: "E2E User",
        email: "e2e@example.com",
        role: "org_admin"
      }
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("should execute the full golden path: Org -> Workspace -> Project -> Document -> Chat -> Artifact -> Dashboard", async () => {
    const token = generateToken({
      userId,
      orgId,
      role: "org_admin",
      email: "e2e@example.com"
    });

    const wsRes = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Workspace" });
    expect(wsRes.status).toBe(201);
    const workspaceId = wsRes.body.id;

    const projRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Project", description: "Integration testing" });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.id;

    const docRes = await request(app)
      .post(`/api/v1/projects/${projectId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 mock content"), { filename: "e2e.pdf", contentType: "application/pdf" });
    expect(docRes.status).toBe(201);

    const artRes = await request(app)
      .post(`/api/v1/projects/${projectId}/artifacts/generate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "architecture_hld" });
    expect(artRes.status).toBe(201);

    const dashRes = await request(app)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.digital_maturity).toBeDefined();
  });
});
