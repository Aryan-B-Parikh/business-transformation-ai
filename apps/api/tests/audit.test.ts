import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "../src/services/audit";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

describe.skipIf(!process.env.DATABASE_URL)("Phase 20: Audit Logging", () => {
  const orgId = uuidv4();
  const actorId = uuidv4();

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: orgId, name: "Audit Org" } });
    await prisma.user.create({ data: { id: actorId, orgId, email: "audit@test.com", name: "A", role: "admin" } });
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  it("should create an immutable audit log with IP and Request ID", async () => {
    const log = await createAuditLog({
      orgId,
      actorId,
      action: "PROJECT_CREATED",
      targetId: "proj-1",
      ipAddress: "192.168.1.1",
      requestId: "req-xyz-123",
      metadata: { key: "value" }
    });

    expect(log.action).toBe("PROJECT_CREATED");
    expect(log.ipAddress).toBe("192.168.1.1");
    expect(log.requestId).toBe("req-xyz-123");
    
    // In PostgreSQL, this row is isolated by tenant
    const fetched = await prisma.auditLog.findFirst({ where: { orgId } });
    expect(fetched?.id).toBe(log.id);
  });
});
