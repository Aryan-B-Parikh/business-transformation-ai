import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/db/tenant";
import crypto from "crypto";

const prisma = new PrismaClient();
const adminPrisma = process.env.DATABASE_ADMIN_URL ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_ADMIN_URL } } }) : null;

describe.skipIf(!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL)("Phase 2.3: RLS Attack Suite", () => {
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const wsA = crypto.randomUUID();
  const wsB = crypto.randomUUID();

  beforeAll(async () => {
    if (!adminPrisma) throw new Error("DATABASE_ADMIN_URL is required for RLS fixture setup");
    await adminPrisma.$executeRawUnsafe(`INSERT INTO organizations (id, name, created_at) VALUES ('${orgA}', 'Org A', now()), ('${orgB}', 'Org B', now())`);
    await adminPrisma.$executeRawUnsafe(`INSERT INTO users (id, org_id, email, name, role, created_at) VALUES ('${crypto.randomUUID()}', '${orgA}', 'rls-a@example.test', 'RLS A', 'org_admin', now()), ('${crypto.randomUUID()}', '${orgB}', 'rls-b@example.test', 'RLS B', 'org_admin', now())`);
    await adminPrisma.$executeRawUnsafe(`INSERT INTO workspaces (id, org_id, name, created_by) SELECT '${wsA}', '${orgA}', 'WS A', id FROM users WHERE org_id='${orgA}' LIMIT 1`);
    await adminPrisma.$executeRawUnsafe(`INSERT INTO workspaces (id, org_id, name, created_by) SELECT '${wsB}', '${orgB}', 'WS B', id FROM users WHERE org_id='${orgB}' LIMIT 1`);
  });

  afterAll(async () => {
    if (adminPrisma) await adminPrisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ('${orgA}', '${orgB}')`);
    await prisma.$disconnect();
    if (adminPrisma) await adminPrisma.$disconnect();
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
      await expect(tx.workspace.create({ data: { orgId: orgB, name: "Malicious WS", createdBy: "11111111-1111-1111-1111-111111111111" } })).rejects.toThrow();
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
