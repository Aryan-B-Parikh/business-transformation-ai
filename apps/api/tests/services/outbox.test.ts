import { describe, it, expect } from "vitest";
import { getRepositories } from "../../src/repositories";
import { OutboxService } from "../../src/services/outboxService";

describe("Phase 4: Transactional Outbox Processing", () => {
  const orgId = "org-outbox-test";
  const repos = getRepositories();

  it("queues and processes outbox events", async () => {
    const event = await repos.webhooks.queueOutboxEvent(
      orgId,
      "artifact.created",
      "art-123",
      { title: "HLD Blueprint", version: 1 }
    );

    expect(event.id).toBeDefined();
    expect(event.status).toBe("pending");

    const pending = await repos.webhooks.listPendingOutboxEvents(10);
    expect(pending.some((p) => p.id === event.id)).toBe(true);

    const result = await OutboxService.processPendingEvents(10);
    expect(result.processed).toBeGreaterThanOrEqual(1);
  });
});
