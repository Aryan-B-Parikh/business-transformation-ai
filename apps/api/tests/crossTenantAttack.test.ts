import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RLS_TABLES, withTenant } from "../src/db/tenant";
import crypto from "crypto";

const prisma = new PrismaClient();

// Skip if no real DB is available
describe.skipIf(!process.env.DATABASE_URL)("Phase 2.3: RLS Attack Suite", () => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();

  beforeAll(async () => {
    // Insert organizations
    await prisma.$executeRawUnsafe(`INSERT INTO organizations (id, name, created_at) VALUES ('${orgA}', 'Org A', now()), ('${orgB}', 'Org B', now())`);
    // Insert workspaces
    await prisma.$executeRawUnsafe(`INSERT INTO workspaces (id, org_id, name, created_at, updated_at) VALUES ('${crypto.randomUUID()}', '${orgA}', 'WS A', now(), now()), ('${crypto.randomUUID()}', '${orgB}', 'WS B', now(), now())`);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ('${orgA}', '${orgB}')`);
    await prisma.$disconnect();
  });

  it("Cannot read across tenants (leakage attack)", async () => {
    // As orgA, we should not see orgB's workspaces
    await withTenant(prisma as any, orgA, async (tx: any) => {
      const workspaces = await tx.workspace.findMany();
      expect(workspaces.some((w: any) => w.orgId === orgB)).toBe(false);
    });
  });

  it("Cannot write across tenants (injection attack)", async () => {
    // As orgA, attempt to create a workspace for orgB
    await withTenant(prisma as any, orgA, async (tx: any) => {
      await expect(
        tx.workspace.create({
          data: {
            orgId: orgB,
            name: "Malicious WS",
          },
        })
      ).rejects.toThrow();
    });
  });

  it("Connection pooling does not leak tenant context", async () => {
    // Fire many concurrent requests alternating orgA and orgB
    const iterations = 50;
    const promises = [];

    for (let i = 0; i < iterations; i++) {
      const currentOrg = i % 2 === 0 ? orgA : orgB;
      promises.push(
        withTenant(prisma as any, currentOrg, async (tx: any) => {
          const ws = await tx.workspace.findMany();
          // Verify all returned workspaces belong to currentOrg
          if (ws.length > 0) {
            expect(ws.every((w: any) => w.orgId === currentOrg)).toBe(true);
          }
        })
      );
    }

    await Promise.all(promises);
  });
});
