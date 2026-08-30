import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processWebhookOutbox } from "../../src/services/webhook/deliveryWorker";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

describe.skipIf(!process.env.DATABASE_URL)("Phase 17: Webhook Delivery Worker", () => {
  const orgId = uuidv4();
  const projectId = uuidv4();
  let endpointIdSuccess: string;
  let endpointIdFail: string;

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: orgId, name: "Webhook Org" } });
    const ws = await prisma.workspace.create({ data: { orgId, name: "WS", createdBy: uuidv4() } });
    await prisma.project.create({ data: { id: projectId, orgId, workspaceId: ws.id, name: "Proj" } });
    
    const ep1 = await prisma.webhookEndpoint.create({
      data: { orgId, projectId, url: "https://success.com/hook", events: ["project.updated"], secret: "sec" }
    });
    endpointIdSuccess = ep1.id;

    const ep2 = await prisma.webhookEndpoint.create({
      data: { orgId, projectId, url: "https://fail.com/hook", events: ["project.updated"], secret: "sec" }
    });
    endpointIdFail = ep2.id;
  });

  beforeEach(async () => {
    await prisma.webhookDeliveryOutbox.deleteMany({});
  });

  it("should mark successful deliveries as success", async () => {
    await prisma.webhookDeliveryOutbox.create({
      data: { orgId, endpointId: endpointIdSuccess, event: "project.updated", payload: {} }
    });

    const results = await processWebhookOutbox();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("success");
    expect(results[0].attempts).toBe(1);
  });

  it("should apply exponential backoff on failure", async () => {
    await prisma.webhookDeliveryOutbox.create({
      data: { orgId, endpointId: endpointIdFail, event: "project.updated", payload: {} }
    });

    const results = await processWebhookOutbox();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pending");
    expect(results[0].attempts).toBe(1);
    
    // nextAttemptAt should be in the future
    expect(results[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("should mark as failed after MAX_RETRIES", async () => {
    await prisma.webhookDeliveryOutbox.create({
      data: { orgId, endpointId: endpointIdFail, event: "project.updated", payload: {}, attempts: 4 } // one attempt away from max
    });

    const results = await processWebhookOutbox();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
    expect(results[0].attempts).toBe(5);
  });
});
