import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";
import { randomUUID } from "crypto";

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
    const orgId = randomUUID();
    const workspaceId = randomUUID();
    const projectId = randomUUID();
    const eventId = randomUUID();
    
    await withTenant(prisma, orgId, async (tx) => {
      // 1. Domain Mutation & Outbox insert in same transaction
      await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
      await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
      await tx.workspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId, orgId, name: "WS", createdBy: orgId } });
      await tx.project.create({
        data: {
          id: projectId,
          orgId,
          workspaceId,
          name: "Outbox Project",
        }
      });
      
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          orgId,
          event_type: "project.created",
          aggregate_id: projectId,
          payload: { projectId },
          status: "pending",
        }
      });
    });

    // Verify it was committed
    await withTenant(prisma, orgId, async (tx) => {
      const event = await tx.outboxEvent.findUnique({ where: { id: eventId } });
      expect(event).toBeDefined();
      expect(event?.status).toBe("pending");
    });
  });

  it("should rollback outbox event if domain mutation fails", async () => {
    if (!dbUrl) return;
    const orgId = randomUUID();
    const eventId = randomUUID();
    
    try {
      await withTenant(prisma, orgId, async (tx) => {
        await tx.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Org", plan: "trial" } });
        await tx.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, orgId, name: "User", email: `${orgId}@example.com`, role: "org_admin" } });
        await tx.outboxEvent.create({
          data: {
            id: eventId,
            orgId,
            event_type: "project.created",
            aggregate_id: "failed",
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
      const event = await tx.outboxEvent.findUnique({ where: { id: eventId } });
      expect(event).toBeNull(); // Should be null because transaction was rolled back
    });
  });
});
