import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";

describe("Phase 33 - RLS Attack and Privilege Verification", () => {
  const dbUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient;

  beforeAll(() => {
    if (dbUrl) {
      prisma = new PrismaClient({
        datasources: { db: { url: dbUrl } },
      });
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("should enforce that bta_app is NOT a superuser", async () => {
    if (!dbUrl) return;
    const result: any = await prisma.$queryRaw`SELECT current_user, usesuper FROM pg_user WHERE usename = current_user`;
    expect(result[0].usesuper).toBe(false);
  });



  it("should prevent querying tenant tables without setting app.current_org_id", async () => {
    if (!dbUrl) return;
    // Attempting to select from projects without tenant context should return 0 rows
    // even if there are rows in the DB.
    
    // First, let's create a project using a valid tenant context
    const orgId = "11111111-1111-1111-1111-111111111111";
    
    await withTenant(prisma, orgId, async (tx) => {
      // Clean up previous test runs if any
      await tx.project.deleteMany({ where: { orgId } });
      await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "WS", createdBy: orgId } });
      await tx.project.create({
        data: {
          id: "00000000-0000-0000-0000-000000000001",
          orgId,
          workspaceId: orgId,
          name: "Secret Project",
        }
      });
    });

    // Now query OUTSIDE tenant context (bypassing withTenant)
    const projectsOutsideContext = await prisma.$queryRaw`SELECT * FROM projects`;
    expect(projectsOutsideContext).toEqual([]); // RLS hides all rows
  });

  it("should isolate tenants from each other (no cross-tenant leakage)", async () => {
    if (!dbUrl) return;
    const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    
    await withTenant(prisma, orgA, async (tx) => {
      await tx.project.deleteMany({ where: { orgId: orgA } });
      await tx.organization.upsert({ where: { id: orgA }, update: {}, create: { id: orgA, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgA }, update: {}, create: { id: orgA, orgId: orgA, name: "User", email: `${orgA}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgA }, update: {}, create: { id: orgA, orgId: orgA, name: "WS", createdBy: orgA } });
      await tx.project.create({
        data: { id: "00000000-0000-0000-0000-000000000002", orgId: orgA, workspaceId: orgA, name: "Project A" }
      });
    });

    await withTenant(prisma, orgB, async (tx) => {
      await tx.project.deleteMany({ where: { orgId: orgB } });
      await tx.organization.upsert({ where: { id: orgB }, update: {}, create: { id: orgB, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgB }, update: {}, create: { id: orgB, orgId: orgB, name: "User", email: `${orgB}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgB }, update: {}, create: { id: orgB, orgId: orgB, name: "WS", createdBy: orgB } });
      await tx.project.create({
        data: { id: "00000000-0000-0000-0000-000000000003", orgId: orgB, workspaceId: orgB, name: "Project B" }
      });
    });

    // Tenant A queries projects
    await withTenant(prisma, orgA, async (tx) => {
      const projects = await tx.project.findMany();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("proj-a");
    });

    // Tenant B queries projects
    await withTenant(prisma, orgB, async (tx) => {
      const projects = await tx.project.findMany();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("proj-b");
    });
  });
});
