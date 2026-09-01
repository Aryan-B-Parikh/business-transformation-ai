import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/db/tenant";
import crypto from "crypto";

const prisma = new PrismaClient();

describe.skipIf(!process.env.DATABASE_URL)("Phase 2.3: RLS Attack Suite", () => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const wsA = crypto.randomUUID();
  const wsB = crypto.randomUUID();

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`INSERT INTO organizations (id, name, created_at) VALUES ('${orgA}', 'Org A', now()), ('${orgB}', 'Org B', now())`);
    await prisma.$executeRawUnsafe(`INSERT INTO workspaces (id, org_id, name, created_at) VALUES ('${wsA}', '${orgA}', 'WS A', now()), ('${wsB}', '${orgB}', 'WS B', now())`);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ('${orgA}', '${orgB}')`);
    await prisma.$disconnect();
  });

  it("Cannot read across tenants (leakage attack)", async () => {
    await withTenant(prisma as any, orgA, async (tx: any) => {
      const workspaces = await tx.workspace.findMany();
      expect(workspaces.some((w: any) => w.orgId === orgB)).toBe(false);
      expect(workspaces.every((w: any) => w.orgId === orgA)).toBe(true);
    });
  });

  it("Cannot write across tenants (injection attack)", async () => {
    await withTenant(prisma as any, orgA, async (tx: any) => {
      await expect(tx.workspace.create({ data: { orgId: orgB, name: "Malicious WS" } })).rejects.toThrow();
    });
  });

  it("Connection pooling does not leak tenant context", async () => {
    await Promise.all(Array.from({ length: 50 }, (_, i) => {
      const currentOrg = i % 2 === 0 ? orgA : orgB;
      return withTenant(prisma as any, currentOrg, async (tx: any) => {
        const ws = await tx.workspace.findMany();
        expect(ws.every((w: any) => w.orgId === currentOrg)).toBe(true);
      });
    }));
  });
});
