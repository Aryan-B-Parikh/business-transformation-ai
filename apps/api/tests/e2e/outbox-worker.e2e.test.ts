import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";

describe("Phase 33 - Transactional Outbox and Worker E2E", () => {
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

  it("should insert outbox event transactionally with domain mutation", async () => {
    if (!dbUrl) return;
    const orgId = "22222222-2222-2222-2222-222222222222";
    
    await withTenant(prisma, orgId, async (tx) => {
      // 1. Domain Mutation & Outbox insert in same transaction
      await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "WS", createdBy: orgId } });
      await tx.project.create({
        data: {
          id: "proj-outbox-test",
          orgId,
          workspaceId: orgId,
          name: "Outbox Project",
        }
      });
      
      await tx.outboxEvent.create({
        data: {
          id: "eeeeeeee-1111-1111-1111-111111111111",
          orgId,
          eventType: "project.created",
          payload: { projectId: "proj-outbox-test" },
          status: "pending",
        }
      });
    });

    // Verify it was committed
    await withTenant(prisma, orgId, async (tx) => {
      const event = await tx.outboxEvent.findUnique({ where: { id: "eeeeeeee-1111-1111-1111-111111111111" } });
      expect(event).toBeDefined();
      expect(event?.status).toBe("pending");
    });
  });

  it("should rollback outbox event if domain mutation fails", async () => {
    if (!dbUrl) return;
    const orgId = "33333333-3333-3333-3333-333333333333";
    
    try {
      await withTenant(prisma, orgId, async (tx) => {
        await tx.outboxEvent.create({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            orgId,
            eventType: "project.created",
            payload: { projectId: "failed" },
            status: "pending",
          }
        });
        
        // Force a failure
        throw new Error("Simulated domain error");
      });
    } catch (e) {
      // Expected
    }

    // Verify it was rolled back
    await withTenant(prisma, orgId, async (tx) => {
      const event = await tx.outboxEvent.findUnique({ where: { id: "11111111-1111-1111-1111-111111111111" } });
      expect(event).toBeNull(); // Should be null because transaction was rolled back
    });
  });
});
