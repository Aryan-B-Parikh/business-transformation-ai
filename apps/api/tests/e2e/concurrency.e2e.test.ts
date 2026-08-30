import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../../src/db/tenant";

describe("Phase 33 - Concurrency and Load E2E", () => {
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

  it("should handle 50 concurrent tenant operations without pool leakage", async () => {
    if (!dbUrl) return;
    const orgId = "55555555-5555-5555-5555-555555555555";
    
    // It is critical that prisma doesn't leak connections or throw connection pool errors
    const operations = Array.from({ length: 50 }).map(async (_, i) => {
      return withTenant(prisma, orgId, async (tx) => {
        // Just a simple query
        const count = await tx.project.count({ where: { orgId } });
        return count;
      });
    });

    const results = await Promise.all(operations);
    expect(results).toHaveLength(50);
    expect(results[0]).toBeGreaterThanOrEqual(0);
  });
});
